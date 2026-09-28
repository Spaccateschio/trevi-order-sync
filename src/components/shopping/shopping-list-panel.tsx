import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownAZ,
  MoreVertical,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AddProductsDialog, Thumb } from "./add-products-dialog";
import { CYCLE_QUERY_KEY, InventoryEvaluation } from "./inventory-to-evaluate";
import { SupplierSplitDialog } from "./supplier-split-dialog";
import { useShoppingListExtras } from "./use-shopping-list-extras";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { getInventoryCycleStatus } from "@/lib/inventory-cycle.functions";
import {
  ITEM_STATUS_LABEL,
  LIST_STATUS_LABEL,
  type OverviewRow,
  type ShoppingListRow,
} from "@/lib/shopping-list";
import {
  manageShoppingList,
  removeShoppingListItem,
  setShoppingListItemQuantity,
} from "@/lib/shopping-list.functions";

type Archive = { id: string; name: string; is_default: boolean };
type SortKey = "description" | "code" | "category" | "supplier";
type FilterFlag =
  | "senza_fornitore"
  | "b2b"
  | "non_b2b"
  | "preferiti"
  | "da_assegnare"
  | "parziale"
  | "assegnata"
  | "in_ordine"
  | "da_ordinare";
const FILTER_FLAGS: [FilterFlag, string][] = [
  ["senza_fornitore", "Senza fornitore"],
  ["b2b", "B2B"],
  ["non_b2b", "Non B2B"],
  ["preferiti", "Preferiti"],
  ["da_assegnare", "Da assegnare"],
  ["parziale", "Parzialmente assegnati"],
  ["assegnata", "Assegnati"],
  ["in_ordine", "Già in ordine"],
  ["da_ordinare", "Da ordinare"],
];

function B2BBadge() {
  return (
    <span className="shrink-0 rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold leading-4 text-foreground">
      B2B
    </span>
  );
}

