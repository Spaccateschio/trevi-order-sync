import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Thumb } from "./add-products-dialog";
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
import { type ShoppingListRow } from "@/lib/shopping-list";
import { addShoppingListItems } from "@/lib/shopping-list.functions";

export type CountedRow = {
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

/** Prodotti contati nell'inventario da valutare: sola lettura, condivisa da sezione e raccolta unica. */
export function useInventoryCountedRows(companyId: string, sessionId: string | null) {
  const getImageUrls = useServerFn(getProductImageUrls);
  const countsQuery = useQuery({
    queryKey: ["inventory-evaluation-counts", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<CountedRow[]> => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("product_id, location_id, counted_quantity, unit_code, counted_at, products(code, description, category)")
        .eq("company_id", companyId)
        .eq("session_id", sessionId!)
        .order("counted_at", { ascending: false });
      if (error) throw new Error(error.message);
      const { data: session } = await supabase
        .from("inventory_sessions")
        .select("archive_id")
        .eq("id", sessionId!)
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
  const imageIds = useMemo(() => allCounted.slice(0, 50).map((row) => row.product_id), [allCounted]);
  const imagesQuery = useQuery({
    queryKey: ["inventory-evaluation-images", imageIds],
    enabled: imageIds.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: () => getImageUrls({ data: { productIds: imageIds, thumbnail: true } }),
  });
  const images = new Map((imagesQuery.data ?? []).map((image) => [image.productId, image.url]));
  return { allCounted, images, isLoading: countsQuery.isLoading };
}


/**
 * Ponte Inventario → Lista della Spesa.
 * I prodotti contati diventano righe della Lista solo con una quantità > 0 scritta dall'operatore:
 * vuoto significa "non deciso", mai 0.
 */
export function InventoryEvaluation({
  companyId,
  cycle,
  linkedList,
  existingProductIds,
  onEnsureList,
  layout = "row",
  values: controlledValues,
  onValuesChange,
  hideItems = false,
}: {
  /** Quantità scritte e non ancora aggiunte: gestite dalla pagina quando i prodotti sono nella raccolta unica. */
  values?: Record<string, string>;
  onValuesChange?: (update: (current: Record<string, string>) => Record<string, string>) => void;
  /** Mostra solo intestazione e comandi: i prodotti sono nella raccolta unica della pagina. */
  hideItems?: boolean;
  /** Solo presentazione: stessa scelta Card/Righe della Lista della Spesa. */
  layout?: "card" | "row";
  companyId: string;
  cycle: CycleStatus;
  /** Lista già collegata a questo inventario; null = anteprima, nulla ancora salvato. */
  linkedList: ShoppingListRow | null;
  existingProductIds: Set<string>;
  /** Crea e collega la Lista alla prima azione che salva (una sola volta, anche con doppi clic). */
  onEnsureList: () => Promise<string | null>;
}) {
  const queryClient = useQueryClient();
  const runEvaluation = useServerFn(manageInventoryEvaluation);
  const runAdd = useServerFn(addShoppingListItems);
  const [ownValues, setOwnValues] = useState<Record<string, string>>({});
  const values = controlledValues ?? ownValues;
  const setValues = (update: (current: Record<string, string>) => Record<string, string>) =>
    onValuesChange ? onValuesChange(update) : setOwnValues(update);
  const [finishOpen, setFinishOpen] = useState(false);

  const sessionId = cycle.session_id!;

  const refreshCycle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
    ]);

  const { allCounted, images } = useInventoryCountedRows(companyId, sessionId);
  const toEvaluate = allCounted.filter((row) => !existingProductIds.has(row.product_id));

  const addMutation = useMutation({
    mutationFn: async (items: { product_id: string; quantity: number }[]) => {
      const listId = await onEnsureList();
      if (!listId) throw new Error("Lista della Spesa non creata");
      return runAdd({
        data: {
          companyId,
          listId,
          replaceExisting: false,
          items: items.map((item) => ({
            product_id: item.product_id,
            decided_quantity: item.quantity,
            origin: "manuale" as const,
          })),
        },
      });
    },
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
          {cycle.cycle_outcome === "da_verificare"
            ? `ciclo chiuso con ${cycle.to_verify} elementi da verificare.`
            : `${cycle.missing_orders} acquisti ancora senza ordine.`}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/acquisti/ordini">Vai agli Ordini</Link>
        </Button>
      </div>
    );
  }

  const editable = !linkedList || linkedList.status === "aperta";
  const leftEmpty = toEvaluate.filter((row) => !(values[row.product_id] ?? "").trim()).length;

  return (
    <div className="space-y-2 rounded-md border border-primary/50 bg-primary/5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-semibold">
          Da {inventoryLabel.replace("Inventario", "inventario")}
          {linkedList ? "" : " — non ancora preso in carico"} ·{" "}
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
{linkedList ? (
          <Button size="sm" variant="outline" onClick={() => setFinishOpen(true)}>
            Termina valutazione
          </Button>
          ) : null}
        </div>
      </div>
      {invalid.length ? (
        <p className="px-1 text-xs text-destructive">Scrivi una quantità maggiore di zero oppure lascia il campo vuoto.</p>
      ) : null}
      {hideItems ? null : toEvaluate.length && layout === "card" ? (
        <div className="@container">
          <div className="grid auto-rows-fr gap-2 grid-cols-[repeat(auto-fill,minmax(max(172px,calc((100%_-_1.5rem)/4)),1fr))] @min-[600px]:grid-cols-[repeat(auto-fill,minmax(max(232px,calc((100%_-_1.5rem)/4)),1fr))]">
            {toEvaluate.map((row) => (
              <article key={row.product_id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0"><Thumb url={images.get(row.product_id) ?? null} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.description ?? "—"}</span>
                    <span className="block truncate text-muted-foreground">
                      <span className="font-mono">{row.code}</span> · {row.category ?? "—"}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/50 px-2 py-1">
                  <span className="min-w-0">
                    <span className="block text-[10px] text-muted-foreground">Contato</span>
                    <span className="font-semibold">{qty(row.counted)} {row.unit ?? ""}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] text-muted-foreground">Giacenza</span>
                    <span className="font-semibold">{row.stock === null ? "—" : `${qty(row.stock)} ${row.unit ?? ""}`}</span>
                  </span>
                </div>
                <label className="mt-auto flex min-w-0 items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">Da acquistare</span>
                  <span className="flex items-center gap-1">
                    <Input
                      className="h-8 w-20 text-right text-xs"
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`Da acquistare ${row.code}`}
                      disabled={!editable}
                      value={values[row.product_id] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [row.product_id]: event.target.value }))}
                    />
                    <span className="text-muted-foreground">{row.unit ?? ""}</span>
                  </span>
                </label>
              </article>
            ))}
          </div>
        </div>
      ) : toEvaluate.length ? (
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

