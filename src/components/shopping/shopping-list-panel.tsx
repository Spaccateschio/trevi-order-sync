import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  AlertTriangle,
  ArrowDownAZ,
  MoreVertical,
  Plus,
  LayoutGrid,
  Printer,
  Rows3,
  Search,
  SlidersHorizontal,
  Eye,
  Star,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AddProductsDialog, Thumb } from "./add-products-dialog";
import { CatalogProductCard, useCatalogActions, useCatalogEntries, useCatalogImages, type CatalogEntry } from "./catalog-entries";
import { CYCLE_QUERY_KEY, EvaluationDecision, InventoryEvaluation, useEvaluationRows, useInventoryCountedRows, useSaveEvaluation, type CountedRow } from "./inventory-to-evaluate";
import { statusFromQuantity, type EvaluationStatus } from "@/lib/inventory-evaluation";
import { DISPLAY_FIELDS, useCardDisplay } from "./card-display";
import { ShoppingListCard, type StockInfo } from "./shopping-list-card";
import { SupplierSplitDialog } from "./supplier-split-dialog";
import { CloseListDialog } from "./close-list-dialog";
import { ListHistoryDialog } from "./list-history-dialog";
import { ListDeliveryDate, useProposeListDate } from "./list-delivery-date";
import { getCompanyHasFavorites, getFavoriteProductIds, manageCompanyProductFavorite } from "@/lib/inventory-count.functions";
import { useShoppingListExtras, type RowExtras } from "./use-shopping-list-extras";
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
import { getInventoryCycleStatus, manageInventoryEvaluation } from "@/lib/inventory-cycle.functions";
import {
  ITEM_STATUS_LABEL,
  LIST_STATUS_LABEL,
  type OverviewRow,
  type ShoppingListRow,
} from "@/lib/shopping-list";
import { describeOperationalSchedule, hasTodayOverride, type OperationalScheduleRow } from "@/lib/operational-schedule";
import { TimeWheelPicker } from "@/components/company/time-wheel";
import { hasRole, useIdentity } from "@/hooks/use-identity";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addShoppingListItems,
  confirmShoppingListProduct,
  manageShoppingList,
  removeShoppingListItem,
  setShoppingListItemQuantity,
  setShoppingListItemQuantityLock,
} from "@/lib/shopping-list.functions";

/** Prodotto contato non ancora in Lista, mostrato con la stessa card: nessun dato della Lista inventato. */
function pendingOverviewRow(row: CountedRow): OverviewRow {
  return {
    item_id: `pending:${row.product_id}`,
    product_id: row.product_id,
    code: row.code,
    description: row.description,
    unit_code: row.unit,
    suggested_quantity: null,
    decided_quantity: null,
    change_reason: null,
    origin: "manuale",
    snapshot_available: null,
    snapshot_needed: null,
    snapshot_min_stock: null,
    snapshot_raw_need: null,
    snapshot_order_multiple: null,
    current_available: null,
    current_min_stock: null,
    current_order_multiple: null,
    current_suggested: null,
    assigned: 0,
    remaining: null,
    status: "da_assegnare",
    untranslatable: 0,
    under_minimum: 0,
    suppliers_available: 0,
    created_at: "",
  };
}

type Entry = { kind: "list" | "pending"; row: OverviewRow; extra: RowExtras | undefined; stock: StockInfo | undefined };

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
  | "da_ordinare"
  | "da_confermare"
  | "confermati"
  | "da_controllare";
/** «Filtra card»: decide quali prodotti si vedono. */
const FILTER_GROUPS: [string, [FilterFlag, string][]][] = [
  ["Prodotto", [["preferiti", "★ Preferiti"], ["b2b", "B2B"], ["non_b2b", "Non B2B"]]],
  ["Quantità", [["da_controllare", "Da controllare"], ["da_confermare", "Quantità da confermare"], ["confermati", "Quantità confermata"]]],
  [
    "Fornitore / assegnazione",
    [["senza_fornitore", "Nessun fornitore assegnato / collegato"], ["da_assegnare", "Da assegnare"], ["parziale", "Parzialmente assegnati"], ["assegnata", "Assegnati"]],
  ],
  ["Ordine", [["da_ordinare", "Da ordinare"], ["in_ordine", "Già in ordine"]]],
];

function B2BBadge() {
  return (
    <span className="shrink-0 rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold leading-4 text-foreground">
      B2B
    </span>
  );
}

/** Lista della Spesa operativa: suggerito e deciso separati, residuo sempre visibile. */
const EMPTY_SET = new Set<string>();