/** Lista della Spesa operativa: suggerito e deciso separati, residuo sempre visibile. */
export function ShoppingListPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const runList = useServerFn(manageShoppingList);
  const runQuantity = useServerFn(setShoppingListItemQuantity);
  const runRemove = useServerFn(removeShoppingListItem);
  const readCycle = useServerFn(getInventoryCycleStatus);

  const [listId, setListId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [flags, setFlags] = useState<Set<FilterFlag>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("description");
  const [addOpen, setAddOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [splitItem, setSplitItem] = useState<OverviewRow | null>(null);

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
    // Solo una Lista corrente (Aperta o Confermata) si seleziona da sola; lo Storico solo su scelta esplicita.
    () =>
      lists.find((row) => row.id === listId) ??
      lists.find((row) => row.status === "aperta") ??
      lists.find((row) => row.status === "confermata") ??
      null,
    [lists, listId],
  );
  const editable = list?.status === "aperta";
  const currentList = lists.find((row) => row.status === "aperta") ?? lists.find((row) => row.status === "confermata") ?? null;
  const cycleQuery = useQuery({
    queryKey: [CYCLE_QUERY_KEY, companyId],
    queryFn: () => readCycle({ data: { companyId } }),
  });
  const cycle = cycleQuery.data;

  const overviewQuery = useQuery({
    queryKey: ["shopping-list-overview", list?.id],
    enabled: Boolean(list?.id),
    queryFn: async (): Promise<OverviewRow[]> => {
      const { data, error } = await supabase.rpc("shopping_list_overview", { _list_id: list!.id });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OverviewRow[];
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-extras-assignments"] }),
      queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] }),
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

  const allRows = overviewQuery.data ?? [];
  const { extras, b2bSupplierIds } = useShoppingListExtras(companyId, list?.id ?? null, allRows);
  const categories = useMemo(
    () => [...new Set([...extras.values()].map((row) => row.category).filter(Boolean) as string[])].sort(),
    [extras],
  );
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of extras.values()) for (const supplier of row.suppliers) map.set(supplier.supplierRecordId, supplier.name);
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1], "it"));
  }, [extras]);

  // Filtri e ordinamento solo in vista: nessuna scrittura.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = allRows.filter((row) => {
      const extra = extras.get(row.item_id);
      if (term && !row.code.toLowerCase().includes(term) && !(row.description ?? "").toLowerCase().includes(term)) return false;
      if (category !== "all" && extra?.category !== category) return false;
      if (supplierFilter !== "all" && !extra?.suppliers.some((s) => s.supplierRecordId === supplierFilter)) return false;
      if (flags.size) {
        const suppliers = extra?.suppliers ?? [];
        if (flags.has("senza_fornitore") && suppliers.length > 0) return false;
        if (flags.has("b2b") && !suppliers.some((s) => s.isB2B)) return false;
        if (flags.has("non_b2b") && !suppliers.some((s) => !s.isB2B)) return false;
        if (flags.has("preferiti") && !extra?.isFavorite) return false;
        const statusFlags = (["da_assegnare", "parziale", "assegnata"] as const).filter((f) => flags.has(f));
        if (statusFlags.length && !statusFlags.includes(row.status)) return false;
        if (flags.has("in_ordine") && extra?.orderState !== "ordinato") return false;
        if (flags.has("da_ordinare") && extra?.orderState === "ordinato") return false;
      }
      return true;
    });
    const key = (row: OverviewRow) => {
      const extra = extras.get(row.item_id);
      if (sortBy === "code") return row.code;
      if (sortBy === "category") return `${extra?.category ?? "\uffff"} ${row.description ?? ""}`;
      if (sortBy === "supplier") return `${extra?.suppliers[0]?.name ?? "\uffff"} ${row.description ?? ""}`;
      return row.description ?? row.code;
    };
    return [...filtered].sort((left, right) => key(left).localeCompare(key(right), "it", { numeric: true }));
  }, [allRows, extras, search, category, supplierFilter, flags, sortBy]);

  const summary = useMemo(
    () => ({
      total: allRows.length,
      assigned: allRows.filter((row) => row.status === "assegnata").length,
      partial: allRows.filter((row) => row.status === "parziale").length,
      open: allRows.filter((row) => row.status === "da_assegnare").length,
    }),
    [allRows],
  );
  const activeFilters = flags.size + (category !== "all" ? 1 : 0) + (supplierFilter !== "all" ? 1 : 0);
  const resetFilters = () => {
    setFlags(new Set());
    setCategory("all");
    setSupplierFilter("all");
    setSearch("");
  };
  const toggleFlag = (flag: FilterFlag, checked: boolean) =>
    setFlags((current) => {
      const next = new Set(current);
      if (checked) next.add(flag);
      else next.delete(flag);
      return next;
    });

  const suppliersCell = (row: OverviewRow) => {
    const suppliers = extras.get(row.item_id)?.suppliers ?? [];
    if (!suppliers.length) return <span className="text-muted-foreground">Nessun fornitore</span>;
    return (
      <span className="flex flex-col leading-tight">
        {suppliers.map((supplier) => (
          <span key={supplier.linkId} className="flex items-center gap-1 truncate">
            <span className="truncate">{supplier.name}</span>
            <span className="shrink-0 text-muted-foreground">
              · {qty(supplier.quantity)} {row.unit_code ?? ""}
            </span>
            {supplier.isB2B ? <B2BBadge /> : null}
          </span>
        ))}
      </span>
    );
  };
  const notesOf = (row: OverviewRow) =>
    (extras.get(row.item_id)?.suppliers ?? []).map((s) => s.notes).filter(Boolean).join(" · ");
  const orderBadge = (row: OverviewRow) => {
    const state = extras.get(row.item_id)?.orderState;
    if (state === "ordinato") return <Badge variant="default" className="px-1 py-0 text-[10px]">In ordine</Badge>;
    if (state === "in_parte") return <Badge variant="secondary" className="px-1 py-0 text-[10px]">In parte in ordine</Badge>;
    return null;
  };
  const quantityInput = (row: OverviewRow, className: string) => (
    <Input
      className={className}
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
  );

  const statusBadge = (row: OverviewRow) => (
    <Badge
      variant={
        row.status === "assegnata" ? "default" : row.status === "parziale" ? "secondary" : "outline"
      }
    >
      {ITEM_STATUS_LABEL[row.status]}
    </Badge>
  );

  const statusBadgeSmall = (row: OverviewRow) => (
    <Badge
      variant={row.status === "assegnata" ? "default" : row.status === "parziale" ? "secondary" : "outline"}
      className="shrink-0 px-1 py-0 text-[10px]"
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
              <SelectValue placeholder="Storico liste" />
            </SelectTrigger>
            <SelectContent>
              {lists.filter((row) => row.status === "aperta" || row.status === "confermata").map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name} · {LIST_STATUS_LABEL[row.status]}
                </SelectItem>
              ))}
              {lists.some((row) => row.status === "chiusa" || row.status === "annullata") ? (
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Storico</div>
              ) : null}
              {lists.filter((row) => row.status === "chiusa" || row.status === "annullata").map((row) => (
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

      {list && list.status !== "aperta" && list.status !== "confermata" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Stai consultando una lista dello Storico.
          {currentList ? (
            <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setListId(currentList.id)}>
              Torna alla Lista in lavorazione
            </Button>
          ) : (
            <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setListId(null)}>
              Chiudi consultazione
            </Button>
          )}
        </div>
      ) : null}

      {cycle?.color === "rosso" && cycle.session_id && (!list || list.id === currentList?.id) ? (
        <InventoryEvaluation
          companyId={companyId}
          cycle={cycle}
          currentList={currentList}
          currentListItems={currentList && list?.id === currentList.id ? allRows.length : 0}
          existingProductIds={new Set(list?.id === currentList?.id ? allRows.map((row) => row.product_id) : [])}
          creatingList={listMutation.isPending}
          onCreateList={async () => {
            try {
              const result = await listMutation.mutateAsync("open");
              return result.id;
            } catch {
              return null;
            }
          }}
        />
      ) : null}

      {!list ? (
        <p className="text-sm text-muted-foreground">
          Nessuna Lista in lavorazione. Usa «+ Nuova lista» oppure consulta lo Storico dal menu delle liste.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Creata {dateTimeShort(list.created_at)}
            {list.confirmed_at ? ` · confermata ${dateTimeShort(list.confirmed_at)}` : ""}
            {list.closed_at ? ` · chiusa ${dateTimeShort(list.closed_at)}` : ""}
          </p>

          {/* Barra operativa */}
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card p-1.5 lg:top-0">
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-8 pl-7 text-xs"
                value={search}
                placeholder="Cerca prodotto"
                aria-label="Cerca prodotto in lista"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {categories.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Fornitore">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                {supplierOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs">
                  <SlidersHorizontal aria-hidden="true" />
                  Altri filtri{flags.size ? ` (${flags.size})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-2">
                <div className="grid gap-1">
                  {FILTER_FLAGS.map(([flag, label]) => (
                    <label key={flag} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                      <Checkbox checked={flags.has(flag)} onCheckedChange={(checked) => toggleFlag(flag, checked === true)} />
                      {label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Ordina">
                <ArrowDownAZ className="size-3.5" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="description">Descrizione</SelectItem>
                <SelectItem value="code">Codice</SelectItem>
                <SelectItem value="category">Categoria</SelectItem>
                <SelectItem value="supplier">Fornitore</SelectItem>
              </SelectContent>
            </Select>
            {editable ? (
              <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden="true" />
                Aggiungi prodotti
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled title="Disponibile a breve">
              <Printer aria-hidden="true" />
              Stampa · Disponibile a breve
            </Button>
            {activeFilters || search ? (
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={resetFilters}>
                Azzera filtri
              </Button>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <table className="w-full min-w-[860px] table-fixed text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                  <th className="w-10"><span className="sr-only">Foto</span></th>
                  <th className="w-20">Codice</th>
                  <th>Prodotto</th>
                  <th className="w-28">Categoria</th>
                  <th className="w-20">Quantità</th>
                  <th className="w-12">U.M.</th>
                  <th className="w-56">Fornitore/i</th>
                  <th className="w-32">Note</th>
                  <th className="w-24">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const extra = extras.get(row.item_id);
                  return (
                    <tr key={row.item_id} className="border-t border-border align-middle [&>td]:px-2 [&>td]:py-1">
                      <td><Thumb url={extra?.imageUrl ?? null} /></td>
                      <td className="truncate font-mono">{row.code}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          {extra?.isFavorite ? <Star className="size-3 shrink-0 fill-primary text-primary" aria-label="Preferito" /> : null}
                          <span className="truncate font-medium">{row.description ?? "—"}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          {statusBadgeSmall(row)}
                          {orderBadge(row)}
                          {detail(row)}
                        </div>
                      </td>
                      <td className="truncate text-muted-foreground">{extra?.category ?? "—"}</td>
                      <td>{editable ? quantityInput(row, "h-7 text-xs") : qty(row.decided_quantity)}</td>
                      <td>{row.unit_code ?? "—"}</td>
                      <td className="text-[11px]">{suppliersCell(row)}</td>
                      <td className="truncate text-[11px] text-muted-foreground" title={notesOf(row)}>{notesOf(row) || "—"}</td>
                      <td>
                        <div className="flex gap-1">
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSplitItem(row)}>
                            <Truck aria-hidden="true" />
                            Fornitori
                          </Button>
                          {editable ? (
                            <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5" aria-label={`Rimuovi ${row.code}`} onClick={() => removeMutation.mutate(row.item_id)}>
                              <Trash2 aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-1.5 md:hidden">
            {rows.map((row) => {
              const extra = extras.get(row.item_id);
              const note = notesOf(row);
              return (
                <li key={row.item_id} className="rounded-md border border-border p-2">
                  <div className="flex items-start gap-2">
                    <Thumb url={extra?.imageUrl ?? null} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="flex min-w-0 items-center gap-1 text-sm font-medium">
                          {extra?.isFavorite ? <Star className="size-3 shrink-0 fill-primary text-primary" aria-label="Preferito" /> : null}
                          <span className="truncate">{row.description ?? row.code}</span>
                        </p>
                        {statusBadgeSmall(row)}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <span className="font-mono">{row.code}</span>
                        {extra?.category ? ` · ${extra.category}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {quantityInput(row, "h-9 w-24 text-base")}
                    <span className="text-xs">{row.unit_code ?? ""}</span>
                    <div className="min-w-0 flex-1 text-[11px]">{suppliersCell(row)}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                    {orderBadge(row)}
                    {detail(row)}
                    {note ? <span className="truncate text-muted-foreground">Nota: {note}</span> : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" onClick={() => setSplitItem(row)}>
                      <Truck aria-hidden="true" />
                      Fornitori
                    </Button>
                    {editable ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" aria-label={`Altre azioni ${row.code}`}>
                            <MoreVertical aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => removeMutation.mutate(row.item_id)}>
                            <Trash2 aria-hidden="true" />
                            Rimuovi
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {!rows.length && !overviewQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {allRows.length ? "Nessun prodotto con questi filtri." : "Nessuna riga in lista."}
            </p>
          ) : null}

          {/* Riepilogo finale: nessun pulsante fisso */}
          {allRows.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span>
                <strong>{summary.total}</strong> prodotti · <strong>{summary.assigned}</strong> assegnati ·{" "}
                <strong>{summary.partial}</strong> parziali · <strong>{summary.open}</strong> da assegnare
                {rows.length !== allRows.length ? ` · ne vedi ${rows.length}` : ""}
              </span>
              {editable ? (
                <Button type="button" size="sm" className="h-8" disabled={listMutation.isPending} onClick={() => listMutation.mutate("confirm")}>
                  Conferma lista
                </Button>
              ) : list.status === "confermata" ? (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link to="/acquisti/ordini">Vai agli Ordini per creare le bozze</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {addOpen && list ? (
        <AddProductsDialog
          companyId={companyId}
          listId={list.id}
          archiveId={list.archive_id}
          existingProductIds={new Set(allRows.map((row) => row.product_id))}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      ) : null}

      {splitItem ? (
        <SupplierSplitDialog
          companyId={companyId}
          item={splitItem}
          open={Boolean(splitItem)}
          editable={Boolean(editable)}
          b2bSupplierIds={b2bSupplierIds}
          onOpenChange={(open) => {
            if (!open) {
              setSplitItem(null);
              void queryClient.invalidateQueries({ queryKey: ["shopping-extras-assignments"] });
            }
          }}
        />
      ) : null}
    </div>
  );
}
