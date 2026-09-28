import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Thumb } from "./add-products-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, parseQuantity, qty } from "@/lib/inventory";
import { manageInventoryEvaluation, type CycleStatus } from "@/lib/inventory-cycle.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { LIST_STATUS_LABEL, type ShoppingListRow } from "@/lib/shopping-list";
import { addShoppingListItems } from "@/lib/shopping-list.functions";

type CountedRow = {
  product_id: string;
  location_id: string;
  code: string;
  description: string | null;
  category: string | null;
  counted: number;
  unit: string | null;
  stock: number | null;
};

export const CYCLE_QUERY_KEY = "inventory-cycle-status";

/**
 * Ponte Inventario → Lista della Spesa.
 * I prodotti contati diventano righe della Lista solo con una quantità > 0 scritta dall'operatore:
 * vuoto significa "non deciso", mai 0.
 */
export function InventoryEvaluation({
  companyId,
  cycle,
  currentList,
  currentListItems,
  existingProductIds,
  creatingList,
  onCreateList,
}: {
  companyId: string;
  cycle: CycleStatus;
  currentList: ShoppingListRow | null;
  currentListItems: number;
  existingProductIds: Set<string>;
  creatingList: boolean;
  onCreateList: () => Promise<string | null>;
}) {
  const queryClient = useQueryClient();
  const runEvaluation = useServerFn(manageInventoryEvaluation);
  const runAdd = useServerFn(addShoppingListItems);
  const getImageUrls = useServerFn(getProductImageUrls);
  const [values, setValues] = useState<Record<string, string>>({});
  const [finishOpen, setFinishOpen] = useState(false);

  const sessionId = cycle.session_id!;
  const linkedListId = cycle.list_id ?? null;
  const linkedHere = Boolean(linkedListId && currentList?.id === linkedListId);

  const refreshCycle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
    ]);

  const countsQuery = useQuery({
    queryKey: ["inventory-evaluation-counts", sessionId],
    queryFn: async (): Promise<CountedRow[]> => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("product_id, location_id, counted_quantity, unit_code, counted_at, products(code, description, category)")
        .eq("company_id", companyId)
        .eq("session_id", sessionId)
        .order("counted_at", { ascending: false });
      if (error) throw new Error(error.message);
      const { data: session } = await supabase
        .from("inventory_sessions")
        .select("archive_id")
        .eq("id", sessionId)
        .maybeSingle();
      // Ultimo conteggio per prodotto (in caso di riconteggio).
      const latest = new Map<string, CountedRow>();
      for (const row of (data ?? []) as unknown as {
        product_id: string;
        location_id: string;
        counted_quantity: number;
        unit_code: string | null;
        products: { code: string; description: string | null; category: string | null } | null;
      }[]) {
        if (latest.has(row.product_id)) continue;
        latest.set(row.product_id, {
          product_id: row.product_id,
          location_id: row.location_id,
          code: row.products?.code ?? "",
          description: row.products?.description ?? null,
          category: row.products?.category ?? null,
          counted: Number(row.counted_quantity),
          unit: row.unit_code,
          stock: null,
        });
      }
      const rows = [...latest.values()];
      if (session?.archive_id) {
        for (const locationId of new Set(rows.map((row) => row.location_id))) {
          const { data: stock } = await supabase.rpc("inventory_location_stock_list", {
            _company_id: companyId,
            _archive_id: session.archive_id,
            _location_id: locationId,
          });
          const map = new Map(
            ((stock ?? []) as { product_id: string; has_count: boolean; quantity: number }[]).map((s) => [
              s.product_id,
              s.has_count ? Number(s.quantity) : null,
            ]),
          );
          for (const row of rows) if (row.location_id === locationId) row.stock = map.get(row.product_id) ?? null;
        }
      }
      return rows.sort((left, right) => left.code.localeCompare(right.code, "it"));
    },
  });

  const allCounted = countsQuery.data ?? [];
  const toEvaluate = allCounted.filter((row) => !existingProductIds.has(row.product_id));
  const imageIds = useMemo(() => allCounted.slice(0, 50).map((row) => row.product_id), [allCounted]);
  const imagesQuery = useQuery({
    queryKey: ["inventory-evaluation-images", imageIds],
    enabled: imageIds.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: () => getImageUrls({ data: { productIds: imageIds, thumbnail: true } }),
  });
  const images = new Map((imagesQuery.data ?? []).map((image) => [image.productId, image.url]));

  const takeMutation = useMutation({
    mutationFn: async (listId: string) =>
      runEvaluation({ data: { companyId, sessionId, action: "take", listId } }),
    onSuccess: async () => {
      await refreshCycle();
      toast.success("Inventario preso in carico nella Lista");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addMutation = useMutation({
    mutationFn: (items: { product_id: string; quantity: number }[]) =>
      runAdd({
        data: {
          companyId,
          listId: currentList!.id,
          replaceExisting: false,
          items: items.map((item) => ({
            product_id: item.product_id,
            decided_quantity: item.quantity,
            origin: "manuale" as const,
          })),
        },
      }),
    onSuccess: async (result, items) => {
      setValues((current) => {
        const next = { ...current };
        for (const item of items) delete next[item.product_id];
        return next;
      });
      await refreshCycle();
      toast.success(`${result.added} prodotti aggiunti alla Lista`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finishMutation = useMutation({
    mutationFn: () => runEvaluation({ data: { companyId, sessionId, action: "finish", listId: null } }),
    onSuccess: async () => {
      setFinishOpen(false);
      await refreshCycle();
      toast.success("Valutazione dell'inventario terminata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inventoryLabel = `Inventario del ${cycle.finished_at ? dateTimeShort(cycle.finished_at) : "—"}`;
  const typed = toEvaluate
    .map((row) => ({ product_id: row.product_id, quantity: parseQuantity(values[row.product_id] ?? "") }))
    .filter((row): row is { product_id: string; quantity: number } => row.quantity !== null && row.quantity > 0);
  const invalid = toEvaluate.filter((row) => {
    const raw = (values[row.product_id] ?? "").trim();
    if (!raw) return false;
    const value = parseQuantity(raw);
    return value === null || value <= 0;
  });

  // Valutazione terminata: resta solo da trasformare gli acquisti in ordini.
  if (cycle.evaluated_at) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <span>
          <span className="font-semibold">Ciclo acquisti da completare:</span> valutazione terminata,{" "}
          {cycle.missing_orders} acquisti ancora senza ordine.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/acquisti/ordini">Vai agli Ordini</Link>
        </Button>
      </div>
    );
  }

  // Non ancora presa in carico (o Lista precedente annullata/chiusa).
  if (!linkedHere) {
    return (
      <div className="space-y-2 rounded-md border border-primary/50 bg-primary/5 p-3">
        <p className="text-sm font-semibold">
          {inventoryLabel} completato · {allCounted.length} prodotti controllati
        </p>
        {currentList && currentList.status === "aperta" ? (
          <>
            <p className="text-sm">
              <span className="font-medium">Esiste già una Lista della Spesa in lavorazione:</span> {currentList.name} ·
              creata {dateTimeShort(currentList.created_at)} · {currentListItems} prodotti ·{" "}
              {LIST_STATUS_LABEL[currentList.status]}
            </p>
            <Button size="sm" disabled={takeMutation.isPending} onClick={() => takeMutation.mutate(currentList.id)}>
              Continua questa Lista e valuta i prodotti dell'inventario
            </Button>
          </>
        ) : currentList && currentList.status === "confermata" ? (
          <p className="text-sm">
            <span className="font-medium">Esiste già una Lista della Spesa in lavorazione:</span> {currentList.name} ·{" "}
            {currentListItems} prodotti · Confermata. Una Lista confermata non accetta nuovi prodotti: chiudila dopo aver
            creato gli ordini, poi potrai valutare questo inventario in una nuova Lista.
          </p>
        ) : (
          <Button
            size="sm"
            disabled={creatingList || takeMutation.isPending}
            onClick={async () => {
              const id = await onCreateList();
              if (id) takeMutation.mutate(id);
            }}
          >
            <ClipboardCheck aria-hidden="true" />
            Crea Lista della Spesa da questo inventario
          </Button>
        )}
      </div>
    );
  }

  const editable = currentList?.status === "aperta";
  const leftEmpty = toEvaluate.filter((row) => !(values[row.product_id] ?? "").trim()).length;

  return (
    <div className="space-y-2 rounded-md border border-primary/50 bg-primary/5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-semibold">
          Prodotti da valutare · {inventoryLabel}{" "}
          <span className="font-normal text-muted-foreground">
            ({toEvaluate.length} da valutare su {allCounted.length} contati)
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button
              size="sm"
              disabled={!typed.length || invalid.length > 0 || addMutation.isPending}
              onClick={() => addMutation.mutate(typed)}
            >
              Aggiungi alla Lista ({typed.length})
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setFinishOpen(true)}>
            Termina valutazione
          </Button>
        </div>
      </div>
      {invalid.length ? (
        <p className="px-1 text-xs text-destructive">Scrivi una quantità maggiore di zero oppure lascia il campo vuoto.</p>
      ) : null}
      {toEvaluate.length ? (
        <div className="divide-y divide-border overflow-hidden rounded border border-border bg-card">
          {toEvaluate.map((row) => (
            <div
              key={row.product_id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-xs sm:grid-cols-[auto_5rem_minmax(0,1fr)_8rem_8rem_8rem_auto]"
            >
              <Thumb url={images.get(row.product_id) ?? null} />
              <span className="hidden font-mono sm:block">{row.code}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  <span className="font-mono sm:hidden">{row.code} · </span>
                  {row.description ?? "—"}
                </span>
                <span className="block truncate text-muted-foreground">
                  {row.category ?? "—"}
                  <span className="sm:hidden">
                    {" "}
                    · contato {qty(row.counted)} {row.unit ?? ""} · giacenza{" "}
                    {row.stock === null ? "—" : `${qty(row.stock)} ${row.unit ?? ""}`}
                  </span>
                </span>
              </span>
              <span className="hidden sm:block">
                Contato <span className="font-semibold">{qty(row.counted)} {row.unit ?? ""}</span>
              </span>
              <span className="hidden sm:block">
                Giacenza{" "}
                <span className="font-semibold">
                  {row.stock === null ? "—" : `${qty(row.stock)} ${row.unit ?? ""}`}
                </span>
              </span>
              <span className="hidden text-muted-foreground sm:block">Da acquistare</span>
              <Input
                className="h-8 w-24 text-right text-xs"
                inputMode="decimal"
                placeholder="—"
                aria-label={`Da acquistare ${row.code}`}
                disabled={!editable}
                value={values[row.product_id] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [row.product_id]: event.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">Tutti i prodotti contati sono già nella Lista.</p>
      )}

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termina valutazione</DialogTitle>
            <DialogDescription>
              {leftEmpty
                ? `${leftEmpty} prodotti non hanno una quantità di acquisto. Confermi di averli valutati e di non inserirli nella Lista della Spesa?`
                : "Tutti i prodotti dell'inventario sono stati valutati. Confermi di terminare la valutazione?"}
            </DialogDescription>
          </DialogHeader>
          {typed.length ? (
            <p className="text-sm text-destructive">
              Hai scritto {typed.length} quantità non ancora aggiunte: premi prima «Aggiungi alla Lista» oppure verranno ignorate.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOpen(false)}>
              Torna alla valutazione
            </Button>
            <Button disabled={finishMutation.isPending} onClick={() => finishMutation.mutate()}>
              Conferma e termina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { Badge };