export function ShoppingListPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const runList = useServerFn(manageShoppingList);
  const proposeListDate = useProposeListDate(companyId);
  const [closeOpen, setCloseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const runQuantity = useServerFn(setShoppingListItemQuantity);
  const runRemove = useServerFn(removeShoppingListItem);
  const runLock = useServerFn(setShoppingListItemQuantityLock);
  const runConfirm = useServerFn(confirmShoppingListProduct);
  const readCycle = useServerFn(getInventoryCycleStatus);
  const runFavorite = useServerFn(manageCompanyProductFavorite);
  const readFavorites = useServerFn(getFavoriteProductIds);
  const runEvaluation = useServerFn(manageInventoryEvaluation);
  const creatingRef = useRef<Promise<string | null> | null>(null);

  const [listId, setListId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [flags, setFlags] = useState<Set<FilterFlag>>(new Set());
  const display = useCardDisplay();
  const [sortBy, setSortBy] = useState<SortKey>("description");
  const [addOpen, setAddOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [splitItem, setSplitItem] = useState<OverviewRow | null>(null);
  // Quantità scritte sui prodotti «Da valutare», non ancora aggiunte alla Lista.
  const [evalValues, setEvalValues] = useState<Record<string, string>>({});
  // Card / Righe: scelta solo visuale, ricordata sul dispositivo.
  const [viewMode, setViewMode] = useState<"card" | "row">("card");
  useEffect(() => {
    if (window.localStorage.getItem("shopping-list-view-mode") === "row") setViewMode("row");
  }, []);
  const changeViewMode = (mode: "card" | "row") => {
    setViewMode(mode);
    window.localStorage.setItem("shopping-list-view-mode", mode);
  };

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
        .select("id, name, number, status, archive_id, notes, created_at, confirmed_at, closed_at, delivery_date")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShoppingListRow[];
    },
  });

  const lists = listsQuery.data ?? [];
  const cycleQuery = useQuery({
    queryKey: [CYCLE_QUERY_KEY, companyId],
    queryFn: () => readCycle({ data: { companyId } }),
  });
  const cycle = cycleQuery.data;

  // Regola aziendale del promemoria: letta e basta, si modifica solo in Azienda → Preferenze.
  const scheduleKey = ["operational-schedule", companyId, "shopping_list"];
  const scheduleQuery = useQuery({
    queryKey: scheduleKey,
    queryFn: async (): Promise<OperationalScheduleRow | null> => {
      const { data, error } = await supabase
        .from("company_operational_schedules")
        .select("schedule_type, enabled, reminder_time, override_date, override_time, monday, tuesday, wednesday, thursday, friday, saturday, sunday")
        .eq("company_id", companyId)
        .eq("schedule_type", "shopping_list")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as OperationalScheduleRow | null;
    },
  });

  // Eccezione «solo oggi»: solo gli amministratori, la regola standard resta in Azienda → Preferenze.
  const { data: identity } = useIdentity();
  const isAdmin = hasRole(identity, "amministratore");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTime, setOverrideTime] = useState("09:30");
  const overrideMutation = useMutation({
    mutationFn: async (time: string | null) => {
      const { error } = await supabase.rpc("set_shopping_list_schedule_override", {
        _company_id: companyId,
        _time: time as string,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKey });
      setOverrideOpen(false);
      toast.success("Promemoria di oggi aggiornato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore nel salvataggio"),
  });

  // Quale inventario ha originato ogni Lista (solo per le etichette del selettore).
  const originsQuery = useQuery({
    queryKey: ["shopping-list-origins", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("purchase_list_id, finished_at, started_at")
        .eq("company_id", companyId)
        .not("purchase_list_id", "is", null);
      if (error) throw new Error(error.message);
      return new Map(
        (data ?? []).map((row) => [row.purchase_list_id as string, (row.finished_at ?? row.started_at) as string | null]),
      );
    },
  });
  const listLabel = (row: ShoppingListRow) => {
    if (row.number) return `${row.number} · ${new Date(row.confirmed_at ?? row.created_at).toLocaleDateString("it-IT")}`;
    const origin = originsQuery.data?.get(row.id);
    if (origin !== undefined || row.id === cycle?.list_id) {
      const when = origin ?? cycle?.finished_at ?? null;
      return `Da inventario ${when ? new Date(when).toLocaleDateString("it-IT") : ""}`.trim();
    }
    return `Straordinaria · ${new Date(row.created_at).toLocaleDateString("it-IT")}`;
  };

  const evaluating = Boolean(cycle?.color === "rosso" && cycle.session_id && !cycle.evaluated_at);
  // Lista già collegata all'inventario in valutazione (se ancora in lavorazione).
  const linkedList =
    lists.find((row) => row.id === cycle?.list_id && (row.status === "aperta" || row.status === "confermata")) ?? null;
  // Anteprima: inventario da valutare senza Lista collegata. Aprire la pagina non crea nulla.
  const previewMode = evaluating && !linkedList;
  const list = useMemo(
    // Priorità: scelta esplicita → Lista dell'inventario → (fuori anteprima) Lista in lavorazione.
    () =>
      lists.find((row) => row.id === listId) ??
      linkedList ??
      (previewMode
        ? null
        : (lists.find((row) => row.status === "aperta") ?? lists.find((row) => row.status === "confermata") ?? null)),
    [lists, listId, linkedList, previewMode],
  );
  const editable = list?.status === "aperta";
  const currentList =
    linkedList ?? lists.find((row) => row.status === "aperta") ?? lists.find((row) => row.status === "confermata") ?? null;

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

  /**
   * Unico punto che crea la Lista dall'inventario: alla prima azione che salva, crea la Lista
   * e la prende in carico (funzioni esistenti), poi restituisce l'id. Doppi clic condividono la stessa promessa.
   */
  const ensureInventoryList = (): Promise<string | null> => {
    if (linkedList) return Promise.resolve(linkedList.id);
    if (!cycle?.session_id) return Promise.resolve(null);
    if (!creatingRef.current) {
      const sessionId = cycle.session_id;
      creatingRef.current = (async () => {
        try {
          const opened = await runList({
            data: {
              companyId,
              action: "open",
              listId: null,
              archiveId: archivesQuery.data?.[0]?.id ?? null,
              name: null,
              notes: null,
            },
          });
          await proposeListDate(opened.id);
          await runEvaluation({ data: { companyId, sessionId, action: "take", listId: opened.id } });
          await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ["shopping-list-origins", companyId] })]);
          setListId(opened.id);
          return opened.id as string;
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Lista della Spesa non creata");
          return null;
        } finally {
          creatingRef.current = null;
        }
      })();
    }
    return creatingRef.current;
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
      if (action === "open") await proposeListDate(result.id);
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
    mutationFn: (input: { itemId: string; quantity: number | null; unitId?: string | null; unitCode?: string | null }) => {
      // Se non indicata, resta la U.M. già scelta: la quantità non cambia mai U.M. da sola.
      const current = extras.get(input.itemId);
      const unitId = input.unitId !== undefined ? input.unitId : (current?.decidedUnitId ?? null);
      const unitCode = input.unitCode !== undefined ? input.unitCode : (current?.decidedUnitCode ?? null);
      return runQuantity({
        data: {
          companyId,
          itemId: input.itemId,
          decidedQuantity: input.quantity,
          reason: "Modifica manuale dell'operatore",
          notes: null,
          decidedUnitId: unitId,
          decidedUnitCode: unitCode,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-extras-locks"] });
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

  // Ultimo conteggio e giacenza per le card: sola lettura, stessa fonte dell'Inventario.
  const stockProductIds = useMemo(() => [...new Set(allRows.map((row) => row.product_id))].sort(), [allRows]);
  const stockQuery = useQuery({
    queryKey: ["shopping-card-stock", companyId, list?.archive_id, stockProductIds],
    enabled: Boolean(list?.archive_id) && stockProductIds.length > 0,
    queryFn: async () => {
      const result = new Map<string, StockInfo>();
      const { data: counts, error } = await supabase
        .from("inventory_counts")
        .select("product_id, location_id, counted_quantity, unit_code, counted_at")
        .eq("company_id", companyId)
        .in("product_id", stockProductIds)
        .order("counted_at", { ascending: false });
      if (error) throw new Error(error.message);
      const locations = new Set<string>();
      for (const count of (counts ?? []) as { product_id: string; location_id: string; counted_quantity: number; unit_code: string | null; counted_at: string }[]) {
        locations.add(count.location_id);
        if (result.has(count.product_id)) continue;
        result.set(count.product_id, {
          lastQuantity: Number(count.counted_quantity),
          lastUnit: count.unit_code,
          lastAt: count.counted_at,
          stock: null,
          stockUnit: null,
        });
      }
      // U.M. di magazzino del prodotto: la giacenza di inventory_location_stock_list è sempre espressa in questa.
      const { data: prods } = await supabase.from("products").select("id, stock_unit_id").in("id", stockProductIds);
      const unitIds = new Set<string>();
      for (const product of (prods ?? []) as { id: string; stock_unit_id: string | null }[]) {
        if (product.stock_unit_id) unitIds.add(product.stock_unit_id);
      }
      const unitCodes = new Map<string, string>();
      if (unitIds.size > 0) {
        const { data: units } = await supabase.from("units_of_measure").select("id, code").in("id", [...unitIds]);
        for (const unit of (units ?? []) as { id: string; code: string }[]) unitCodes.set(unit.id, unit.code);
      }
      for (const product of (prods ?? []) as { id: string; stock_unit_id: string | null }[]) {
        const info = result.get(product.id);
        if (info) info.stockUnit = product.stock_unit_id ? unitCodes.get(product.stock_unit_id) ?? null : null;
      }
      for (const locationId of locations) {
        const { data: stock } = await supabase.rpc("inventory_location_stock_list", {
          _company_id: companyId,
          _archive_id: list!.archive_id,
          _location_id: locationId,
        });
        for (const entry of (stock ?? []) as { product_id: string; has_count: boolean; quantity: number }[]) {
          const info = result.get(entry.product_id);
          if (info && entry.has_count) info.stock = (info.stock ?? 0) + Number(entry.quantity);
        }
      }
      return result;
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (input: { productId: string; favorite: boolean }) =>
      runFavorite({ data: { companyId, productId: input.productId, favorite: input.favorite } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-favorites", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-preferiti-prodotti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti"] }),
        queryClient.invalidateQueries({ queryKey: ["company-has-favorites", companyId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Con almeno un preferito la Lista si apre filtrata sui preferiti; il filtro resta disattivabile.
  const readHasFavorites = useServerFn(getCompanyHasFavorites);
  const hasFavoritesQuery = useQuery({
    queryKey: ["company-has-favorites", companyId],
    staleTime: 60 * 1000,
    queryFn: () => readHasFavorites({ data: { companyId } }),
  });
  const favoritesDefaultedRef = useRef(false);
  useEffect(() => {
    if (hasFavoritesQuery.data === true && !favoritesDefaultedRef.current) {
      favoritesDefaultedRef.current = true;
      setFlags((prev) => new Set(prev).add("preferiti"));
    }
  }, [hasFavoritesQuery.data]);
  const { extras, b2bSupplierIds } = useShoppingListExtras(companyId, list?.id ?? null, allRows);
  // Righe sbloccate da una modifica all'inventario: la Lista si apre su «Da controllare» al posto dei Preferiti.
  const recheckCount = useMemo(
    () => [...extras.values()].filter((e) => e.inventoryChangedAt && e.orderState !== "ordinato").length,
    [extras],
  );
  const recheckDefaultedRef = useRef(false);
  useEffect(() => {
    if (recheckCount > 0 && !recheckDefaultedRef.current) {
      recheckDefaultedRef.current = true;
      setFlags((prev) => {
        const next = new Set(prev);
        next.delete("preferiti");
        next.add("da_controllare");
        return next;
      });
    }
  }, [recheckCount]);
  // Raccolta unica: i prodotti contati non ancora in Lista compaiono una sola volta, con la stessa card.
  const showPending = Boolean(
    evaluating && cycle && !cycle.evaluated_at && (!list || list.id === linkedList?.id),
  );
  const { allCounted, images: countedImages } = useInventoryCountedRows(companyId, showPending ? (cycle?.session_id ?? null) : null);
  const savedEvaluations = useEvaluationRows(showPending ? (cycle?.session_id ?? null) : null);
  const saveEvaluation = useSaveEvaluation(cycle?.session_id ?? null);
  const listProductIds = useMemo(
    () => new Set(linkedList && list?.id === linkedList.id ? allRows.map((row) => row.product_id) : []),
    [allRows, linkedList, list?.id],
  );
  const pendingProductIds = useMemo(
    () => (showPending ? [...new Set(allCounted.map((row) => row.product_id))].sort() : []),
    [showPending, allCounted],
  );
  // Stesso Preferito dell'Inventario anche per i prodotti «Da valutare».
  const pendingFavoritesQuery = useQuery({
    queryKey: ["shopping-extras-favorites", companyId, "pending", pendingProductIds],
    enabled: pendingProductIds.length > 0,
    queryFn: async () => new Set(await readFavorites({ data: { companyId, productIds: pendingProductIds } })),
  });
  const pendingFavorites = pendingFavoritesQuery.data ?? EMPTY_SET;
  // Tutta l'anagrafica fornitori e, per prodotto, i fornitori associati (per il filtro).
  const supplierRecordsQuery = useQuery({
    queryKey: ["shopping-filter-suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_records")
        .select("id, legal_name")
        .eq("buyer_company_id", companyId)
        .order("legal_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; legal_name: string }[];
    },
  });
  const productLinksQuery = useQuery({
    queryKey: ["shopping-filter-links", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("product_id, supplier_record_id")
        .eq("company_id", companyId)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      const map = new Map<string, Set<string>>();
      for (const link of data ?? []) {
        const set = map.get(link.product_id as string) ?? new Set<string>();
        set.add(link.supplier_record_id as string);
        map.set(link.product_id as string, set);
      }
      return map;
    },
  });
  const pendingEntries = useMemo<Entry[]>(
    () =>
      showPending
        ? allCounted
            .filter((row) => !listProductIds.has(row.product_id))
            .map((row) => ({
              kind: "pending" as const,
              row: pendingOverviewRow(row),
              extra: {
                category: row.category,
                imageUrl: countedImages.get(row.product_id) ?? null,
                isFavorite: pendingFavorites.has(row.product_id),
                suppliers: [],
                orderState: null as unknown as RowExtras["orderState"],
                lockedAt: null,
                inventoryChangedAt: null,
                inventoryPreviousQuantity: null,
                decidedUnitId: null,
                decidedUnitCode: null,
              },
              stock: { lastQuantity: row.counted, lastUnit: row.unit, lastAt: null, stock: row.stock, stockUnit: row.stockUnit },
            }))
        : [],
    [showPending, allCounted, listProductIds, countedImages, pendingFavorites],
  );
  const categories = useMemo(
    () =>
      [
        ...new Set(
          [...[...extras.values()].map((row) => row.category), ...pendingEntries.map((entry) => entry.extra?.category)].filter(
            Boolean,
          ) as string[],
        ),
      ].sort(),
    [extras, pendingEntries],
  );
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of supplierRecordsQuery.data ?? []) map.set(record.id, record.legal_name);
    for (const row of extras.values()) for (const supplier of row.suppliers) map.set(supplier.supplierRecordId, supplier.name);
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1], "it"));
  }, [extras, supplierRecordsQuery.data]);

  // Filtri e ordinamento solo in vista: nessuna scrittura.
  const entries = useMemo<Entry[]>(() => {
    const term = search.trim().toLowerCase();
    const all: Entry[] = [
      ...allRows.map((row) => ({
        kind: "list" as const,
        row,
        extra: extras.get(row.item_id),
        stock: stockQuery.data?.get(row.product_id),
      })),
      ...pendingEntries,
    ];
    const filtered = all.filter(({ row, kind, extra }) => {
      if (term && !row.code.toLowerCase().includes(term) && !(row.description ?? "").toLowerCase().includes(term)) return false;
      if (category !== "all" && extra?.category !== category) return false;
      if (
        supplierFilter !== "all" &&
        !extra?.suppliers.some((s) => s.supplierRecordId === supplierFilter) &&
        !productLinksQuery.data?.get(row.product_id)?.has(supplierFilter)
      )
        return false;
      if (flags.size) {
        const suppliers = extra?.suppliers ?? [];
        if (flags.has("senza_fornitore") && suppliers.length > 0) return false;
        if (flags.has("b2b") && !suppliers.some((s) => s.isB2B)) return false;
        if (flags.has("non_b2b") && !suppliers.some((s) => !s.isB2B)) return false;
        if (flags.has("preferiti") && !extra?.isFavorite) return false;
        const statusFlags = (["da_assegnare", "parziale", "assegnata"] as const).filter((f) => flags.has(f));
        if (statusFlags.length && (kind === "pending" || !(statusFlags as readonly string[]).includes(row.status))) return false;
        if (flags.has("in_ordine") && extra?.orderState !== "ordinato") return false;
        if (flags.has("da_ordinare") && extra?.orderState === "ordinato") return false;
        if (flags.has("da_confermare") && extra?.lockedAt) return false;
        if (flags.has("confermati") && !extra?.lockedAt) return false;
        if (flags.has("da_controllare") && !(extra?.inventoryChangedAt && extra?.orderState !== "ordinato")) return false;
      }
      return true;
    });
    const key = ({ row, extra }: Entry) => {
      if (sortBy === "code") return row.code;
      if (sortBy === "category") return `${extra?.category ?? "\uffff"} ${row.description ?? ""}`;
      if (sortBy === "supplier") return `${extra?.suppliers[0]?.name ?? "\uffff"} ${row.description ?? ""}`;
      return row.description ?? row.code;
    };
    return [...filtered].sort((left, right) => key(left).localeCompare(key(right), "it", { numeric: true }));
  }, [allRows, extras, stockQuery.data, pendingEntries, search, category, supplierFilter, flags, sortBy, productLinksQuery.data]);

  // ★ Preferiti spento: stessa vista, alimentata anche dai prodotti propri e dai cataloghi B2B (sola lettura).
  const catalogArchiveId = list?.archive_id ?? archivesQuery.data?.[0]?.id ?? "";
  const showCatalog = !flags.has("preferiti") && Boolean(list || (previewMode && catalogArchiveId));
  const catalog = useCatalogEntries({ companyId, archiveId: catalogArchiveId, enabled: showCatalog });
  const catalogActions = useCatalogActions({ companyId, listId: list?.id ?? null, resolveListId: ensureInventoryList });
  const [catalogLimit, setCatalogLimit] = useState(60);
  const catalogFiltered = useMemo<CatalogEntry[]>(() => {
    if (!showCatalog) return [];
    const blocking = ["da_assegnare", "parziale", "assegnata", "in_ordine", "da_ordinare", "da_confermare", "confermati", "da_controllare"] as const;
    if (blocking.some((f) => flags.has(f as FilterFlag))) return [];
    const shown = new Set<string>([...allRows.map((r) => r.product_id), ...pendingEntries.map((e) => e.row.product_id)]);
    const term = search.trim().toLowerCase();
    return catalog.entries.filter((e) => {
      if (e.ownProductId && shown.has(e.ownProductId)) return false;
      if (term && !e.code.toLowerCase().includes(term) && !(e.description ?? "").toLowerCase().includes(term)) return false;
      if (category !== "all" && e.category !== category) return false;
      if (supplierFilter !== "all" && !e.supplierRecordIds.includes(supplierFilter)) return false;
      if (flags.has("senza_fornitore") && e.supplierRecordIds.length > 0) return false;
      if (flags.has("b2b") && !e.isB2b) return false;
      if (flags.has("non_b2b") && e.isB2b) return false;
      return true;
    });
  }, [showCatalog, catalog.entries, allRows, pendingEntries, search, category, supplierFilter, flags]);
  // Un solo ordinamento per card della Lista e prodotti non in lista: la stella non sposta nulla.
  const merged = useMemo(() => {
    type Item = { kind: "entry"; value: Entry; sortKey: string } | { kind: "catalog"; value: CatalogEntry; sortKey: string };
    const entryKey = ({ row, extra }: Entry) => {
      if (sortBy === "code") return row.code;
      if (sortBy === "category") return `${extra?.category ?? "\uffff"} ${row.description ?? ""}`;
      if (sortBy === "supplier") return `${extra?.suppliers[0]?.name ?? "\uffff"} ${row.description ?? ""}`;
      return row.description ?? row.code;
    };
    const catKey = (e: CatalogEntry) => {
      if (sortBy === "code") return e.code;
      if (sortBy === "category") return `${e.category ?? "\uffff"} ${e.description ?? ""}`;
      if (sortBy === "supplier") return `${e.supplierNames[0] ?? "\uffff"} ${e.description ?? ""}`;
      return e.description ?? e.code;
    };
    const items: Item[] = [
      ...entries.map((value) => ({ kind: "entry" as const, value, sortKey: entryKey(value) })),
      ...catalogFiltered.map((value) => ({ kind: "catalog" as const, value, sortKey: catKey(value) })),
    ];
    items.sort((l, r) => l.sortKey.localeCompare(r.sortKey, "it", { numeric: true }) || (l.kind === "entry" ? l.value.row.code : l.value.code).localeCompare(r.kind === "entry" ? r.value.row.code : r.value.code, "it"));
    // Limite solo sui prodotti non in lista: le card della Lista si vedono sempre tutte.
    let count = 0;
    return items.filter((item) => item.kind === "entry" || ++count <= catalogLimit);
  }, [entries, catalogFiltered, sortBy, catalogLimit]);
  const catalogHidden = Math.max(0, catalogFiltered.length - catalogLimit);
  const catalogImages = useCatalogImages(merged.filter((i) => i.kind === "catalog").map((i) => i.value as CatalogEntry));

  const summary = useMemo(
    () => ({
      total: allRows.length,
      assigned: allRows.filter((row) => row.status === "assegnata").length,
      partial: allRows.filter((row) => row.status === "parziale").length,
      open: allRows.filter((row) => row.status === "da_assegnare").length,
    }),
    [allRows],
  );
  // La Lista si conferma solo con ogni prodotto ripartito: prima si spiega, poi il database verifica comunque.
  const confirmBlocked = summary.open > 0;
  const confirmBlockedTitle = confirmBlocked
    ? `${summary.open} prodott${summary.open === 1 ? "o" : "i"} senza fornitore, quantità e U.M. d'acquisto`
    : undefined;
  const activeFilters = flags.size + (category !== "all" ? 1 : 0) + (supplierFilter !== "all" ? 1 : 0);
  const hiddenFields = DISPLAY_FIELDS.filter(([field]) => !display.prefs[field]).length;
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
              · {supplier.quantity === null
                ? `${supplier.purchaseQuantity === null ? "—" : qty(supplier.purchaseQuantity)} ${supplier.purchaseUnitCode ?? ""}`
                : `${qty(supplier.quantity)} ${row.unit_code ?? ""}`}
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
      disabled={!editable || Boolean(extras.get(row.item_id)?.lockedAt)}
      value={edits[row.item_id] ?? (row.decided_quantity === null ? "" : String(row.decided_quantity))}
      aria-label={`Quantità decisa ${row.code}`}
      onChange={(event) => setEdits((current) => ({ ...current, [row.item_id]: event.target.value }))}
      onBlur={() => {
        const raw = edits[row.item_id];
        if (raw === undefined) return;
        // Campo svuotato: obiettivo non indicato (mai 0).
        if (raw.trim() === "") {
          if (row.decided_quantity !== null) quantityMutation.mutate({ itemId: row.item_id, quantity: null });
          return;
        }
        const value = parseQuantity(raw);
        if (value && value !== Number(row.decided_quantity)) {
          quantityMutation.mutate({ itemId: row.item_id, quantity: value });
        }
      }}
    />
  );

  // «Da valutare»: la quantità viene salvata nel database uscendo dal campo (decisione persistente).
  const persistPending = (productId: string, raw: string) => {
    const text = raw.trim();
    const quantity = text ? parseQuantity(text) : null;
    if (text && (quantity === null || quantity <= 0)) return;
    const current = savedEvaluations.get(productId);
    if (!text && current?.status === "non_acquistare") return;
    const next = statusFromQuantity(quantity);
    if ((current?.status ?? "da_valutare") === next.status && (current?.decided_quantity ?? null) === next.quantity) return;
    saveEvaluation.mutate({ productId, ...next });
  };
  const decidePending = (productId: string, status: EvaluationStatus) => {
    setEvalValues((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    saveEvaluation.mutate({ productId, status, quantity: null });
  };
  const pendingInput = (row: OverviewRow) => (
    <span className="flex min-w-0 flex-1 items-center gap-1">
    {savedEvaluations.get(row.product_id)?.status === "non_acquistare" ? null : (
    <Input
      onBlur={(event) => persistPending(row.product_id, event.target.value)}
      className="h-9 min-w-0 flex-1 text-right text-base font-bold"
      inputMode="decimal"
      placeholder="—"
      disabled={!(editable || previewMode)}
      value={evalValues[row.product_id] ?? ""}
      aria-label={`Da acquistare ${row.code}`}
      onChange={(event) => setEvalValues((current) => ({ ...current, [row.product_id]: event.target.value }))}
    />
    )}
    <EvaluationDecision
      status={savedEvaluations.get(row.product_id)?.status}
      disabled={!(editable || previewMode) || saveEvaluation.isPending}
      onDecide={(status) => decidePending(row.product_id, status)}
    />
    </span>
  );
  const pendingQuickAdd = (row: OverviewRow, step: number) => {
    const base = parseQuantity(evalValues[row.product_id] ?? "") ?? 0;
    const value = String(Math.round((base + step) * 1000) / 1000);
    setEvalValues((current) => ({ ...current, [row.product_id]: value }));
    persistPending(row.product_id, value);
  };

  // Tasti rapidi: cambiano solo la quantità totale da acquistare, mai le ripartizioni. Nessuna conversione.
  const quickAdd = (row: OverviewRow, step: number) => {
    const raw = edits[row.item_id];
    const base = raw !== undefined ? (parseQuantity(raw) ?? 0) : Number(row.decided_quantity ?? 0);
    const next = Math.round((base + step) * 1000) / 1000;
    setEdits((current) => ({ ...current, [row.item_id]: String(next) }));
    quantityMutation.mutate({ itemId: row.item_id, quantity: next });
  };

  const lockMutation = useMutation({
    mutationFn: (input: { itemId: string; locked: boolean }) => runLock({ data: input }),
    onSuccess: async (_r, input) => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-extras-locks"] });
      toast.success(input.locked ? "Quantità confermata" : "Quantità sbloccata");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Conferma: salva prima un'eventuale quantità ancora in scrittura, poi blocca.
  const toggleLock = async (row: OverviewRow) => {
    const locked = Boolean(extras.get(row.item_id)?.lockedAt);
    if (!locked) {
      const raw = edits[row.item_id];
      const value = raw === undefined ? null : parseQuantity(raw);
      if (value && value !== Number(row.decided_quantity)) {
        await quantityMutation.mutateAsync({ itemId: row.item_id, quantity: value });
      }
    }
    lockMutation.mutate({ itemId: row.item_id, locked: !locked });
  };

  // «Da valutare» → Conferma: una sola operazione nel database (Lista + prodotto + quantità + blocco).
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const confirmingRef = useRef<Set<string>>(new Set());
  const confirmPending = async (row: OverviewRow) => {
    const quantity = parseQuantity(evalValues[row.product_id] ?? "");
    if (!quantity || quantity <= 0) {
      toast.error("Inserisci una quantità prima di confermare");
      return;
    }
    if (confirmingRef.current.has(row.product_id)) return;
    confirmingRef.current.add(row.product_id);
    setConfirmingIds(new Set(confirmingRef.current));
    try {
      const result = await runConfirm({
        data: {
          companyId,
          productId: row.product_id,
          quantity,
          listId: linkedList?.id ?? null,
          sessionId: linkedList ? null : (cycle?.session_id ?? null),
          archiveId: archivesQuery.data?.[0]?.id ?? null,
        },
      });
      setEvalValues((current) => {
        const next = { ...current };
        delete next[row.product_id];
        return next;
      });
      if (!linkedList) setListId(result.list_id);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-locks"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-list-origins", companyId] }),
      ]);
      toast.success("Quantità confermata");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conferma non riuscita");
    } finally {
      confirmingRef.current.delete(row.product_id);
      setConfirmingIds(new Set(confirmingRef.current));
    }
  };

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
      {row.suggested_quantity !== null && row.decided_quantity !== null && Number(row.suggested_quantity) !== Number(row.decided_quantity) ? (
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
      {row.remaining !== null && row.remaining < 0 ? (
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
                  {listLabel(row)} · {LIST_STATUS_LABEL[row.status]}
                </SelectItem>
              ))}
              {lists.some((row) => row.status === "chiusa" || row.status === "annullata") ? (
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Storico</div>
              ) : null}
              {lists.filter((row) => row.status === "chiusa" || row.status === "annullata").map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {listLabel(row)} · {LIST_STATUS_LABEL[row.status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {list ? <Badge variant={editable ? "default" : "secondary"}>{LIST_STATUS_LABEL[list.status]}</Badge> : null}
          {list ? <ListDeliveryDate companyId={companyId} list={list} editable={editable} /> : null}
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
              <Button type="button" size="sm" disabled={listMutation.isPending} onClick={() => setCloseOpen(true)}>
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
          {list?.number ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/acquisti/lista-spesa/stampa/$listId" params={{ listId: list.id }} search={{ tipo: "completa" }}>
                  Visualizza / Stampa
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/acquisti/lista-spesa/stampa/$listId" params={{ listId: list.id }} search={{ tipo: "diretti" }}>
                  Stampa acquisti diretti
                </Link>
              </Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
            Storico liste
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={listMutation.isPending || !archivesQuery.data?.length}
            title="Lista straordinaria, non collegata all'inventario"
            onClick={() => listMutation.mutate("open")}
          >
            <Plus aria-hidden="true" />
            Nuova lista
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <AlarmClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold">Preparazione Lista della Spesa</span>
          <span className="text-muted-foreground">
            {scheduleQuery.isLoading ? "…" : describeOperationalSchedule(scheduleQuery.data)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && scheduleQuery.data ? (
            <Popover open={overrideOpen} onOpenChange={setOverrideOpen}>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs">
                  Cambia orario
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3">
                <p className="text-xs font-medium">A che ora vuoi il promemoria?</p>
                <TimeWheelPicker value={overrideTime} onChange={setOverrideTime} />
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    disabled={overrideMutation.isPending}
                    onClick={() => overrideMutation.mutate(overrideTime)}
                  >
                    Solo oggi
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/amministrazione" search={{ sezione: "preferenze" }}>
                      Sempre (in Azienda → Preferenze)
                    </Link>
                  </Button>
                  {hasTodayOverride(scheduleQuery.data) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={overrideMutation.isPending}
                      onClick={() => overrideMutation.mutate(null)}
                    >
                      Annulla l'eccezione di oggi
                    </Button>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
            <Link to="/amministrazione" search={{ sezione: "preferenze" }}>
              Modifica in Azienda → Preferenze
            </Link>
          </Button>
        </div>
      </div>

      {!list && !previewMode && !listsQuery.isLoading ? (() => {
        // Ciclo concluso: la zona operativa è vuota, il passato vive nello Storico.
        const lastClosed = lists
          .filter((row) => row.status === "chiusa" && row.number)
          .sort((a, b) => String(b.closed_at ?? "").localeCompare(String(a.closed_at ?? "")))[0];
        return (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-base font-bold">Nessuna lista in corso</p>
            {lastClosed ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Ultima: <strong>{lastClosed.number}</strong>
                {lastClosed.closed_at ? ` · chiusa il ${new Date(lastClosed.closed_at).toLocaleDateString("it-IT")}` : ""}
              </p>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setHistoryOpen(true)}>
              Storico liste
            </Button>
          </div>
        );
      })() : null}

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

      {/* Unica scelta Card/Righe: vale sia per «Da inventario» sia per la Lista. */}
      {(evaluating && cycle) || list ? (
        <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Vista prodotti</span>
          <div className="grid grid-cols-2 rounded-md border border-border p-0.5" role="group" aria-label="Visualizzazione prodotti">
            <Button type="button" size="sm" className="h-8 text-xs" variant={viewMode === "card" ? "default" : "ghost"} aria-pressed={viewMode === "card"} onClick={() => changeViewMode("card")}>
              <LayoutGrid aria-hidden="true" /> Card
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" variant={viewMode === "row" ? "default" : "ghost"} aria-pressed={viewMode === "row"} onClick={() => changeViewMode("row")}>
              <Rows3 aria-hidden="true" /> Righe
            </Button>
          </div>
        </div>
      ) : null}

      {evaluating && cycle && (!list || list.id === linkedList?.id) ? (
        <InventoryEvaluation
          companyId={companyId}
          cycle={cycle}
          linkedList={linkedList}
          existingProductIds={listProductIds}
          onEnsureList={ensureInventoryList}
          layout={viewMode}
          values={evalValues}
          onValuesChange={setEvalValues}
          hideItems
        />
      ) : cycle?.color === "rosso" && cycle.evaluated_at && (!list || list.id === cycle.list_id) ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <span className="font-semibold">Ciclo acquisti da completare:</span> valutazione terminata,{" "}
          {cycle.cycle_outcome === "da_verificare"
            ? `ciclo chiuso con ${cycle.to_verify} elementi da verificare.`
            : `${cycle.missing_orders} acquisti ancora senza ordine.`}{" "}
          <Link className="underline" to="/acquisti/ordini">Vai agli Ordini</Link>
        </p>
      ) : null}

      {!list && !showPending ? (
        <p className="text-sm text-muted-foreground">
          Nessuna Lista in lavorazione. Usa «+ Nuova lista» oppure consulta lo Storico dal menu delle liste.
        </p>
      ) : (
        <>
          {list ? (
          <p className="text-xs text-muted-foreground">
            Creata {dateTimeShort(list.created_at)}
            {list.confirmed_at ? ` · confermata ${dateTimeShort(list.confirmed_at)}` : ""}
            {list.closed_at ? ` · chiusa ${dateTimeShort(list.closed_at)}` : ""}
          </p>
          ) : null}

          {/* Barra operativa */}
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card p-1.5 lg:top-0">
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className={`h-8 pl-7 text-xs${search ? " border-primary bg-primary/10 font-medium text-primary" : ""}`}
                value={search}
                placeholder="Cerca prodotto"
                aria-label="Cerca prodotto in lista"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={`h-8 w-36 text-xs${category !== "all" ? " border-primary bg-primary font-medium text-primary-foreground" : ""}`} aria-label="Categoria">
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
              <SelectTrigger className={`h-8 w-36 text-xs${supplierFilter !== "all" ? " border-primary bg-primary font-medium text-primary-foreground" : ""}`} aria-label="Fornitore">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                {supplierOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Il filtro Preferiti resta sempre visibile: un tocco lo accende, un altro lo spegne. */}
            <Button
              type="button"
              size="sm"
              variant={flags.has("preferiti") ? "default" : "outline"}
              className="h-8 px-2 text-xs"
              aria-pressed={flags.has("preferiti")}
              onClick={() => toggleFlag("preferiti", !flags.has("preferiti"))}
            >
              ★ Preferiti
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant={flags.size ? "default" : "outline"} className="h-8 px-2 text-xs">
                  <SlidersHorizontal aria-hidden="true" />
                  Filtra card{flags.size ? ` (${flags.size})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="px-1 pb-1 text-[11px] text-muted-foreground">Quali prodotti voglio vedere?</p>
                <div className="grid gap-2">
                  {FILTER_GROUPS.map(([title, group]) => (
                    <div key={title}>
                      <p className="px-1 text-[10px] font-semibold uppercase text-muted-foreground">{title}</p>
                      {group.map(([flag, label]) => (
                        <label key={flag} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                          <Checkbox checked={flags.has(flag)} onCheckedChange={(checked) => toggleFlag(flag, checked === true)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {/* Solo i filtri cliccati si vedono: un'etichetta ciascuno, la ✕ lo toglie. */}
            {FILTER_GROUPS.flatMap(([, group]) => group)
              .filter(([flag]) => flag !== "preferiti" && flags.has(flag))
              .map(([flag, label]) => (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag, false)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-primary bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/85"
                  aria-label={`Togli il filtro ${label}`}
                >
                  {label}
                  <X className="size-3 text-primary-foreground/70" aria-hidden="true" />
                </button>
              ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant={hiddenFields ? "default" : "outline"} className="h-8 px-2 text-xs">
                  <Eye aria-hidden="true" />
                  Visualizza dati{hiddenFields ? ` (${hiddenFields} nascosti)` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="px-1 pb-1 text-[11px] text-muted-foreground">
                  Cosa vedere dentro le card. Non nasconde prodotti e non modifica dati.
                </p>
                <div className="grid max-h-80 gap-0.5 overflow-y-auto">
                  {DISPLAY_FIELDS.map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                      <Checkbox checked={display.prefs[field]} onCheckedChange={(checked) => display.setField(field, checked === true)} />
                      {label}
                    </label>
                  ))}
                </div>
                {hiddenFields ? (
                  <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" onClick={display.reset}>
                    Mostra tutto
                  </Button>
                ) : null}
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
            {editable || (!list && previewMode) ? (
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

          <div className="@container">
          <div
            className={
              viewMode === "card"
                ? // Colonne decise dallo spazio reale, massimo 4: card compatta (172px) solo su spazi stretti, altrimenti almeno 232px.
                  "grid grid-cols-1 items-start gap-2 @min-[600px]:grid-cols-[repeat(auto-fill,minmax(max(290px,calc((100%_-_1.5rem)/4)),1fr))]"
                : "grid grid-cols-1 gap-1.5"
            }
          >
            {merged.map((item) => {
              if (item.kind === "catalog") {
                const entry = item.value;
                return (
                  <CatalogProductCard
                    key={entry.key}
                    entry={entry}
                    layout={viewMode}
                    imageUrl={catalogImages.get(entry.key) ?? null}
                    isFavorite={Boolean(entry.ownProductId && catalog.favorites.has(entry.ownProductId))}
                    favoriteDisabled={catalogActions.favorite.isPending || (Boolean(entry.ownProductId) && !catalog.favoritesReady)}
                    canAdd={Boolean(editable || previewMode)}
                    adding={catalogActions.add.isPending}
                    onToggleFavorite={() =>
                      catalogActions.favorite.mutate({
                        entry,
                        value: !(entry.ownProductId && catalog.favorites.has(entry.ownProductId)),
                      })
                    }
                    onAdd={(quantity, unitCode) => catalogActions.add.mutate({ entry, quantity, unitCode })}
                  />
                );
              }
              const { kind, row, extra, stock } = item.value;
              return kind === "pending" ? (
                <ShoppingListCard
                  key={row.item_id}
                  show={display.prefs}
                  pending
                  layout={viewMode}
                  row={row}
                  extra={extra}
                  stock={stock}
                  editable={Boolean(editable || previewMode)}
                  quantityInput={pendingInput(row)}
                  onQuickAdd={(step) => pendingQuickAdd(row, step)}
                  companyId={companyId}
                  favoritePending={favoriteMutation.isPending}
                  onToggleFavorite={() => favoriteMutation.mutate({ productId: row.product_id, favorite: !pendingFavorites.has(row.product_id) })}
                  onOpenSuppliers={() => undefined}
                  onRemove={() => undefined}
                  pendingQuantity={parseQuantity(evalValues[row.product_id] ?? "")}
                  evaluation={savedEvaluations.get(row.product_id)}
                  lockPending={confirmingIds.has(row.product_id)}
                  onToggleLock={() => void confirmPending(row)}
                />
              ) : (
              <ShoppingListCard
                key={row.item_id}
                show={display.prefs}
                companyId={companyId}
                layout={viewMode}
                onQuickAdd={(step) => quickAdd(row, step)}
                row={row}
                extra={extra}
                stock={stock}
                editable={Boolean(editable)}
                quantityInput={quantityInput(row, "h-9 min-w-0 flex-1 text-right text-base font-bold")}
                favoritePending={favoriteMutation.isPending}
                onToggleFavorite={() =>
                  favoriteMutation.mutate({ productId: row.product_id, favorite: !extras.get(row.item_id)?.isFavorite })
                }
                onOpenSuppliers={() => setSplitItem(row)}
                onRemove={() => removeMutation.mutate(row.item_id)}
                onToggleLock={() => void toggleLock(row)}
                lockPending={lockMutation.isPending || quantityMutation.isPending}
                onClearQuantity={() => {
                  setEdits((current) => ({ ...current, [row.item_id]: "" }));
                  if (row.decided_quantity !== null) quantityMutation.mutate({ itemId: row.item_id, quantity: null });
                }}
                onUnitChange={(unitId, unitCode) => {
                  const raw = edits[row.item_id];
                  const value = raw !== undefined ? parseQuantity(raw) : row.decided_quantity === null ? null : Number(row.decided_quantity);
                  quantityMutation.mutate({ itemId: row.item_id, quantity: value ?? null, unitId, unitCode });
                }}
              />
              );
            })}
          </div>
          </div>
          {catalogHidden ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setCatalogLimit((v) => v + 60)}>
              Mostra altri prodotti ({catalogHidden})
            </Button>
          ) : null}
          {showCatalog && catalog.loading ? <p className="text-xs text-muted-foreground">Caricamento prodotti dei fornitori…</p> : null}

          {!merged.length && !overviewQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {allRows.length || pendingEntries.length ? "Nessun prodotto con questi filtri." : "Nessun prodotto."}
            </p>
          ) : null}

          {/* Riepilogo finale: nessun pulsante fisso */}
          {list && allRows.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span>
                <strong>{summary.total}</strong> prodotti · <strong>{summary.assigned}</strong> assegnati ·{" "}
                <strong>{summary.partial}</strong> parziali · <strong>{summary.open}</strong> da assegnare
                {pendingEntries.length ? ` · ${pendingEntries.length} da valutare` : ""}
                {summary.open ? (
                  <span className="block text-muted-foreground">
                    I prodotti senza fornitore diventeranno acquisti diretti.
                  </span>
                ) : null}
              </span>
              {editable ? (
                <Button type="button" size="sm" className="h-8" disabled={listMutation.isPending} onClick={() => setCloseOpen(true)}>
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

      {addOpen && (list || (previewMode && archivesQuery.data?.[0])) ? (
        <AddProductsDialog
          companyId={companyId}
          listId={list?.id ?? null}
          resolveListId={ensureInventoryList}
          archiveId={list?.archive_id ?? archivesQuery.data?.[0]?.id ?? ""}
          existingProductIds={new Set(allRows.map((row) => row.product_id))}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      ) : null}

      {closeOpen && list && editable ? (
        <CloseListDialog
          companyId={companyId}
          listId={list.id}
          open={closeOpen}
          onOpenChange={setCloseOpen}
          onClosed={() => {
            setCloseOpen(false);
            // Area operativa pulita: la prossima azione crea una nuova Lista.
            setListId(null);
          }}
          onGoToItem={(itemId) => {
            setCloseOpen(false);
            window.setTimeout(() => document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
          }}
        />
      ) : null}
      <ListHistoryDialog companyId={companyId} open={historyOpen} onOpenChange={setHistoryOpen} />

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
