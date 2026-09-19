import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus, Search, Trash2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SupplierSplitDialog } from "./supplier-split-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, parseQuantity, qty } from "@/lib/inventory";
import {
  ITEM_STATUS_LABEL,
  LIST_STATUS_LABEL,
  type ItemStatus,
  type OverviewRow,
  type ShoppingListRow,
} from "@/lib/shopping-list";
import {
  manageShoppingList,
  removeShoppingListItem,
  setShoppingListItemQuantity,
} from "@/lib/shopping-list.functions";

type Archive = { id: string; name: string; is_default: boolean };
type ProductOption = { id: string; code: string; description: string | null };

/** Lista della Spesa operativa: suggerito e deciso separati, residuo sempre visibile. */
export function ShoppingListPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const runList = useServerFn(manageShoppingList);
  const runQuantity = useServerFn(setShoppingListItemQuantity);
  const runRemove = useServerFn(removeShoppingListItem);

  const [listId, setListId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"tutte" | ItemStatus>("tutte");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [splitItem, setSplitItem] = useState<OverviewRow | null>(null);
  const [manualProduct, setManualProduct] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");

  const archivesQuery = useQuery({
    queryKey: ["inventory-archives", companyId],
    queryFn: async (): Promise<Archive[]> => {
      const { data, error } = await supabase
        .from("danea_archives")
        .select("id, name, is_default")
        .eq("company_id", companyId)
        .eq("status", "attivo")
        .order("is_default", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Archive[];
    },
  });

  const listsQuery = useQuery({
    queryKey: ["shopping-lists", companyId],
    queryFn: async (): Promise<ShoppingListRow[]> => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("id, name, status, archive_id, notes, created_at, confirmed_at, closed_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShoppingListRow[];
    },
  });

  const lists = listsQuery.data ?? [];
  const list = useMemo(
    () => lists.find((row) => row.id === listId) ?? lists.find((row) => row.status === "aperta") ?? lists[0] ?? null,
    [lists, listId],
  );
  const editable = list?.status === "aperta";

  const overviewQuery = useQuery({
    queryKey: ["shopping-list-overview", list?.id],
    enabled: Boolean(list?.id),
    queryFn: async (): Promise<OverviewRow[]> => {
      const { data, error } = await supabase.rpc("shopping_list_overview", { _list_id: list!.id });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OverviewRow[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["shopping-products", companyId, list?.archive_id],
    enabled: Boolean(list?.archive_id),
    queryFn: async (): Promise<ProductOption[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description")
        .eq("company_id", companyId)
        .eq("archive_id", list!.archive_id)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductOption[];
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
    ]);
  };

  const listMutation = useMutation({
    mutationFn: (action: "open" | "confirm" | "close" | "cancel") =>
      runList({
        data: {
          companyId,
          action,
          listId: action === "open" ? null : (list?.id ?? null),
          archiveId: action === "open" ? (archivesQuery.data?.[0]?.id ?? null) : null,
          name: null,
          notes: null,
        },
      }),
    onSuccess: async (result, action) => {
      await refresh();
      if (action === "open") setListId(result.id);
      toast.success(
        action === "open"
          ? "Lista aperta"
          : action === "confirm"
            ? "Lista confermata"
            : action === "close"
              ? "Lista chiusa"
              : "Lista annullata",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const quantityMutation = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      runQuantity({
        data: {
          companyId,
          itemId: input.itemId,
          decidedQuantity: input.quantity,
          reason: "Modifica manuale dell'operatore",
          notes: null,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Quantità aggiornata: il suggerito resta registrato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => runRemove({ data: { companyId, itemId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Riga rimossa");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addManual = useMutation({
    mutationFn: async () => {
      const quantity = parseQuantity(manualQuantity);
      if (!manualProduct || !quantity || quantity <= 0) throw new Error("Scegli prodotto e quantità");
      const { addShoppingListItems } = await import("@/lib/shopping-list.functions");
      return addShoppingListItems({
        data: {
          companyId,
          listId: list!.id,
          items: [{ product_id: manualProduct, decided_quantity: quantity, origin: "manuale" }],
          replaceExisting: false,
        },
      });
    },
    onSuccess: async (result) => {
      await refresh();
      setManualQuantity("");
      toast.success(
        result.added
          ? "Prodotto aggiunto alla lista"
          : "Il prodotto è già in lista: modifica la riga esistente",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (overviewQuery.data ?? []).filter((row) => {
      if (filter !== "tutte" && row.status !== filter) return false;
      if (!term) return true;
      return row.code.toLowerCase().includes(term) || (row.description ?? "").toLowerCase().includes(term);
    });
  }, [overviewQuery.data, search, filter]);

  const statusBadge = (row: OverviewRow) => (
    <Badge
      variant={
        row.status === "assegnata" ? "default" : row.status === "parziale" ? "secondary" : "outline"
      }
    >
      {ITEM_STATUS_LABEL[row.status]}
    </Badge>
  );

  const detail = (row: OverviewRow) => (
    <>
      {row.suggested_quantity !== null && Number(row.suggested_quantity) !== Number(row.decided_quantity) ? (
        <span className="text-muted-foreground">
          suggerito all'inserimento {qty(row.suggested_quantity)}
        </span>
      ) : null}
      {row.current_suggested !== null &&
      row.suggested_quantity !== null &&
      Number(row.current_suggested) !== Number(row.suggested_quantity) ? (
        <span className="text-muted-foreground"> · oggi {qty(row.current_suggested)}</span>
      ) : null}
      {row.untranslatable > 0 ? (
        <span className="flex items-center gap-1 font-medium text-destructive">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          conversione mancante su {row.untranslatable} fornitore/i
        </span>
      ) : null}
      {row.under_minimum > 0 ? (
        <span className="text-amber-600 dark:text-amber-400">
          sotto il minimo di {row.under_minimum} fornitore/i
        </span>
      ) : null}
      {row.remaining < 0 ? (
        <span className="font-medium text-destructive">
          assegnati {qty(row.assigned)} su {qty(row.decided_quantity)}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={list?.id ?? ""} onValueChange={setListId}>
            <SelectTrigger className="w-full sm:w-72" aria-label="Lista della spesa">
              <SelectValue placeholder="Scegli una lista" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name} · {LIST_STATUS_LABEL[row.status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {list ? <Badge variant={editable ? "default" : "secondary"}>{LIST_STATUS_LABEL[list.status]}</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={listMutation.isPending}
                onClick={() => listMutation.mutate("cancel")}
              >
                Annulla lista
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={listMutation.isPending}
                onClick={() => listMutation.mutate("confirm")}
              >
                Conferma lista
              </Button>
            </>
          ) : null}
          {list && list.status === "confermata" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={listMutation.isPending}
              onClick={() => listMutation.mutate("close")}
            >
              Chiudi lista
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={listMutation.isPending || !archivesQuery.data?.length}
            onClick={() => listMutation.mutate("open")}
          >
            <Plus aria-hidden="true" />
            Nuova lista
          </Button>
        </div>
      </div>

      {!list ? (
        <p className="text-sm text-muted-foreground">
          Nessuna lista: aprine una e aggiungi i prodotti dal Fabbisogno o a mano.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Creata {dateTimeShort(list.created_at)}
            {list.confirmed_at ? ` · confermata ${dateTimeShort(list.confirmed_at)}` : ""}
            {list.closed_at ? ` · chiusa ${dateTimeShort(list.closed_at)}` : ""}
          </p>

          {editable ? (
            <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
              <label className="min-w-0 flex-1 text-xs">
                Aggiungi prodotto a mano
                <Select value={manualProduct} onValueChange={setManualProduct}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Prodotto" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsQuery.data ?? []).map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} · {row.description ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs">
                Quantità
                <Input
                  className="mt-1 w-28"
                  inputMode="decimal"
                  value={manualQuantity}
                  aria-label="Quantità da acquistare"
                  onChange={(event) => setManualQuantity(event.target.value)}
                />
              </label>
              <Button type="button" size="sm" disabled={addManual.isPending} onClick={() => addManual.mutate()}>
                Aggiungi
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-8"
                value={search}
                placeholder="Cerca prodotto"
                aria-label="Cerca prodotto in lista"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
              <SelectTrigger className="w-48" aria-label="Filtro righe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le righe</SelectItem>
                <SelectItem value="da_assegnare">Da assegnare</SelectItem>
                <SelectItem value="parziale">Parziali</SelectItem>
                <SelectItem value="assegnata">Assegnate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="hidden overflow-hidden rounded-md border border-border md:block">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-muted/50">
                <tr className="[&>th]:border-r [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th:last-child]:border-r-0">
                  <th className="w-20">Codice</th>
                  <th>Descrizione</th>
                  <th className="w-16">U.M.</th>
                  <th className="w-20">Suggerito</th>
                  <th className="w-24">Deciso</th>
                  <th className="w-20">Assegnati</th>
                  <th className="w-20">Residuo</th>
                  <th className="w-28">Stato</th>
                  <th className="w-28">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.item_id}
                    className="border-t border-border [&>td]:border-r [&>td]:border-border [&>td]:px-2 [&>td]:py-1 [&>td:last-child]:border-r-0"
                  >
                    <td className="truncate font-mono">{row.code}</td>
                    <td className="truncate">
                      {row.description ?? "—"}
                      <span className="ml-1 inline-flex flex-wrap gap-2">{detail(row)}</span>
                    </td>
                    <td>{row.unit_code ?? "—"}</td>
                    <td className="text-muted-foreground">{qty(row.suggested_quantity)}</td>
                    <td>
                      {editable ? (
                        <Input
                          className="h-7 text-xs"
                          inputMode="decimal"
                          value={edits[row.item_id] ?? String(row.decided_quantity)}
                          aria-label={`Quantità decisa ${row.code}`}
                          onChange={(event) =>
                            setEdits((current) => ({ ...current, [row.item_id]: event.target.value }))
                          }
                          onBlur={() => {
                            const value = parseQuantity(edits[row.item_id] ?? "");
                            if (value && value !== Number(row.decided_quantity)) {
                              quantityMutation.mutate({ itemId: row.item_id, quantity: value });
                            }
                          }}
                        />
                      ) : (
                        qty(row.decided_quantity)
                      )}
                    </td>
                    <td>{qty(row.assigned)}</td>
                    <td className={row.remaining === 0 ? "text-muted-foreground" : "font-semibold"}>
                      {qty(row.remaining)}
                    </td>
                    <td>{statusBadge(row)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => setSplitItem(row)}
                        >
                          <Truck aria-hidden="true" />
                          Fornitori
                        </Button>
                        {editable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            aria-label={`Rimuovi ${row.code}`}
                            onClick={() => removeMutation.mutate(row.item_id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.item_id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.description ?? row.code}</p>
                    <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                  </div>
                  {statusBadge(row)}
                </div>
                <p className="mt-1 flex flex-wrap gap-2 text-xs">{detail(row)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    className="h-11 text-base"
                    inputMode="decimal"
                    disabled={!editable}
                    value={edits[row.item_id] ?? String(row.decided_quantity)}
                    aria-label={`Quantità decisa ${row.code}`}
                    onChange={(event) => setEdits((current) => ({ ...current, [row.item_id]: event.target.value }))}
                    onBlur={() => {
                      const value = parseQuantity(edits[row.item_id] ?? "");
                      if (value && value !== Number(row.decided_quantity)) {
                        quantityMutation.mutate({ itemId: row.item_id, quantity: value });
                      }
                    }}
                  />
                  <div className="shrink-0 text-right text-xs">
                    <p className="text-muted-foreground">Residuo</p>
                    <p className="text-sm font-semibold">
                      {qty(row.remaining)} {row.unit_code ?? ""}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => setSplitItem(row)}
                >
                  <Truck aria-hidden="true" />
                  Fornitori ({qty(row.assigned)} assegnati)
                </Button>
              </li>
            ))}
          </ul>

          {!rows.length && !overviewQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Nessuna riga in lista.</p>
          ) : null}
        </>
      )}

      {splitItem ? (
        <SupplierSplitDialog
          companyId={companyId}
          item={splitItem}
          open={Boolean(splitItem)}
          editable={Boolean(editable)}
          onOpenChange={(open) => {
            if (!open) setSplitItem(null);
          }}
        />
      ) : null}
    </div>
  );
}
