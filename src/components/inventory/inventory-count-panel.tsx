import { resolveDraftTarget } from "@/lib/inventory-draft-transfer";
import { inventorySnapshotQuantity, type InventoryQuantitySnapshot } from "@/lib/inventory-snapshot";
import { afterInventoryDraftWrites, confirmAllSummary, inventoryBulkReview, inventoryDraftQuantity, type ConfirmAllResult, type InventoryBulkReview, type InventoryReviewCard } from "@/lib/inventory-confirm-all";
import { InventoryConfirmAllDialog } from "./inventory-confirm-all-dialog";
import { inventoryResetAction, inventoryReopenQueryKeys } from "@/lib/inventory-reset";
import { inventoryCompactBar } from "@/lib/inventory-scroll";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CYCLE_QUERY_KEY } from "@/components/shopping/inventory-to-evaluate";
import { getInventoryCycleStatus, type CycleStatus } from "@/lib/inventory-cycle.functions";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronDown,
  CheckCheck,
  CircleAlert,
  ClipboardCheck,
  Columns3,
  LayoutGrid,
  List,
  Delete,
  ExternalLink,
  History,
  MapPin,
  MoreVertical,
  Package,
  PackageSearch,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Lock,
  Pencil,
  StickyNote,
  TriangleAlert,
} from "lucide-react";

import { FullInventoryStartButton, InventoryExtraCards } from "./inventory-add-cards";
import { HabitualZoneControl, HabitualZonesProvider, useHabitualMap } from "./habitual-zone-control";
import { pickCardMinWidth } from "@/lib/inventory-card-size";
import { habitualFirst, matchesHabitual, NO_HABITUAL, type HabitualFilter } from "@/lib/habitual-locations";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useVisualViewportBottom } from "@/hooks/use-visual-viewport-bottom";
import { toast } from "sonner";

import { PriceTrendIcon } from "@/components/pricing/price-trend-icon";
import { fetchPriceSeriesForProducts, type PriceSeriesRow } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useInventoryLocations } from "@/components/inventory/inventory-locations-manager";
import { InventoryRequirementsPanel } from "@/components/inventory/inventory-requirements-panel";
import {
  useInventoryFieldPreferences,
  type InventoryFieldId,
} from "@/components/inventory/use-inventory-fields";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCatalogImageUrls } from "@/lib/catalog.functions";
import {
  adoptCatalogProduct,
  closeGeneralInventory,
  getCountHistory,
  getInventoryProgress,
  getInventoryRows,
  getInventoryScreenVersion,
  manageCardFavorite,
  getFavoriteProductIds,
  getCompanyHasFavorites,
  getSupplierCatalogCandidates,
  manageCatalogProductFavorite,
  manageCompanyProductFavorite,
  managePurchaseProposal,
  recordCountEntry,
  startGeneralInventory,
  manageCountDraft,
  confirmAllInventoryDrafts,
  reopenInventoryCount,
  resetOpenInventoryCount,
  type CatalogCandidate,
  type CountHistoryEntry,
  type InventoryCountRow,
  type InventoryProgress,
} from "@/lib/inventory-count.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { cn } from "@/lib/utils";
import {
  buildInventoryPrintHtml, cardPercentage, findSearchElsewhere, isFavoriteCard, selectInventoryCards, summarizeCards,
  type CardFilterKey, type InventoryCardFilters, type InventoryPrintMode, type InventoryPrintRow, type SearchElsewhere,
} from "@/lib/inventory-print";
import { inventoryCardLocked, afterInventoryCardSave, canEditInventoryCard } from "@/lib/inventory-card-lock";
import { CorrectCountDialog, type CountCorrectionTarget } from "@/components/inventory/correct-count-dialog";
import { usePhysicalCorrection, type PhysicalEdit, type PhysicalQuickEditTarget } from "@/components/inventory/physical-quick-edit";
import { InventorySessionCounter } from "@/components/inventory/inventory-session-counter";
import { dateTimeShort, type SessionRow } from "@/lib/inventory";
import { inventoryDefaultUnitId } from "@/lib/inventory-unit-default";
import { INVENTORY_SCREEN_VERSION, cardKey, cardTitle, compareCards, groupKey, parseCardKey, productCardTotal, rowCardKey } from "@/lib/inventory-cards";
import { InventoryHistoryDialog, sessionAuthorName } from "@/components/inventory/inventory-history-dialog";
import { InventoryProductDialog } from "@/components/inventory/inventory-product-dialog";

type ProductView = "favorites" | "all";
type WorkFilter = "all" | "pending" | "completed" | "differences" | "not_comparable" | "recount" | "missing_unit";
const WORK_FILTER_LABELS: Record<WorkFilter, string> = {
  all: "Tutti gli stati",
  pending: "Da controllare",
  completed: "Confermati",
  differences: "Differenze",
  not_comparable: "U.M. diverse",
  recount: "Da ricontare",
  missing_unit: "U.M. da impostare",
};
type SupplierInfo = { name: string | null; cost: number | null };
const FILTER_REASON_LABELS: Record<CardFilterKey, string> = {
  view: "non è tra i Preferiti", work: "ha un altro stato", search: "", location: "",
  category: "è in un'altra categoria", subcategory: "è in un'altra sottocategoria", supplier: "ha un altro fornitore",
};
function elsewhereText(found: SearchElsewhere): string {
  const parts = found.reasons.filter((reason) => reason !== "location" && reason !== "search").map((reason) => FILTER_REASON_LABELS[reason]);
  const where = found.reasons.includes("location") ? ` Trovato in: ${found.locations.map((l) => l.name).join(", ")}.` : "";
  return `Nessun risultato nei filtri attuali.${where}${parts.length ? ` Il prodotto ${parts.join(", ")}.` : ""}`;
}
type FieldPreferences = ReturnType<typeof useInventoryFieldPreferences>;

const ENTRY_LABELS: Record<string, string> = {
  conteggio: "Primo conteggio",
  riconteggio: "Riconteggio",
  segnalazione: "Segnalato non conforme",
  revoca_segnalazione: "Segnalazione revocata",
  richiesta_riconteggio: "Segnato da ricontare",
};


const NO_CATEGORY = "Senza categoria";
/** Fornitore della card (Modello 2): quello del suo collegamento, «Senza fornitore» se assente. */
const cardSupplierName = (row: InventoryCountRow) =>
  row.product_supplier_link_id ? (row.supplier_name ?? "Fornitore") : "Senza fornitore";

const NO_SUBCATEGORY = "Senza sottocategoria";

function parseQuantity(value: string) {
  return inventoryDraftQuantity(value);
}

function addToQuantity(current: string, increment: number) {
  const base = parseQuantity(current) ?? 0;
  const sum = Math.round((base + increment) * 100) / 100;
  return String(sum).replace(".", ",");
}

function formatQuantity(value: number, unit: string) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: unit === "pz" || unit === "PZ" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Chiave della card (prodotto + ubicazione + collegamento): unica in tutte le schermate. */
function rowKey(row: { product_id: string; location_id: string; product_supplier_link_id?: string | null }) {
  return rowCardKey(row);
}

/** Intestazione del gruppo di card dello stesso prodotto: totale solo con U.M. compatibili. */
function CardGroupHeader({ name, zone, cards }: { name: string; zone: string; cards: InventoryCountRow[] }) {
  const result = productCardTotal(cards);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-border bg-muted/50 px-2 py-1.5">
      <p className="font-display text-sm font-bold uppercase leading-tight">{name}</p>
      <p className="text-[11px] text-muted-foreground">{zone} · {cards.length} card</p>
      <p className="ml-auto text-[11px] font-semibold">
        {result.total !== null
          ? `Totale prodotto: ${formatQuantity(result.total, result.unit)} ${result.unit}${result.counted < cards.length ? ` (${result.counted} di ${cards.length} card contate)` : ""}`
          : result.reason === "um_diverse"
            ? "Totale non calcolabile: U.M. diverse tra le card"
            : "Totale: nessuna card contata"}
      </p>
    </div>
  );
}

function rowName(row: InventoryCountRow) {
  return row.description?.trim() || row.code;
}

/** Ordine alfabetico italiano: descrizione, con il codice come riserva. */
function byName(
  leftDescription: string | null,
  leftCode: string,
  rightDescription: string | null,
  rightCode: string,
) {
  const left = (leftDescription ?? "").trim() || leftCode;
  const right = (rightDescription ?? "").trim() || rightCode;
  return left.localeCompare(right, "it", { sensitivity: "base", numeric: true });
}


/** U.M. operativa dell'Inventario: sempre e solo la U.M. di magazzino (products.stock_unit_id). */
function rowUnit(row: InventoryCountRow) {
  return row.stock_unit_code?.trim() || "";
}

/** U.M. ammesse per prodotto; la conversione del conteggio è verificata dal database. */
const UnitChoiceContext = createContext<{
  allowed: { get: (productId: string) => { id: string; code: string }[] | undefined };
  /** Prima U.M. abituale del prodotto: automaticamente preferita nella card. */
  preferred: { get: (productId: string) => string | undefined };
  chosen: Record<string, string>;
  choose: (productId: string, unitId: string) => void;
}>({ allowed: new Map(), preferred: new Map(), chosen: {}, choose: () => {} });

const CardLockContext = createContext<{
  unlocked: Set<string>;
  toggle: (key: string) => void;
  pending: boolean;
  /** false = schermata non allineata al server: nessun salvataggio finché non si ricarica. */
  canSave: boolean;
  isAdmin: boolean;
  toggleCardFavorite: (row: InventoryCountRow) => void;
  cardFavoritePending: boolean;
  /** Numero di card per prodotto+ubicazione nell'elenco visibile. */
  groupSize: Map<string, number>;
}>({ unlocked: new Set(), toggle: () => {}, pending: false, canSave: true, isAdmin: false, toggleCardFavorite: () => {}, cardFavoritePending: false, groupSize: new Map() });

/** Semaforo rosso senza inventario aperto: campi bloccati, solo «Correggi conteggio» sui conteggi del ciclo. */
const CycleLockContext = createContext<{
  locked: boolean;
  cycleSessionId: string | null;
  onCorrect: (row: InventoryCountRow, history: StockHistory) => void;
  companyId?: string;
  listId?: string | null;
  locationId?: string | null;
  unlockedAll?: boolean;
}>({ locked: false, cycleSessionId: null, onCorrect: () => undefined });

export function InventoryCountPanel({
  companyId,
  archiveId,
  isAdmin,
  initialTab,
}: {
  companyId: string;
  archiveId: string | null;
  isAdmin: boolean;
  initialTab?: "fabbisogno";
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const start = useServerFn(startGeneralInventory);
  const close = useServerFn(closeGeneralInventory);
  const readProgress = useServerFn(getInventoryProgress);
  const readRows = useServerFn(getInventoryRows);
  const saveEntry = useServerFn(recordCountEntry);
  // U.M. ammesse per prodotto (scheda prodotto → Inventario): chi conta sceglie solo tra queste.
  const allowedUnitsQuery = useQuery({
    queryKey: ["inventory-allowed-units", companyId],
    queryFn: async () => {
      const [{ data, error }, companyUnits] = await Promise.all([
        supabase.from("product_inventory_units").select("product_id, unit_id, units_of_measure(code)").eq("company_id", companyId).order("created_at"),
        supabase.from("units_of_measure").select("id, code").eq("company_id", companyId).eq("status", "attivo").order("code"),
      ]);
      if (companyUnits.error) throw new Error(companyUnits.error.message);
      if (error) throw new Error(error.message);
      const map = new Map<string, { id: string; code: string }[]>();
      for (const row of data ?? []) {
        const code = (row.units_of_measure as { code: string } | null)?.code ?? "";
        const list = map.get(row.product_id) ?? [];
        list.push({ id: row.unit_id, code });
        map.set(row.product_id, list);
      }
      return { configured: map, companyUnits: companyUnits.data ?? [] };
    },
  });
  const [chosenUnits, setChosenUnits] = useState<Record<string, string>>({});
  const chosenUnitsRef = useRef(chosenUnits);
  chosenUnitsRef.current = chosenUnits;
  const unitChoice = {
    allowed: { get: (productId: string) => {
      const configured = allowedUnitsQuery.data?.configured.get(productId) ?? [];
      return [...configured, ...(allowedUnitsQuery.data?.companyUnits ?? []).filter((unit) => !configured.some((item) => item.id === unit.id))];
    } },
    // La prima U.M. abituale inserita sul prodotto è automaticamente la preferita della card.
    preferred: { get: (productId: string) => allowedUnitsQuery.data?.configured.get(productId)?.[0]?.id },
    chosen: chosenUnits,
    choose: (key: string, unitId: string) => {
      setChosenUnits((current) => ({ ...current, [key]: unitId }));
      chosenUnitsRef.current = { ...chosenUnitsRef.current, [key]: unitId };
      const raw = draftsRef.current[key] ?? "";
      if (raw.trim()) scheduleDraftSave(key, raw);
    },
  };
  const readHistory = useServerFn(getCountHistory);
  const manageProposal = useServerFn(managePurchaseProposal);
  const toggleFavorite = useServerFn(manageCompanyProductFavorite);
  const toggleCatalogFavorite = useServerFn(manageCatalogProductFavorite);
  const getImageUrls = useServerFn(getProductImageUrls);
  const getSellerImageUrls = useServerFn(getCatalogImageUrls);
  const readCatalogCandidates = useServerFn(getSupplierCatalogCandidates);
  const readFavoriteProductIds = useServerFn(getFavoriteProductIds);
  const readHasFavorites = useServerFn(getCompanyHasFavorites);
  const adoptProduct = useServerFn(adoptCatalogProduct);
  const readCycle = useServerFn(getInventoryCycleStatus);
  const cycleQuery = useQuery({
    queryKey: [CYCLE_QUERY_KEY, companyId],
    queryFn: () => readCycle({ data: { companyId } }),
  });
  const cycleColor = cycleQuery.data?.color;
  const [correction, setCorrection] = useState<CountCorrectionTarget | null>(null);
  const [unlockedAll, setUnlockedAll] = useState(false);


  const { data: locations = [] } = useInventoryLocations(companyId);
  const activeLocations = locations.filter((location) => location.status === "attivo");
  const defaultLocation = activeLocations.find((location) => location.is_default) ?? activeLocations[0];

  const [tab, setTab] = useState(initialTab ?? "conteggio");
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [productView, setProductView] = useState<ProductView>("favorites");
  // Con almeno un preferito la vista è fissa sui preferiti; senza preferiti si vedono tutti.
  const hasFavoritesQuery = useQuery({
    queryKey: ["company-has-favorites", companyId],
    staleTime: 60 * 1000,
    queryFn: () => readHasFavorites({ data: { companyId } }),
  });
  // Vista iniziale: preferiti se esistono, altrimenti tutti. L'utente può sempre passare a «Tutti».
  useEffect(() => {
    if (hasFavoritesQuery.data === false) setProductView("all");
  }, [hasFavoritesQuery.data]);
  const effectiveProductView: ProductView = productView;
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  // Zona abituale: filtro solo della vista (organizzativo), non cambia le card della sessione né la chiusura.
  const [habitualFilter, setHabitualFilter] = useState<HabitualFilter>(null);
  const habitualQuery = useHabitualMap(companyId);
  const habitualMap = useMemo(() => habitualQuery.data ?? new Map(), [habitualQuery.data]);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unlockedCards, setUnlockedCards] = useState<Set<string>>(new Set());
  const lockSavedCard = (key: string) => setUnlockedCards((current) => {
    const next = new Set(current);
    if (!afterInventoryCardSave(current.has(key), true)) next.delete(key);
    return next;
  });
  const [emptyRows, setEmptyRows] = useState<InventoryCountRow[] | null>(null);
  const [pending, setPending] = useState<{ row: InventoryCountRow; value: number; stockValue?: number; unit?: string } | null>(null);
  const [pendingReason, setPendingReason] = useState("");
  const [showCompletion, setShowCompletion] = useState(true);
  // Conteggio immediato senza sessione aperta: bozze per prodotto e zona scelta
  const [draftFirst, setDraftFirst] = useState<Record<string, string>>({});
  const [draftZoneId, setDraftZoneId] = useState<string | null>(null);
  // Segnalazioni: non conformità, proposta d'acquisto, storico
  const [compliance, setCompliance] = useState<InventoryCountRow | null>(null);
  const [complianceQuantity, setComplianceQuantity] = useState("");
  const [complianceNote, setComplianceNote] = useState("");
  const [proposalRow, setProposalRow] = useState<InventoryCountRow | null>(null);
  const [proposalNote, setProposalNote] = useState("");
  const [historyRow, setHistoryRow] = useState<InventoryCountRow | null>(null);
  // Scheda prodotto in finestra: l'Inventario resta montato sotto (filtri, bozze, scorrimento intatti).
  const [productDialogRow, setProductDialogRow] = useState<InventoryCountRow | null>(null);
  const productReturnScroll = useRef(0);
  const fieldPreferences = useInventoryFieldPreferences("inventario-conteggio");


  const sessionQuery = useQuery({
    queryKey: ["inventory-general-session", companyId, archiveId],
    enabled: Boolean(archiveId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("id, name, status, started_at")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId!)
        .eq("scope", "generale")
        .eq("status", "in_corso")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const sessionId = sessionQuery.data?.id ?? null;
  const [confirmedOpen, setConfirmedOpen] = useState(false);
  const [viewClosedOpen, setViewClosedOpen] = useState(false);
  const [viewedSession, setViewedSession] = useState<SessionRow | null>(null);
  const [inventoryHistoryOpen, setInventoryHistoryOpen] = useState(false);

  // Ultimo inventario generale chiuso: solo lettura, distinto dall'inventario in corso.
  const lastClosedQuery = useQuery({
    queryKey: ["inventory-last-closed", companyId, archiveId],
    enabled: Boolean(archiveId) && !sessionId && !sessionQuery.isLoading,
    queryFn: async (): Promise<{ session: SessionRow; counted: number; author: string | null } | null> => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("id, name, scope, location_id, status, archive_id, started_at, finished_at, notes, created_by")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId!)
        .eq("scope", "generale")
        .eq("status", "completata")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const { data: counts, error: countsError } = await supabase
        .from("inventory_counts")
        .select("product_id")
        .eq("session_id", data.id);
      if (countsError) throw new Error(countsError.message);
      const author = await sessionAuthorName(data.created_by);
      return { session: data as SessionRow, counted: new Set((counts ?? []).map((row) => row.product_id)).size, author };
    },
  });

  // Bozze salvate: quantità (e U.M.) scritte ma non confermate. Una bozza NON è un conteggio.
  const draftFn = useServerFn(manageCountDraft);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [savedDraftKeys, setSavedDraftKeys] = useState<Set<string>>(new Set());
  const [clearDraftsOpen, setClearDraftsOpen] = useState(false);
  const dirtyDraftKeys = useRef(new Set<string>());
  const draftWrites = useRef(new Map<string, Promise<unknown>>());
  const savedDraftUnits = useRef(new Map<string, string | null>());
  const savedDraftsQuery = useQuery({
    queryKey: ["inventory-count-drafts", sessionId],
    enabled: Boolean(sessionId),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_count_drafts")
        .select("product_id, location_id, product_supplier_link_id, quantity, unit_code" as "product_id, location_id, quantity, unit_code")
        .eq("session_id", sessionId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  useEffect(() => {
    const list = savedDraftsQuery.data;
    if (!list) return;
    // Le bozze del server (anche di un collega) vincono, tranne dove c'è un salvataggio locale in sospeso.
    setDrafts((current) => {
      const next = { ...current };
      for (const d of list) {
        const key = rowKey(d as typeof d & { product_supplier_link_id: string | null });
        savedDraftUnits.current.set(key, d.unit_code);
        if (!dirtyDraftKeys.current.has(key)) next[key] = d.quantity;
      }
      return next;
    });
    setSavedDraftKeys(new Set(list.map((d) => rowKey(d as typeof d & { product_supplier_link_id: string | null }))));
    const restored: Record<string, string> = {};
    for (const draft of list) {
      const key = rowKey(draft as typeof draft & { product_supplier_link_id: string | null });
      if (dirtyDraftKeys.current.has(key) || chosenUnitsRef.current[key]) continue;
      const option = unitChoice.allowed.get(draft.product_id)?.find((unit) => unit.code.toLowerCase() === draft.unit_code?.toLowerCase());
      if (option) restored[key] = option.id;
    }
    if (Object.keys(restored).length) {
      chosenUnitsRef.current = { ...chosenUnitsRef.current, ...restored };
      setChosenUnits((current) => ({ ...current, ...restored }));
    }
  }, [savedDraftsQuery.data, allowedUnitsQuery.data]);

  function selectedCardUnit(key: string, row?: InventoryCountRow) {
    const parsed = parseCardKey(key);
    const options = parsed ? unitChoice.allowed.get(parsed.productId) ?? [] : [];
    const preferredId = parsed ? unitChoice.preferred.get(parsed.productId) : undefined;
    const resolvedRow = row ?? allRowsQuery.data?.find((entry) => rowKey(entry) === key);
    const selectedId = chosenUnitsRef.current[key];
    const savedCode = savedDraftUnits.current.get(key);
    const code = options.find((option) => option.id === selectedId)?.code
      ?? savedCode
      ?? resolvedRow?.counted_unit_code?.trim()
      ?? options.find((option) => option.id === preferredId)?.code
      ?? resolvedRow?.stock_unit_code?.trim()
      ?? null;
    return { code, id: options.find((option) => option.code.toLowerCase() === code?.toLowerCase())?.id ?? null };
  }

  function writeDraft(key: string, raw: string) {
    if (!sessionId) return Promise.resolve();
    const card = parseCardKey(key);
    if (!card) return Promise.reject(new Error("Card di inventario non valida"));
    const { productId, locationId, linkId } = card;
    const value = raw.trim();
    const unitCode = selectedCardUnit(key).code;
    const previous = draftWrites.current.get(key) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(() => draftFn({
      data: value === ""
        ? { action: "clear_one", sessionId, productId, locationId, linkId, quantity: null, unitCode: null }
        : { action: "set", sessionId, productId, locationId, linkId, quantity: value, unitCode },
    })).then(() => {
      savedDraftUnits.current.set(key, unitCode);
      if ((draftsRef.current[key] ?? "").trim() === value && selectedCardUnit(key).code === unitCode) {
        dirtyDraftKeys.current.delete(key);
        setSavedDraftKeys((current) => {
          const next = new Set(current);
          if (value) next.add(key); else next.delete(key);
          return next;
        });
      }
    });
    draftWrites.current.set(key, write);
    void write.then(() => {
      if (draftWrites.current.get(key) === write) draftWrites.current.delete(key);
    }, () => undefined);
    return write;
  }

  // Await all writes, including requests already running. Failures preserve dirty values for retry.
  async function flushDraftWrites() {
    for (const key of Object.keys(draftTimers.current)) {
      clearTimeout(draftTimers.current[key]);
      delete draftTimers.current[key];
    }
    const writes = [...dirtyDraftKeys.current].map((key) => writeDraft(key, draftsRef.current[key] ?? ""));
    await afterInventoryDraftWrites([...draftWrites.current.values(), ...writes], async () => undefined);
  }
  const flushRef = useRef<() => void>(() => undefined);
  flushRef.current = () => { void flushDraftWrites().catch(() => undefined); };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushRef.current(); };
    const onPageHide = () => flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flushRef.current();
    };
  }, []);

  // Prima quantità scritta senza inventario aperto: apre l'inventario e porta le quantità in bozza.
  const autoStartRef = useRef(false);
  const [autoStartPending, setAutoStartPending] = useState(false);
  // Il trasferimento in bozza avviene più sotto, quando le card della sessione sono caricate.

  function scheduleDraftSave(key: string, raw: string) {
    if (!sessionId) return;
    dirtyDraftKeys.current.add(key);
    draftsRef.current = { ...draftsRef.current, [key]: raw };
    if (draftTimers.current[key]) clearTimeout(draftTimers.current[key]);
    setSavedDraftKeys((current) => { const next = new Set(current); next.delete(key); return next; });
    draftTimers.current[key] = setTimeout(() => {
      delete draftTimers.current[key];
      void writeDraft(key, raw).catch((error: Error) => toast.error(`Bozza non salvata: ${error.message}`));
    }, 1000);
  }

  function clearDraftOnServer(key: string) {
    if (!sessionId) return;
    const card = parseCardKey(key);
    if (!card) return;
    const { productId, locationId, linkId } = card;
    if (draftTimers.current[key]) {
      clearTimeout(draftTimers.current[key]);
      delete draftTimers.current[key];
    }
    setSavedDraftKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    dirtyDraftKeys.current.delete(key);
    savedDraftUnits.current.delete(key);
    const previous = draftWrites.current.get(key) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(() => draftFn({ data: { action: "clear_one", sessionId, productId, locationId, linkId, quantity: null, unitCode: null } }));
    draftWrites.current.set(key, write);
    void write.then(() => {
      if (draftWrites.current.get(key) === write) draftWrites.current.delete(key);
    }, (error: Error) => toast.error(`Bozza non rimossa: ${error.message}`));
  }

  // «Conferma tutto»: il database conferma ogni bozza con gli stessi controlli della conferma singola;
  // le card non confermabili restano bozze e vengono segnalate con il motivo.
  const confirmAllFn = useServerFn(confirmAllInventoryDrafts);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [bulkReview, setBulkReview] = useState<InventoryBulkReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [bulkSkipped, setBulkSkipped] = useState<ConfirmAllResult["skipped"]>([]);
  const confirmAll = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Inventario non aperto");
      await flushDraftWrites();
      const latest = await buildBulkReview();
      if (latest.signature !== bulkReview?.signature) {
        setBulkReview(latest);
        throw new Error("Il riepilogo è stato aggiornato: ricontrolla le quantità e premi nuovamente Conferma tutto.");
      }
      return confirmAllFn({ data: { sessionId } });
    },
    onSuccess: async (result) => {
      const remaining = await savedDraftsQuery.refetch();
      if (remaining.error) {
        setReviewError("Quantità confermate, ma non riesco a rileggere le bozze rimaste. Riapri il riepilogo prima di continuare.");
        await refresh();
        return;
      }
      const next: Record<string, string> = {};
      for (const draft of remaining.data ?? []) {
        const key = rowKey(draft as typeof draft & { product_supplier_link_id: string | null });
        next[key] = draft.quantity;
        savedDraftUnits.current.set(key, draft.unit_code);
      }
      const confirmedKeys = (bulkReview?.ready ?? []).filter((row) => !(row.key in next)).map((row) => row.key);
      setUnlockedCards((current) => {
        const updated = new Set(current);
        for (const key of confirmedKeys) updated.delete(key);
        for (const key of Object.keys(next)) updated.add(key);
        return updated;
      });
      draftsRef.current = next;
      setDrafts(next);
      setSavedDraftKeys(new Set(Object.keys(next)));
      setBulkSkipped(result.skipped);
      const summary = confirmAllSummary(result);
      if (summary.kind === "done") toast.success(`${summary.message} · inventario aperto`);
      else if (summary.kind === "partial") {
        if (result.confirmed > 0) toast.success(`${result.confirmed} quantità confermate · inventario aperto`);
        toast.warning(summary.message);
      } else toast.info(summary.message);
      await refresh();
      if (result.skipped.length) {
        try { setBulkReview(await buildBulkReview()); }
        catch { setReviewError("Non riesco ad aggiornare il riepilogo. Torna al conteggio e riaprilo."); }
      }
      else setConfirmAllOpen(false);
    },
    onError: (error: Error) => { setReviewError(error.message); toast.error(error.message); },
  });

  const reopenCountFn = useServerFn(reopenInventoryCount);
  const [reopenResetOpen, setReopenResetOpen] = useState(false);
  // «Modifica conteggio» / «Azzera quantità» su un conteggio confermato: il database rifiuta se gli ordini sono già partiti.
  const reopenCount = useMutation({
    mutationFn: async (reset: boolean) => {
      const cycleSession = cycleQuery.data?.session_id;
      if (!cycleSession) throw new Error("Nessun conteggio da riaprire");
      await reopenCountFn({ data: { companyId, sessionId: cycleSession, reset } });
      return cycleSession;
    },
    onSuccess: async (reopenedSessionId, reset) => {
      if (reset) {
        Object.values(draftTimers.current).forEach(clearTimeout);
        draftTimers.current = {};
        dirtyDraftKeys.current.clear();
        savedDraftUnits.current.clear();
        draftsRef.current = {};
        setDrafts({});
        setDraftFirst({});
        setSavedDraftKeys(new Set());
        setUnlockedCards(new Set());
        setUnlockedAll(false);
        setPending(null);
        setPendingReason("");
        queryClient.setQueryData(["inventory-count-drafts", reopenedSessionId], []);
      }
      setReopenResetOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] }),
        ...inventoryReopenQueryKeys(companyId, archiveId, reopenedSessionId).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey, refetchType: "all" }),
        ),
      ]);
      toast.success(reset ? "Conteggio riaperto e quantità azzerate" : "Conteggio riaperto: puoi correggere le quantità");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetOpenCountFn = useServerFn(resetOpenInventoryCount);
  // «Svuota»: con inventario in corso cancella bozze e quantità confermate e sblocca le card.
  // Il database rifiuta (nessun dato toccato) se non sei amministratore o gli ordini sono partiti.
  const clearAllDrafts = useMutation({
    mutationFn: async () => {
      if (sessionId) {
        await resetOpenCountFn({ data: { sessionId } });
      }
    },
    onSuccess: async () => {
      Object.values(draftTimers.current).forEach(clearTimeout);
      draftTimers.current = {};
      dirtyDraftKeys.current.clear();
      savedDraftUnits.current.clear();
      draftsRef.current = {};
      setDrafts({});
      setDraftFirst({});
      setSavedDraftKeys(new Set());
      setUnlockedCards(new Set());
      setUnlockedAll(false);
      setPending(null);
      setPendingReason("");
      setClearDraftsOpen(false);
      if (sessionId) {
        queryClient.setQueryData(["inventory-count-drafts", sessionId], []);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] }),
          ...inventoryReopenQueryKeys(companyId, archiveId, sessionId).map((queryKey) =>
            queryClient.invalidateQueries({ queryKey, refetchType: "all" }),
          ),
        ]);
      }
      toast.success("Inventario svuotato: tutte le quantità azzerate e card sbloccate");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Popolazione unica dell'Inventario: i prodotti della mia azienda
  // contrassegnati come gestiti. Vale prima e durante il conteggio, e
  // gli articoli dei cataloghi dei fornitori non ne fanno parte.
  const catalogPreviewQuery = useQuery({
    queryKey: ["inventario-prodotti-gestiti", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, category, subcategory, danea_um, stock_unit_id")
        .eq("company_id", companyId)
        .eq("is_managed", true)
        .order("code")
        .limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const catalogPreview = catalogPreviewQuery.data ?? [];
  // Codice della U.M. di magazzino per prodotto: unica U.M. operativa dell'Inventario.
  const stockUnitCodesQuery = useQuery({
    queryKey: ["inventario-um-magazzino", companyId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("units_of_measure").select("id, code");
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((unit) => [unit.id as string, unit.code as string]));
    },
  });
  const stockUnitCodeOf = (product: { stock_unit_id: string | null }) =>
    product.stock_unit_id ? (stockUnitCodesQuery.data?.get(product.stock_unit_id) ?? null) : null;
  const managedProductIds = useMemo(
    () => new Set(catalogPreview.map((product) => product.id)),
    [catalogPreview],
  );
  const previewFavoriteQuery = useQuery({
    queryKey: ["inventario-preferiti-prodotti", companyId, catalogPreview.length],
    enabled: !sessionId && catalogPreview.length > 0,
    queryFn: async () => {
      const ids = await readFavoriteProductIds({
        data: { companyId, productIds: catalogPreview.map((product) => product.id) },
      });
      return new Set(ids);
    },
  });
  const previewProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalogPreview
      .filter((product) => {
        if (effectiveProductView === "favorites" && !previewFavoriteQuery.data?.has(product.id)) return false;
        if (category && (product.category ?? NO_CATEGORY) !== category) return false;
        if (subcategory && (product.subcategory ?? NO_SUBCATEGORY) !== subcategory) return false;
        return !term || `${product.code} ${product.description ?? ""}`.toLowerCase().includes(term);
      })
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));
  }, [catalogPreview, category, previewFavoriteQuery.data, effectiveProductView, search, subcategory]);
  // Senza inventario aperto: giacenza reale e ultimo conteggio compatibile (inventari chiusi, stessa U.M.).
  // Solo lettura; "Mai contato" solo se il prodotto non ha nessun conteggio compatibile.
  const historyLocationId =
    activeLocations.length === 1
      ? (activeLocations[0]?.id ?? null)
      : (activeLocations.find((location) => location.id === draftZoneId)?.id ??
        activeLocations.find((location) => location.is_default)?.id ??
        null);
  const stockHistoryQuery = useQuery({
    queryKey: ["inventario-storico-giacenza", companyId, archiveId, historyLocationId, catalogPreview.length],
    // Le correzioni dei colleghi compaiono da sole.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    enabled: !sessionQuery.isLoading && Boolean(archiveId) && Boolean(historyLocationId),
    queryFn: async (): Promise<Map<string, StockHistory>> => {
      const [stockResult, countsResult] = await Promise.all([
        supabase.rpc("inventory_location_stock_list", {
          _company_id: companyId,
          _archive_id: archiveId!,
          _location_id: historyLocationId!,
        }),
        supabase
          .from("inventory_counts")
          .select("id, session_id, product_id, counted_quantity, previous_quantity, notes, unit_code, counted_at, stock_unit_id, stock_quantity, snapshot_version, inventory_sessions!inner(status)")
          .eq("company_id", companyId)
          .eq("location_id", historyLocationId!)
          .eq("inventory_sessions.status", "completata")
          .order("counted_at", { ascending: false })
          .limit(5000),
      ]);
      if (stockResult.error) throw new Error(stockResult.error.message);
      if (countsResult.error) throw new Error(countsResult.error.message);
      const units = new Map(catalogPreview.map((product) => [product.id, stockUnitCodeOf(product)]));
      const everCounted = new Set<string>();
      const last = new Map<string, { quantity: number; unit: string | null; at: string; id: string; sessionId: string; previous: number | null; note: string | null }>();
      for (const count of (countsResult.data ?? []) as (InventoryQuantitySnapshot & { id: string; session_id: string; product_id: string; previous_quantity: number | null; notes: string | null; counted_at: string })[]) {
        everCounted.add(count.product_id);
        if (last.has(count.product_id)) continue;
        const productUnit = units.get(count.product_id) ?? null;
        const stockId = catalogPreview.find((product) => product.id === count.product_id)?.stock_unit_id ?? null;
        const quantity = inventorySnapshotQuantity(count, stockId, productUnit);
        if (quantity === null) continue;
        last.set(count.product_id, { quantity, unit: productUnit, at: count.counted_at, id: count.id, sessionId: count.session_id, previous: count.previous_quantity === null ? null : Number(count.previous_quantity), note: count.notes });
      }
      // Correzioni rapide: rettifiche riferite all'ultimo conteggio, in ordine cronologico.
      const countIds = [...last.values()].map((c) => c.id);
      const adjByCount = new Map<string, { quantity: number; reason: string; created_at: string; created_by: string | null }[]>();
      const names = new Map<string, string>();
      if (countIds.length) {
        const { data: adjs, error: adjError } = await supabase
          .from("inventory_adjustments")
          .select("reference_count_id, quantity, reason, created_at, created_by")
          .in("reference_count_id", countIds)
          .order("created_at", { ascending: true });
        if (adjError) throw new Error(adjError.message);
        for (const a of adjs ?? []) {
          const list = adjByCount.get(a.reference_count_id!) ?? [];
          list.push({ quantity: Number(a.quantity), reason: a.reason, created_at: a.created_at, created_by: a.created_by });
          adjByCount.set(a.reference_count_id!, list);
        }
        const userIds = [...new Set((adjs ?? []).map((a) => a.created_by).filter(Boolean))] as string[];
        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
          for (const pr of profs ?? []) names.set(pr.user_id, [pr.first_name, pr.last_name].filter(Boolean).join(" ") || "Collaboratore");
        }
      }
      const map = new Map<string, StockHistory>();
      for (const row of (stockResult.data ?? []) as { product_id: string; has_count: boolean; quantity: number | null }[]) {
        const lc = last.get(row.product_id);
        map.set(row.product_id, {
          hasCount: row.has_count,
          // Conteggi esistono ma non nella U.M. di magazzino attuale: giacenza "Da verificare".
          toVerify: !row.has_count && everCounted.has(row.product_id),
          stock: row.has_count ? Number(row.quantity ?? 0) : null,
          lastQuantity: row.has_count && lc ? lc.quantity : null,
          lastUnit: row.has_count && lc ? lc.unit : null,
          lastAt: row.has_count && lc ? lc.at : null,
          lastCountId: row.has_count && lc ? lc.id : null,
          lastSessionId: row.has_count && lc ? lc.sessionId : null,
          ...(() => {
            if (!row.has_count || !lc) return { physical: null, previousQuantity: null, countNote: null, edits: [] };
            let running = lc.quantity;
            const edits: PhysicalEdit[] = [];
            for (const a of adjByCount.get(lc.id) ?? []) {
              const from = running;
              running = Math.round((running + a.quantity) * 1000) / 1000;
              edits.unshift({ at: a.created_at, by: (a.created_by && names.get(a.created_by)) || "Collaboratore", from, to: running, reason: a.reason });
            }
            return { physical: running, previousQuantity: lc.previous, countNote: lc.note, edits };
          })(),
        });
      }
      return map;
    },
  });

  // Stampa: inventario in corso se aperto, altrimenti ultimo inventario chiuso. Solo lettura, mai 0 inventati.
  const describeFilters = () => [
    effectiveProductView === "favorites" ? "Preferiti" : "Tutti",
    WORK_FILTER_LABELS[workFilter],
    selectedLocationId ? `Zona: ${activeLocations.find((l) => l.id === selectedLocationId)?.name ?? ""}` : "Tutte le zone",
    category ? `Categoria: ${category}` : "",
    subcategory ? `Sottocategoria: ${subcategory}` : "",
    supplierFilter ? `Fornitore: ${supplierFilter}` : "",
    habitualFilter === NO_HABITUAL ? "Senza zona abituale"
      : habitualFilter ? `Zona abituale: ${activeLocations.find((l) => l.id === habitualFilter)?.name ?? ""}` : "",
    search.trim() ? `Ricerca: «${search.trim()}»` : "",
  ].filter(Boolean).join(" · ");
  const printInventory = (mode: InventoryPrintMode) => {
    const fmtDate = (iso: string) =>
      new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    let printRows: InventoryPrintRow[];
    let subtitle: string;
    if (sessionId) {
      // Vista attuale = le stesse card dell'elenco; completa = tutte le card della sessione.
      printRows = (mode === "completa" ? sessionCards : rows)
        .map((r) => {
          const notes = [
            r.stock_unit_missing ? "U.M. da impostare" : "",
            r.recount_requested_at ? "Riconteggio richiesto" : "",
            r.non_compliant ? `Non conforme${r.non_compliant_note ? `: ${r.non_compliant_note}` : ""}` : "",
            r.note ?? "",
          ].filter(Boolean);
          return {
            code: r.code ?? "",
            name: r.description ?? r.code ?? "",
            zone: r.location_name ?? "",
            card: r.product_supplier_link_id ? (r.supplier_name ?? "Fornitore") : "Senza fornitore",
            favorite: isFavoriteCard(r),
            stockUnit: r.stock_unit_missing ? null : r.stock_unit_code,
            calculated: r.calculated === null ? null : Number(r.calculated),
            counted: r.counted === null ? null : Number(r.counted),
            countedUnit: r.counted_unit_code,
            difference: r.counted !== null && r.units_comparable !== false && r.difference !== null ? Number(r.difference) : null,
            note: notes.join(" · "),
          };
        });
      subtitle = `Inventario in corso${sessionQuery.data?.started_at ? ` dal ${fmtDate(sessionQuery.data.started_at)}` : ""}`;
    } else {
      const history = stockHistoryQuery.data ?? new Map<string, StockHistory>();
      const favs = previewFavoriteQuery.data ?? new Set<string>();
      const zone = activeLocations.find((l) => l.id === historyLocationId)?.name ?? "";
      printRows = (mode === "completa" ? catalogPreview : previewProducts).map((product) => {
        const entry = history.get(product.id);
        const unit = stockUnitCodeOf(product);
        const counted = entry?.physical ?? null;
        const calculated = entry?.stock ?? null;
        return {
          code: product.code ?? "",
          name: product.description ?? product.code ?? "",
          zone,
          favorite: favs.has(product.id),
          stockUnit: product.stock_unit_id ? unit : null,
          calculated,
          counted,
          countedUnit: entry?.lastUnit ?? null,
          difference: null,
          note: [!product.stock_unit_id ? "U.M. da impostare" : "", entry?.countNote ?? ""].filter(Boolean).join(" · "),
        };
      });
      const lastAt = [...history.values()].reduce<string | null>(
        (acc, entry) => (entry.lastAt && (!acc || entry.lastAt > acc) ? entry.lastAt : acc),
        null,
      );
      subtitle = lastAt ? `Ultimo inventario chiuso: ${fmtDate(lastAt)}` : "Nessun inventario chiuso";
    }
    const html = buildInventoryPrintHtml(printRows, mode, {
      scope: sessionId ? (mode === "completa" ? "tutte le card della sessione (filtri ignorati)" : describeFilters()) : undefined,
      title: "Inventario",
      subtitle: `${subtitle} · Stampato il ${fmtDate(new Date().toISOString())}`,
    });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };




  const previewImagesQuery = useQuery({
    queryKey: ["inventario-prodotti-immagini", companyId, catalogPreview.length],
    enabled: !sessionId && catalogPreview.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: () =>
      getImageUrls({ data: { productIds: catalogPreview.slice(0, 50).map((p) => p.id), thumbnail: true } }),
  });
  const previewImages = useMemo(
    () => new Map((previewImagesQuery.data ?? []).filter((image) => image && image.productId).map((image) => [image.productId, image.url])),
    [previewImagesQuery.data],
  );

  // Vista "Tutti": oltre ai prodotti dell'azienda mostriamo anche gli articoli
  // dei cataloghi dei fornitori collegati non ancora gestiti.
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, string>>({});
  const catalogCandidatesQuery = useQuery({
    queryKey: ["inventario-catalogo-candidati", companyId],
    staleTime: 5 * 60 * 1000,
    queryFn: () => readCatalogCandidates({ data: { companyId } }),
  });
  const catalogCandidates: CatalogCandidate[] = catalogCandidatesQuery.data ?? [];
  const visibleCatalogCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalogCandidates
      .filter((candidate) => {
        if (!term && effectiveProductView === "favorites" && !candidate.isFavorite) return false;
        if (supplierFilter && candidate.sellerCompanyName !== supplierFilter) return false;
        if (category && (candidate.category ?? NO_CATEGORY) !== category) return false;
        if (subcategory && (candidate.subcategory ?? NO_SUBCATEGORY) !== subcategory) return false;
        if (!term && workFilter !== "pending" && workFilter !== "all") return false;
        return !term || `${candidate.code} ${candidate.description ?? ""}`.toLowerCase().includes(term);
      })
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));

  }, [catalogCandidates, category, effectiveProductView, search, subcategory, supplierFilter, workFilter]);

  const catalogImagesQuery = useQuery({
    queryKey: ["inventario-catalogo-immagini", companyId, catalogCandidates.length],
    enabled: catalogCandidates.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: async () => {
      const bySeller = new Map<string, string[]>();
      for (const candidate of catalogCandidates.slice(0, 60)) {
        const list = bySeller.get(candidate.sellerCompanyId) ?? [];
        list.push(candidate.sellerProductId);
        bySeller.set(candidate.sellerCompanyId, list);
      }
      const results = await Promise.all(
        [...bySeller.entries()].map(([sellerCompanyId, productIds]) =>
          getSellerImageUrls({ data: { sellerCompanyId, productIds, thumbnail: true } }).catch(() => []),
        ),
      );
      return results.flat();
    },
  });
  const catalogImages = useMemo(
    () => new Map((catalogImagesQuery.data ?? []).filter((image) => image && image.productId).map((image) => [image.productId, image.url])),
    [catalogImagesQuery.data],
  );




  const progressQuery = useQuery({
    queryKey: ["inventory-progress", sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => readProgress({ data: { sessionId: sessionId! } }),
  });
  const progress: InventoryProgress | undefined = progressQuery.data;

  // Tutta la sessione, senza filtri: serve al controllo dei mancanti prima della Lista della Spesa.
  const allRowsQuery = useQuery({
    queryKey: ["inventory-rows", sessionId, "all-session"],
    enabled: Boolean(sessionId),
    queryFn: () =>
      readRows({
        data: { sessionId: sessionId!, locationId: null, category: null, subcategory: null, search: null, favoritesOnly: false },
      }),
  });
  const favoriteRowsQuery = useQuery({
    queryKey: ["inventory-rows", sessionId, "all-favorites"],
    enabled: Boolean(sessionId),
    queryFn: () =>
      readRows({
        data: { sessionId: sessionId!, locationId: null, category: null, subcategory: null, search: null, favoritesOnly: true },
      }),
  });
  // Stesso criterio di "Da controllare": nessun conteggio registrato (0 è un conteggio valido).
  const missingRows = useMemo(
    () =>
      (allRowsQuery.data ?? [])
        .filter((row) => (!managedProductIds.size || managedProductIds.has(row.product_id)) && row.counted === null)
        .sort((left, right) => byName(left.description, left.code, right.description, right.code)),
    [allRowsQuery.data, managedProductIds],
  );

  // Card della sessione (solo prodotti gestiti): un'unica regola di selezione, condivisa da
  // elenco, riepilogo filtrato e «Stampa vista attuale» (selectInventoryCards).
  const sessionCards = useMemo(
    () => (allRowsQuery.data ?? []).filter((row) => !managedProductIds.size || managedProductIds.has(row.product_id)),
    [allRowsQuery.data, managedProductIds],
  );
  const cardFilters = useMemo<InventoryCardFilters>(() => ({
    // Con una ricerca scritta si cerca tra tutte le card del conteggio, anche fuori da Preferiti e stati.
    view: search.trim() ? "all" : effectiveProductView,
    work: search.trim() ? "all" : workFilter,
    search,
    locationId: selectedLocationId,
    category,
    subcategory,
    supplier: supplierFilter,
  }), [category, effectiveProductView, search, selectedLocationId, subcategory, supplierFilter, workFilter]);
  const baseRows = useMemo(
    () => selectInventoryCards(sessionCards, cardFilters, cardSupplierName)
      // Card dello stesso prodotto vicine: stella, fornitori attivi A→Z, scollegati, «Senza fornitore».
      .sort((left, right) => byName(left.description, left.code, right.description, right.code)
        || left.location_name.localeCompare(right.location_name, "it")
        || compareCards(left, right)),
    [cardFilters, sessionCards],
  );
  // Filtro zona abituale (per prodotto) + abituali della zona del conteggio scelta in testa.
  const rows = useMemo(
    () => habitualFirst(baseRows.filter((row) => matchesHabitual(row.product_id, habitualMap, habitualFilter)), habitualMap, selectedLocationId),
    [baseRows, habitualFilter, habitualMap, selectedLocationId],
  );
  async function buildBulkReview(): Promise<InventoryBulkReview> {
    const [freshRows, freshDrafts] = await Promise.all([allRowsQuery.refetch(), savedDraftsQuery.refetch()]);
    if (freshRows.error) throw freshRows.error;
    if (freshDrafts.error) throw freshDrafts.error;
    const draftMap = new Map<string, { quantity: string; unit_code: string | null }>();
    for (const draft of freshDrafts.data ?? []) draftMap.set(rowKey(draft as typeof draft & { product_supplier_link_id: string | null }), draft);
    const cards = await Promise.all((freshRows.data ?? []).map(async (row): Promise<InventoryReviewCard> => {
      const key = rowKey(row);
      const stored = draftMap.get(key);
      const raw = dirtyDraftKeys.current.has(key) ? draftsRef.current[key] ?? "" : stored?.quantity ?? "";
      const selected = selectedCardUnit(key, row);
      const code = dirtyDraftKeys.current.has(key) ? selected.code : stored?.unit_code ?? row.stock_unit_code;
      const unitId = unitChoice.allowed.get(row.product_id)?.find((option) => option.code.toLowerCase() === code?.toLowerCase())?.id ?? selected.id;
      let factor: number | null = null;
      let blockedReason: string | null = null;
      if (raw.trim() && parseQuantity(raw) !== null) {
        if (!code) blockedReason = "U.M. del conteggio da impostare";
        else if (code.toLowerCase() === row.stock_unit_code?.trim().toLowerCase()) factor = 1;
        else if (!unitId) blockedReason = "U.M. non ammessa per il conteggio";
        else {
          const { data, error } = await supabase.rpc("inventory_count_conversion", { _product_id: row.product_id, _unit_id: unitId });
          factor = data?.[0]?.factor ?? null;
          blockedReason = error?.message ?? null;
        }
      }
      return { key, productId: row.product_id, label: rowName(row), detail: `${cardSupplierName(row)} · ${row.location_name}`,
        raw, alreadyCounted: row.counted !== null, calculated: row.calculated === null ? null : Number(row.calculated),
        unit: row.stock_unit_code ?? "", countedUnit: code ?? "", factor, blockedReason };
    }));
    return inventoryBulkReview(cards);
  }

  async function openBulkReview() {
    if (!sessionId) return;
    setConfirmAllOpen(true);
    setReviewLoading(true);
    setReviewError(null);
    setBulkSkipped([]);
    setBulkReview(null);
    try { setBulkReview(await buildBulkReview()); }
    catch (error) { setReviewError(error instanceof Error ? error.message : "Impossibile verificare le quantità"); }
    finally { setReviewLoading(false); }
  }

  async function requestCloseInventory() {
    if (!isAdmin || !sessionId) return;
    try {
      await flushDraftWrites();
      const remaining = await savedDraftsQuery.refetch();
      if (remaining.error) throw remaining.error;
      if ((remaining.data ?? []).some((draft) => draft.quantity.trim())) {
        toast.info("Ci sono quantità in bozza: confermale o correggile prima di chiudere l’inventario.");
        await openBulkReview();
        return;
      }
      setConfirmedOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Bozze non salvate: inventario ancora aperto"); }
  }

  // Card più strette quando sotto il nome non c'è nulla da leggere; una sola misura per tutte.
  const cardMinWidth = useMemo(
    () =>
      pickCardMinWidth(
        rows.map((row) => ({
          habitualZones: habitualMap.get(row.product_id)?.ids.length ?? 0,
          category: fieldPreferences.isVisible("categoria") && Boolean(row.category),
          supplier:
            (fieldPreferences.isVisible("fornitore") || fieldPreferences.isVisible("prezzo_acquisto")) &&
            Boolean(cardSupplierName(row)),
          stockInfo:
            (fieldPreferences.isVisible("scorta_minima") || fieldPreferences.isVisible("fabbisogno")) &&
            (row.min_stock !== null || row.order_multiple !== null),
          lastCount: fieldPreferences.isVisible("ultimo_conteggio") && Boolean(row.counted_at),
        })),
      ),
    [fieldPreferences.visibility, fieldPreferences.isVisible, habitualMap, rows],
  );
  // Quantità scritte prima dell'apertura: chiave «prodotto:ubicazione:-» → card reale della sessione.
  // Una sola card (o una sola con stella) = trasferita; più card senza scelta univoca = avviso, nessuna assegnazione arbitraria.
  useEffect(() => {
    if (!sessionId || !autoStartPending || !allRowsQuery.data) return;
    setAutoStartPending(false);
    const pending = Object.entries(draftFirst);
    if (!pending.length) return;
    const moved: Record<string, string> = {};
    const unassigned: string[] = [];
    for (const [key, value] of pending) {
      const parsed = parseCardKey(key);
      if (!parsed) continue;
      const target = resolveDraftTarget(allRowsQuery.data, parsed.productId, parsed.locationId);
      if (target) moved[rowKey(target)] = value;
      else unassigned.push(allRowsQuery.data.find((row) => row.product_id === parsed.productId)?.code ?? parsed.productId);
    }
    setDrafts((current) => ({ ...current, ...moved }));
    setDraftFirst({});
    for (const [key, value] of Object.entries(moved)) scheduleDraftSave(key, value);
    if (unassigned.length) {
      toast.warning(`Quantità da riscrivere sulla card del fornitore giusto: ${unassigned.join(", ")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, autoStartPending, allRowsQuery.data]);
  const searchElsewhere = useMemo(
    () => (rows.length ? null : findSearchElsewhere(
      sessionCards.filter((row) => matchesHabitual(row.product_id, habitualMap, habitualFilter)), cardFilters, cardSupplierName)),
    [cardFilters, habitualFilter, habitualMap, rows.length, sessionCards],
  );
  const supplierOptions = useMemo(
    () => [...new Set([
      ...sessionCards.map(cardSupplierName),
      ...catalogCandidates.map((item) => item.sellerCompanyName),
    ])].sort((a, b) => a.localeCompare(b, "it")),
    [catalogCandidates, sessionCards],
  );
  const filtersActive = effectiveProductView === "favorites" || workFilter !== "all" || Boolean(search.trim())
    || Boolean(selectedLocationId) || Boolean(category) || Boolean(subcategory) || Boolean(supplierFilter) || Boolean(habitualFilter);
  const cardGroupSize = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of sessionCards) map.set(groupKey(row), (map.get(groupKey(row)) ?? 0) + 1);
    return map;
  }, [sessionCards]);


  // Lista completa dei prodotti visibili: il controllo prezzo e le info fornitore
  // devono coprire tutte le righe, non solo le prime 50 (quelle usate per le miniature).
  const visibleProductIds = useMemo(
    () => [...new Set(rows.map((row) => row.product_id))],
    [rows],
  );
  const imageProductIds = useMemo(() => visibleProductIds.slice(0, 50), [visibleProductIds]);
  const imagesQuery = useQuery({
    queryKey: ["inventory-count-images", imageProductIds],
    enabled: imageProductIds.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: () => getImageUrls({ data: { productIds: imageProductIds, thumbnail: true } }),
  });
  const imageUrls = useMemo(
    () => new Map((imagesQuery.data ?? []).filter((image) => image && image.productId).map((image) => [image.productId, image.url])),
    [imagesQuery.data],
  );

  // Informazioni d'acquisto in SOLA LETTURA (nessuna logica di acquisto qui)
  const supplierInfoQuery = useQuery({
    queryKey: ["inventario-info-fornitore", companyId, visibleProductIds],
    enabled: visibleProductIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("product_id, manual_cost, is_preferred, sourcing_priority, supplier_records(legal_name)")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("product_id", visibleProductIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const supplierInfo = useMemo(() => {
    const map = new Map<string, SupplierInfo>();
    for (const link of supplierInfoQuery.data ?? []) {
      if (map.has(link.product_id)) continue;
      const record = link.supplier_records as { legal_name: string } | null;
      map.set(link.product_id, { name: record?.legal_name ?? null, cost: link.manual_cost });
    }
    return map;
  }, [supplierInfoQuery.data]);

  // Andamento prezzo in SOLA LETTURA: nessuna osservazione viene creata qui.
  const priceSeriesQuery = useQuery({
    queryKey: ["inventario-andamento-prezzo", companyId, visibleProductIds],
    enabled: visibleProductIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchPriceSeriesForProducts(companyId, visibleProductIds),
  });
  const priceSeries = useMemo(() => {
    const map = new Map<string, PriceSeriesRow>();
    for (const [productId, rows] of priceSeriesQuery.data ?? new Map()) {
      const best = [...rows]
        .filter((row) => row.kind === "observed_price")
        .sort((a, b) => (b.current_observed_at ?? "").localeCompare(a.current_observed_at ?? ""))[0];
      if (best) map.set(productId, best);
    }
    return map;
  }, [priceSeriesQuery.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory-progress", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-rows"] }),
    ]);
  };

  const startMutation = useMutation({
    mutationFn: () => start({ data: { companyId, archiveId: archiveId!, name: null } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory-general-session", companyId, archiveId] });
      setDrafts({});
      setShowCompletion(true);
      setProductView("favorites");
      setWorkFilter("pending");
      setCategory(null);
      setSubcategory(null);
      setSearch("");
      setSelectedLocationId(activeLocations.length > 1 ? (defaultLocation?.id ?? null) : (defaultLocation?.id ?? null));
      setSelectingLocation(activeLocations.length > 1);
      toast.success("Inventario generale aperto");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Prima quantità confermata senza sessione: apre il conteggio e salva subito.
  const firstCount = useMutation({
    mutationFn: async (input: {
      productId: string;
      locationId: string;
      unit: string;
      value: number;
    }) => {
      const session = await start({ data: { companyId, archiveId: archiveId!, name: null } });
      await saveEntry({
        data: {
          companyId,
          sessionId: session.id,
          productId: input.productId,
          locationId: input.locationId,
          entryType: "conteggio",
          countedQuantity: input.value,
          unitCode: input.unit || null,
          notes: null,
          nonCompliant: null,
          nonCompliantQuantity: null,
        },
      });
      return input.locationId;
    },
    onSuccess: async (locationId, input) => {
      lockSavedCard(cardKey(input.productId, input.locationId, null));
      await queryClient.invalidateQueries({
        queryKey: ["inventory-general-session", companyId, archiveId],
      });
      setDraftFirst({});
      setDrafts({});
      setShowCompletion(true);
      setProductView("favorites");
      setWorkFilter("pending");
      setCategory(null);
      setSubcategory(null);
      setSearch("");
      setSelectedLocationId(locationId);
      setSelectingLocation(false);
      toast.success("Conteggio avviato e quantità salvata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Conteggio su un articolo del catalogo fornitore: prima entra fra i propri
  // prodotti, poi la quantità viene registrata nel conteggio (aperto o appena avviato).
  const catalogCount = useMutation({
    mutationFn: async (input: { candidate: CatalogCandidate; locationId: string; value: number }) => {
      const { productId } = await adoptProduct({
        data: {
          companyId,
          sellerCompanyId: input.candidate.sellerCompanyId,
          sellerProductId: input.candidate.sellerProductId,
        },
      });
      const activeSessionId =
        sessionId ?? (await start({ data: { companyId, archiveId: archiveId!, name: null } })).id;
      await saveEntry({
        data: {
          companyId,
          sessionId: activeSessionId,
          productId,
          locationId: input.locationId,
          entryType: "conteggio",
          countedQuantity: input.value,
          unitCode: input.candidate.danea_um?.trim() || null,
          notes: null,
          nonCompliant: null,
          nonCompliantQuantity: null,
        },
      });
      return input.locationId;
    },
    onSuccess: async (locationId) => {
      setCatalogDrafts({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-general-session", companyId, archiveId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-catalogo-candidati", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-prodotti", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-rows"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-progress"] }),
      ]);
      if (!sessionId) setSelectedLocationId(locationId);
      toast.success("Articolo aggiunto ai tuoi prodotti e quantità salvata");
    },
    onError: (error: Error) => toast.error(error.message),
  });



  // Conferma e riconteggio: append-only nello storico, l'ultima riga è la fotografia corrente
  const countMutation = useMutation({
    mutationFn: (input: { row: InventoryCountRow; value: number; unit: string; notes: string | null }) => {
      if(!sessionId) throw new Error("Inventario non aperto");
      return saveEntry({
        data: {
          companyId,
          sessionId,
          productId: input.row.product_id,
          locationId: input.row.location_id,
          linkId: input.row.product_supplier_link_id,
          entryType: input.row.counted !== null ? "riconteggio" : "conteggio",
          countedQuantity: input.value,
          unitCode: input.unit || null,
          unitId: selectedCardUnit(rowKey(input.row), input.row).id,
          notes: input.notes,
          nonCompliant: null,
          nonCompliantQuantity: null,
        },
      });
    },
    onSuccess: async (_result, input) => {
      lockSavedCard(rowKey(input.row));
      setDrafts((current) => {
        const next = { ...current };
        delete next[rowKey(input.row)];
        return next;
      });
      clearDraftOnServer(rowKey(input.row));
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Riconta: segna la riga come "Da ricontare" senza cancellare il conteggio precedente
  const recountMutation = useMutation({
    mutationFn: (row: InventoryCountRow) =>
      saveEntry({
        data: {
          companyId,
          sessionId: sessionId!,
          productId: row.product_id,
          locationId: row.location_id,
          linkId: row.product_supplier_link_id,
          entryType: "richiesta_riconteggio",
          countedQuantity: null,
          unitCode: rowUnit(row) || null,
          notes: null,
          nonCompliant: null,
          nonCompliantQuantity: null,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Prodotto segnato da ricontare: il conteggio precedente resta nello storico");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Non conforme: solo segnalazione, la giacenza non cambia
  const complianceMutation = useMutation({
    mutationFn: (input: {
      row: InventoryCountRow;
      nonCompliant: boolean;
      quantity: number | null;
      note: string | null;
    }) =>
      saveEntry({
        data: {
          companyId,
          sessionId: sessionId!,
          productId: input.row.product_id,
          locationId: input.row.location_id,
          linkId: input.row.product_supplier_link_id,
          entryType: input.nonCompliant ? "segnalazione" : "revoca_segnalazione",
          countedQuantity: null,
          unitCode: rowUnit(input.row) || null,
          notes: input.note,
          nonCompliant: input.nonCompliant,
          nonCompliantQuantity: input.quantity,
        },
      }),
    onSuccess: async (_result, input) => {
      setCompliance(null);
      setComplianceNote("");
      setComplianceQuantity("");
      await refresh();
      toast.success(
        input.nonCompliant
          ? "Segnalazione registrata: la giacenza non è stata modificata"
          : "Segnalazione revocata",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Proposta d'acquisto persistente: resta disponibile anche dopo la chiusura dell'inventario
  const proposalMutation = useMutation({
    mutationFn: (input: { productId: string; action: "flag" | "resolve"; note: string | null }) =>
      manageProposal({
        data: {
          companyId,
          productId: input.productId,
          action: input.action,
          note: input.note,
          reason: input.action === "resolve" ? "non_serve_piu" : null,
          sessionId,
        },
      }),
    onSuccess: async (_result, input) => {
      setProposalRow(null);
      setProposalNote("");
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["proposte-acquisto", companyId] }),
      ]);
      toast.success(
        input.action === "flag"
          ? "Prodotto proposto per l'acquisto: lo troverai nella lista della spesa come proposta da confermare"
          : "Proposta chiusa",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const historyQuery = useQuery({
    queryKey: ["inventario-storico", companyId, historyRow?.product_id ?? null],
    enabled: Boolean(historyRow),
    queryFn: () =>
      readHistory({ data: { companyId, productId: historyRow!.product_id, locationId: null } }),
  });


  const closeMutation = useMutation({
    mutationFn: () => {
      // Nessun inventario in corso (già chiuso, anche da un altro dispositivo): niente da chiudere.
      if (!sessionId) throw new Error("Nessun inventario in corso: è già stato chiuso.");
      return close({ data: { companyId, sessionId } });
    },
    onSuccess: async (summary) => {
      await queryClient.invalidateQueries({ queryKey: ["inventory-general-session", companyId, archiveId] });
      await refresh();
      toast.success(
        summary.already_closed
          ? "L'inventario era già chiuso: nessuna modifica"
          : `Inventario chiuso: ${summary.total} prodotti, ${summary.differences} con differenze, ${summary.not_comparable ?? 0} con U.M. non confrontabili`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Stella della card: il database consente solo agli amministratori.
  const cardFavoriteFn = useServerFn(manageCardFavorite);
  const cardFavoriteMutation = useMutation({
    mutationFn: (row: InventoryCountRow) => {
      if (!row.product_supplier_link_id) throw new Error("La card «Senza fornitore» non ha stella propria");
      return cardFavoriteFn({ data: { companyId, linkId: row.product_supplier_link_id, favorite: !row.card_favorite } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory-rows"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Controllo di versione: schermata e server devono coincidere prima di salvare.
  const versionFn = useServerFn(getInventoryScreenVersion);
  const versionQuery = useQuery({
    queryKey: ["inventory-screen-version"],
    queryFn: () => versionFn(),
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  });
  const screenOutdated = Boolean(
    versionQuery.data && (versionQuery.data.version !== INVENTORY_SCREEN_VERSION || !versionQuery.data.databaseReady),
  );

  const favoriteMutation = useMutation({
    mutationFn: (input: { productId: string; favorite: boolean }) =>
      toggleFavorite({ data: { companyId, productId: input.productId, favorite: input.favorite } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-rows"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti-tutti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferito"] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-preferiti-prodotti"] }),
        queryClient.invalidateQueries({ queryKey: ["company-has-favorites", companyId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const catalogFavoriteMutation = useMutation({
    mutationFn: async (candidate: CatalogCandidate) => {
      const favorite = !candidate.isFavorite;
      await toggleCatalogFavorite({ data: {
        companyId,
        sellerCompanyId: candidate.sellerCompanyId,
        sellerProductId: candidate.sellerProductId,
        favorite,
      } });
      // Con la stella la referenza B2B diventa prodotto proprio col fornitore collegato
      // (stesso meccanismo del Catalogo, nessun doppione); togliere la stella non cancella nulla.
      if (favorite) {
        await adoptProduct({ data: {
          companyId,
          sellerCompanyId: candidate.sellerCompanyId,
          sellerProductId: candidate.sellerProductId,
        } });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventario-preferiti-prodotti"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-rows"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-add-products", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-favorites", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-catalogo-candidati", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti-tutti"] }),
        queryClient.invalidateQueries({ queryKey: ["company-has-favorites", companyId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmRow = async (row: InventoryCountRow) => {
    const value = parseQuantity(draftsRef.current[rowKey(row)] ?? "");
    if (value === null) { toast.error("Inserisci una quantità valida"); return; }
    const chosen = selectedCardUnit(rowKey(row), row);
    let stockValue: number | null = row.stock_unit_code && chosen.code?.toLowerCase() === row.stock_unit_code.trim().toLowerCase() ? value : null;
    if (chosen.code?.toLowerCase() !== row.stock_unit_code?.trim().toLowerCase()) {
      if (!chosen.id) { toast.error("U.M. del conteggio da impostare"); return; }
      const { data, error } = await supabase.rpc("inventory_count_conversion", { _product_id: row.product_id, _unit_id: chosen.id });
      if (error || !data?.[0]) { toast.error(error?.message ?? "Confezione non configurata"); return; }
      stockValue = data[0].factor === null ? null : Math.round(value * data[0].factor * 1000) / 1000;
    }
    if (stockValue !== null && row.calculated !== null && stockValue !== Number(row.calculated)) {
      setPending({ row, value, stockValue, unit: chosen.code ?? rowUnit(row) });
      setPendingReason(row.note ?? "");
      return;
    }
    countMutation.mutate({ row, value, unit: chosen.code ?? rowUnit(row), notes: null });
  };

  const savePendingDifference = () => {
    if (!pending) return;
    countMutation.mutate({
      row: pending.row,
      value: pending.value,
      unit: pending.unit ?? rowUnit(pending.row),
      notes: pendingReason.trim() || null,
    });
    const head = noteQueue.current.rows[0];
    setPending(null);
    setPendingReason("");
    if (head && rowKey(head) === rowKey(pending.row)) {
      noteQueue.current.rows.shift();
      window.setTimeout(openNextNote, 0);
    }
  };

  // "Conferma inventario": in vista Preferiti tutti i preferiti della sessione, in vista Tutti tutta la sessione,
  // indipendentemente da ricerca, categoria, zona e filtri. Campo vuoto non diventa mai 0 né la calcolata.
  const typedValue = (row: InventoryCountRow) => {
    const raw = (drafts[rowKey(row)] ?? "").trim();
    return raw === "" ? null : parseQuantity(raw);
  };
  const confirmScope = () => {
    const all = (effectiveProductView === "favorites" ? favoriteRowsQuery.data : allRowsQuery.data) ?? rows;
    return all.filter((row) => !managedProductIds.size || managedProductIds.has(row.product_id));
  };
  // Note obbligatorie in coda: si passa alla Lista della Spesa solo quando sono tutte gestite.
  const noteQueue = useRef<{ rows: InventoryCountRow[]; goToList: boolean; showConfirmed: boolean }>({ rows: [], goToList: false, showConfirmed: false });
  const openNextNote = () => {
    const next = noteQueue.current.rows[0];
    if (next) {
      setPending({ row: next, value: typedValue(next)! });
      setPendingReason(next.note ?? "");
      return;
    }
    if (noteQueue.current.goToList) {
      noteQueue.current.goToList = false;
      void navigate({ to: "/acquisti/lista-spesa" });
      return;
    }
    if (noteQueue.current.showConfirmed) {
      noteQueue.current.showConfirmed = false;
      setConfirmedOpen(true);
    }
  };

  const runConfirmAll = async (mode: "soldOut" | "enteredOnly") => {
    const empty = emptyRows ?? [];
    setEmptyRows(null);
    noteQueue.current = { rows: [], goToList: false, showConfirmed: false };
    let saved = 0;
    const needNote: InventoryCountRow[] = [];
    for (const row of confirmScope()) {
      const typed = typedValue(row);
      // Nessuna quantità scritta: già confermato → resta com'è; vuoto → gestito sotto solo se "Esaurito".
      if (typed === null) continue;
      const unit = rowUnit(row);
      if (row.calculated !== null && typed !== Number(row.calculated)) {
        needNote.push(row);
        continue;
      }
      await countMutation.mutateAsync({ row, value: typed, unit, notes: null });
      saved += 1;
    }
    if (mode === "soldOut") {
      for (const row of empty) {
        await countMutation.mutateAsync({ row, value: 0, unit: rowUnit(row), notes: "Esaurito — confermato dall'operatore" });
        saved += 1;
      }
    }
    if (saved) toast.success(`${saved} quantità confermate`);
    // In entrambi i casi si arriva alla scelta finale: chiudere (Lista o Conteggio) o tornare indietro.
    noteQueue.current = { rows: needNote, goToList: false, showConfirmed: true };
    if (needNote.length) {
      toast.info(`${needNote.length} prodotti con differenza richiedono la nota`);
    }
    openNextNote();
  };

  const confirmInventory = async () => {
    const scope = confirmScope();
    const invalid = scope.find((row) => {
      const raw = (drafts[rowKey(row)] ?? "").trim();
      return raw !== "" && parseQuantity(raw) === null;
    });
    if (invalid) {
      toast.error(`Quantità non valida per ${invalid.code}`);
      return;
    }
    const empty = scope
      .filter((row) => row.counted === null && typedValue(row) === null)
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));
    if (empty.length) {
      setEmptyRows(empty);
      return;
    }
    if (!scope.some((row) => typedValue(row) !== null)) {
      // Perimetro già tutto controllato e nulla di nuovo: si può comunque scegliere dove andare.
      setConfirmedOpen(true);
      return;
    }
    noteQueue.current = { rows: [], goToList: false, showConfirmed: false };
    const needNote: InventoryCountRow[] = [];
    let saved = 0;
    for (const row of scope) {
      const typed = typedValue(row);
      if (typed === null) continue;
      const unit = rowUnit(row);
      if (row.calculated !== null && typed !== Number(row.calculated)) {
        needNote.push(row);
        continue;
      }
      await countMutation.mutateAsync({ row, value: typed, unit, notes: null });
      saved += 1;
    }
    if (saved) toast.success(`${saved} quantità confermate`);
    noteQueue.current = { rows: needNote, goToList: false, showConfirmed: true };
    openNextNote();
  };

  const selectedLocation = activeLocations.find((location) => location.id === selectedLocationId) ?? null;
  const draftLocation =
    activeLocations.length === 1
      ? (activeLocations[0] ?? null)
      : (activeLocations.find((location) => location.id === draftZoneId) ?? null);
  const zoneProgress = new Map((progress?.zones ?? []).map((zone) => [zone.location_id, zone]));

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <TabsList data-tour="inv.schede" className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="conteggio">Conteggio</TabsTrigger>
          <TabsTrigger value="fabbisogno">Fabbisogno</TabsTrigger>
          <TabsTrigger value="zone">Zone</TabsTrigger>
        </TabsList>
        {!sessionId ? (
          <Button
            data-tour="inv.nuovo"
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={!isAdmin || !archiveId || !activeLocations.length || startMutation.isPending || cycleColor === "rosso"}
            title={
              cycleColor === "rosso"
                ? "Completa prima Lista della Spesa e ordini dell'inventario precedente"
                : isAdmin
                  ? undefined
                  : "Solo un amministratore può avviare l'inventario"
            }
          >
            <ClipboardCheck aria-hidden="true" />
            <span className="hidden sm:inline">Nuovo conteggio</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        ) : null}
      </div>

      <CorrectCountDialog
        companyId={companyId}
        listId={cycleQuery.data?.list_id ?? null}
        target={correction}
        onClose={() => setCorrection(null)}
      />

      <TabsContent value="conteggio">
        {sessionId && selectingLocation ? (


          <LocationSelection
            locations={activeLocations.map((location) => ({
              id: location.id,
              name: location.name,
              code: location.code,
              isDefault: location.is_default,
            }))}
            selectedId={selectedLocationId}
            onSelected={setSelectedLocationId}
            onCancel={() => setSelectingLocation(false)}
            onContinue={() => setSelectingLocation(false)}
          />
        ) : (
          <CardLockContext.Provider value={{
            unlocked: unlockedCards,
            pending: countMutation.isPending || firstCount.isPending || confirmAll.isPending || reviewLoading || confirmAllOpen,
            canSave: !screenOutdated,
            isAdmin,
            toggleCardFavorite: (row) => cardFavoriteMutation.mutate(row),
            cardFavoritePending: cardFavoriteMutation.isPending,
            groupSize: cardGroupSize,
            toggle: (key) => setUnlockedCards((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            }),
          }}>
          <UnitChoiceContext.Provider value={unitChoice}>
          <HabitualZonesProvider companyId={companyId} map={habitualMap} locations={activeLocations} isAdmin={isAdmin}>
          <CycleLockContext.Provider value={{
            locked: !sessionId && cycleColor === "rosso",
            cycleSessionId: cycleQuery.data?.session_id ?? null,
            companyId,
            listId: cycleQuery.data?.list_id ?? null,
            locationId: historyLocationId,
            unlockedAll,
            onCorrect: (row, history) => {
              if (!historyLocationId || !history.lastCountId || history.lastQuantity === null) return;
              setCorrection({
                productId: row.product_id, linkId: row.product_supplier_link_id, locationId: historyLocationId, countId: history.lastCountId,
                code: row.code ?? "", name: rowName(row), unit: history.lastUnit ?? rowUnit(row) ?? "",
                countedQuantity: history.lastQuantity, countedAt: history.lastAt,
              });
            },
          }}>
          <PhysicalCount
            companyId={companyId}
            sessionActive={Boolean(sessionId)}
            sessionName={progress?.session_name ?? sessionQuery.data?.name ?? "Inventario generale"}
            statusSlot={
              <div className="mt-1.5 space-y-1.5">
                <CycleLight cycle={cycleQuery.data} sessionActive={Boolean(sessionId)} />
                {!sessionId && isAdmin && cycleColor !== "rosso" && archiveId && !sessionQuery.isLoading ? (
                  <FullInventoryStartButton
                    companyId={companyId}
                    archiveId={archiveId}
                    onStarted={() => queryClient.invalidateQueries({ queryKey: ["inventory-general-session", companyId, archiveId] })}
                  />
                ) : null}
                {!sessionId && cycleColor === "rosso" && isAdmin ? (
                  <div className="flex flex-wrap gap-1.5">
                    {cycleQuery.data?.session_id && cycleQuery.data?.list_status !== "chiusa" ? (
                      <>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={reopenCount.isPending} onClick={() => reopenCount.mutate(false)}>
                          <Pencil aria-hidden="true" /> Modifica conteggio
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={reopenCount.isPending} onClick={() => setReopenResetOpen(true)}>
                          <RotateCcw aria-hidden="true" /> Rifai inventario
                        </Button>
                      </>
                    ) : null}
                    <Button type="button" size="sm" className="h-8 text-xs" variant={unlockedAll ? "secondary" : "outline"} onClick={() => setUnlockedAll((v) => !v)}>
                      {unlockedAll ? "Blocca quantità" : "Sblocca quantità"}
                    </Button>
                  </div>
                ) : null}
              </div>
            }
            printAction={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    data-tour="inv.stampa"
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px]"
                    disabled={
                      sessionId
                        ? !allRowsQuery.data || !favoriteRowsQuery.data
                        : !stockHistoryQuery.data || !previewFavoriteQuery.data || catalogPreview.length === 0
                    }
                    title={sessionId ? "Stampa l'inventario in corso" : "Stampa l'ultimo inventario chiuso"}
                  >
                    <Printer aria-hidden="true" />
                    <span>Stampa</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">Stampa vista attuale (filtri attivi)</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => printInventory("rapida")}>Rapida — articolo, card e quantità</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => printInventory("dettagliata")}>Dettagliata — tutte le colonne</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => printInventory("completa")}>Stampa tutto l'inventario</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
            progress={progress}
            locations={activeLocations.map((location) => ({
              id: location.id,
              name: location.name,
              progress: zoneProgress.get(location.id),
            }))}
            selectedLocation={selectedLocation ? { id: selectedLocation.id, name: selectedLocation.name } : null}
            rows={sessionId ? rows : previewProducts.map((product): InventoryCountRow => ({
              product_id: product.id, location_id: draftLocation?.id ?? "", location_name: draftLocation?.name ?? "—",
              code: product.code, description: product.description, danea_um: product.danea_um,
              category: product.category, subcategory: product.subcategory, is_favorite: previewFavoriteQuery.data?.has(product.id) ?? false,
              image_path: null, thumbnail_path: null, calculated: stockHistoryQuery.data?.get(product.id)?.stock ?? null, counted: null, difference: null,
              counted_at: null, counted_by: null, note: null, recount_requested_at: null, non_compliant: false,
              non_compliant_quantity: null, non_compliant_note: null, proposal_status: null, proposal_flagged_at: null,
              min_stock: null, order_multiple: null, counted_unit_code: null, units_comparable: null,
              stock_unit_code: stockUnitCodeOf(product), stock_unit_missing: !product.stock_unit_id,
              // Senza inventario aperto le card non esistono ancora: riga del prodotto.
              product_supplier_link_id: null, supplier_record_id: null, supplier_name: null,
              link_active: null, card_favorite: false, card_label: null,
            }))}
            catalogCandidates={[]}
            cardMinWidth={cardMinWidth}
            extraSection={
              <InventoryExtraCards
                companyId={companyId}
                sessionId={sessionId ?? null}
                isAdmin={isAdmin}
                showPossible={Boolean(search.trim()) || (effectiveProductView === "all" && (workFilter === "all" || workFilter === "pending"))}
                search={search}
                category={category}
                subcategory={subcategory}
                locationId={selectedLocation?.id ?? null}
                catalogCandidates={visibleCatalogCandidates}
              />
            }
            excludedCatalogCount={visibleCatalogCandidates.length}
            catalogImages={catalogImages}
            catalogDrafts={catalogDrafts}
            loading={sessionId ? allRowsQuery.isLoading : catalogPreviewQuery.isLoading}
            imageUrls={sessionId ? imageUrls : previewImages}
            drafts={sessionId ? drafts : draftFirst}
            productView={effectiveProductView}
            workFilter={workFilter}
            category={category}
            subcategory={subcategory}
            supplierFilter={supplierFilter}
            supplierOptions={supplierOptions}
            filtersActive={Boolean(sessionId) && filtersActive}
            searchElsewhere={sessionId ? searchElsewhere : null}
            onShowElsewhere={(found) => {
              // Cambia solo i filtri che escludono il risultato: sessione, conteggi e giacenze restano intatti.
              if (found.reasons.includes("view")) setProductView("all");
              if (found.reasons.includes("work")) setWorkFilter("all");
              if (found.reasons.includes("category")) { setCategory(null); setSubcategory(null); }
              if (found.reasons.includes("subcategory")) setSubcategory(null);
              if (found.reasons.includes("supplier")) setSupplierFilter(null);
              if (found.reasons.includes("location")) setSelectedLocationId(found.locations.length === 1 ? (found.locations[0]?.id ?? null) : null);
            }}
            search={search}
            isAdmin={isAdmin}
            showCompletion={showCompletion}
            onViewChange={setProductView}
            onWorkFilterChange={setWorkFilter}
            onLocationChange={(id) => {
              if (sessionId) setSelectedLocationId(id); else setDraftZoneId(id);
              setCategory(null);
              setSubcategory(null);
            }}
            onAllZones={() => {
              if (sessionId) setSelectedLocationId(null); else setDraftZoneId(null);
              setCategory(null);
              setSubcategory(null);
            }}
            onCategoryChange={(value) => {
              setCategory(value);
              setSubcategory(null);
            }}
            onSubcategoryChange={setSubcategory}
            onSupplierChange={setSupplierFilter}
            habitualFilter={habitualFilter}
            onHabitualChange={setHabitualFilter}
            onSearchChange={setSearch}
            onDraftChange={(key, value) => {
              if (sessionId) {
                setDrafts((current) => ({ ...current, [key]: value }));
                scheduleDraftSave(key, value);
                return;
              }
              if (!isAdmin) {
                toast.info("Chiedi a un amministratore di aprire l'inventario: senza inventario aperto le quantità non vengono salvate.");
                return;
              }
              setDraftFirst((current) => ({ ...current, [key]: value }));
              if (!autoStartRef.current && archiveId && activeLocations.length) {
                autoStartRef.current = true;
                void start({ data: { companyId, archiveId, name: null } })
                  .then(async () => {
                    setAutoStartPending(true);
                    await queryClient.invalidateQueries({ queryKey: ["inventory-general-session", companyId, archiveId] });
                    toast.success("Inventario generale aperto: le quantità vengono salvate come bozza");
                  })
                  .catch((error: Error) => {
                    autoStartRef.current = false;
                    toast.error(error.message);
                  });
              }
            }}
            onConfirm={(row) => {
              if (sessionId) {
                void confirmRow(row);
                return;
              }
              const value = parseQuantity(draftFirst[rowKey(row)] ?? "");
              if (value === null) {
                toast.error("Inserisci una quantità valida");
                return;
              }
              if (!draftLocation) {
                toast.error("Scegli prima la zona");
                return;
              }
              firstCount.mutate({ productId: row.product_id, locationId: draftLocation.id, unit: rowUnit(row), value });
            }}
            onConfirmAll={() => { void openBulkReview(); }}
            onClearDrafts={() => {
              if (inventoryResetAction(Boolean(sessionId), cycleColor === "rosso") === "reopen") {
                setReopenResetOpen(true);
              } else {
                setClearDraftsOpen(true);
              }
            }}
            savedDraftCount={savedDraftKeys.size}
            onToggleFavorite={(row) =>
              favoriteMutation.mutate({ productId: row.product_id, favorite: !row.is_favorite })
            }
            onToggleCatalogFavorite={(candidate) => catalogFavoriteMutation.mutate(candidate)}
            onCatalogDraftChange={(id, value) => setCatalogDrafts((current) => ({ ...current, [id]: value }))}
            onCatalogConfirm={(candidate) => {
              const value = parseQuantity(catalogDrafts[candidate.sellerProductId] ?? "");
              if (value === null) {
                toast.error("Inserisci una quantità valida");
                return;
              }
              const location = selectedLocation ?? draftLocation ?? defaultLocation ?? null;
              if (!location) {
                toast.error("Scegli prima la zona");
                return;
              }
              catalogCount.mutate({ candidate, locationId: location.id, value });
            }}
            supplierInfo={supplierInfo}
            priceSeries={priceSeries}
            fieldPreferences={fieldPreferences}
            locationOptions={activeLocations.map((location) => ({ id: location.id, name: location.name }))}
            onRecount={(row) => recountMutation.mutate(row)}
            onNonCompliance={(row) => {
              setCompliance(row);
              setComplianceNote(row.non_compliant_note ?? "");
              setComplianceQuantity(
                row.non_compliant_quantity === null ? "" : String(row.non_compliant_quantity).replace(".", ","),
              );
            }}
            onRevokeNonCompliance={(row) =>
              complianceMutation.mutate({ row, nonCompliant: false, quantity: null, note: null })
            }
            onProposal={(row) => {
              if (row.proposal_status === "aperta") {
                proposalMutation.mutate({ productId: row.product_id, action: "resolve", note: null });
                return;
              }
              setProposalRow(row);
              setProposalNote("");
            }}
            onHistory={(row) => setHistoryRow(row)}
            onOpenProduct={(row) => { productReturnScroll.current = window.scrollY; setProductDialogRow(row); }}
            onCloseInventory={() => { void requestCloseInventory(); }}
            // Ciclo concluso (verde/arancione): le card sono pronte per un nuovo conteggio,
            // senza le quantità dell'inventario precedente. Il passato resta nello storico.
            stockHistory={sessionId || cycleColor !== "rosso" ? null : (stockHistoryQuery.data ?? null)}
            lastClosed={lastClosedQuery.data ? {
              name: lastClosedQuery.data.session.name,
              counted: lastClosedQuery.data.counted,
              total: lastClosedQuery.data.counted,
              finishedAt: lastClosedQuery.data.session.finished_at,
              author: lastClosedQuery.data.author,
            } : null}
            onViewLastClosed={() => { setViewedSession(null); setViewClosedOpen(true); }}
            onOpenInventoryHistory={() => setInventoryHistoryOpen(true)}

            onHideCompletion={() => setShowCompletion(false)}
            closing={closeMutation.isPending}
          />
          </CycleLockContext.Provider>
          </HabitualZonesProvider>
          </UnitChoiceContext.Provider>
          </CardLockContext.Provider>
        )}
      </TabsContent>

      <TabsContent value="fabbisogno">
        {archiveId ? (
          <InventoryRequirementsPanel
            companyId={companyId}
            archiveId={archiveId}
            missingProducts={missingRows.map((row) => ({
              key: `${row.product_id}|${row.location_id}`,
              code: row.code,
              description: row.description,
              unit: rowUnit(row),
            }))}
            onBackToCount={() => {
              setWorkFilter("pending");
              setTab("conteggio");
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Nessun archivio disponibile.</p>
        )}
      </TabsContent>

      <TabsContent value="zone">
        <section className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-3 py-3">Codice</th>
                <th className="px-3 py-3">Predefinita</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Avanzamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {locations.map((location) => {
                const zone = zoneProgress.get(location.id);
                return (
                  <tr key={location.id}>
                    <td className="px-4 py-3 font-medium">{location.name}</td>
                    <td className="px-3 py-3 font-mono text-muted-foreground">{location.code ?? "—"}</td>
                    <td className="px-3 py-3">{location.is_default ? "Sì" : "—"}</td>
                    <td className="px-4 py-3">{location.status === "attivo" ? "Attiva" : "Disattivata"}</td>
                    <td className="px-4 py-3">{zone ? `${zone.completed} / ${zone.total}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Le zone si configurano in Azienda → Magazzino.
          </p>
        </section>
      </TabsContent>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setPendingReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          {pending
            ? (() => {
                const unit = rowUnit(pending.row);
                const difference = (pending.stockValue ?? pending.value) - Number(pending.row.calculated);
                const higher = difference > 0;
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-base">
                        {higher ? "Quantità superiore alla calcolata" : "Quantità inferiore alla calcolata"}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        {rowName(pending.row)} · Cod. {pending.row.code}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-muted/30 py-2 text-center text-[11px]">
                      <p>
                        <strong className="block text-sm">{formatQuantity(Number(pending.row.calculated), unit)}</strong>
                        calcolata
                      </p>
                      <p>
                        <strong className="block text-sm">{formatQuantity(pending.stockValue ?? pending.value, unit)}</strong>fisica
                      </p>
                      <p>
                        <strong className={cn("block text-sm", higher ? "text-success" : "text-destructive")}>
                          {higher ? "+" : ""}
                          {formatQuantity(difference, unit)}
                        </strong>
                        differenza
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold">Motivazione della differenza (facoltativa)</p>
                      <Textarea
                        autoFocus
                        className="min-h-20 text-sm"
                        maxLength={300}
                        placeholder="Es. buttata una cassa perché deteriorata"
                        value={pendingReason}
                        onChange={(event) => setPendingReason(event.target.value)}
                        aria-label="Motivazione della differenza"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {["Merce deteriorata", "Errore di carico", "Reso al fornitore", "Uso interno"].map((reason) => (
                          <Button
                            key={reason}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => setPendingReason(reason)}
                          >
                            {reason}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {pendingReason.trim() ? (
                      <AiAnalysisDemo
                        name={rowName(pending.row)}
                        unit={unit}
                        difference={difference}
                        note={pendingReason.trim()}
                      />
                    ) : null}
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPending(null);
                          setPendingReason("");
                        }}
                      >
                        Annulla
                      </Button>
                      <Button disabled={countMutation.isPending} onClick={savePendingDifference}>
                        <Check className="size-4" /> Conferma differenza
                      </Button>
                    </DialogFooter>
                  </>
                );
              })()
            : null}
        </DialogContent>
      </Dialog>

      {/* Non conforme: segnalazione con quantità facoltativa, nessun effetto sulla giacenza */}
      <Dialog
        open={compliance !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCompliance(null);
            setComplianceNote("");
            setComplianceQuantity("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          {compliance ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Prodotto non conforme</DialogTitle>
                <DialogDescription className="text-xs">
                  {rowName(compliance)} · Cod. {compliance.code}
                </DialogDescription>
              </DialogHeader>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold">
                  Quantità interessata (facoltativa){rowUnit(compliance) ? ` · ${rowUnit(compliance)}` : ""}
                </span>
                <Input
                  inputMode="decimal"
                  value={complianceQuantity}
                  placeholder="Puoi lasciarla vuota se non l'hai ancora quantificata"
                  onChange={(event) => setComplianceQuantity(event.target.value)}
                />
              </label>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Motivazione</p>
                <Textarea
                  className="min-h-20 text-sm"
                  maxLength={300}
                  value={complianceNote}
                  placeholder="Es. prodotto deteriorato, non a norma di legge"
                  onChange={(event) => setComplianceNote(event.target.value)}
                  aria-label="Motivazione della non conformità"
                />
                <div className="flex flex-wrap gap-1.5">
                  {["Prodotto deteriorato", "Non a norma", "Pezzatura errata", "Confezione danneggiata"].map((reason) => (
                    <Button
                      key={reason}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => setComplianceNote(reason)}
                    >
                      {reason}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="rounded-sm border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                La giacenza non cambia: per togliere la merce dal magazzino serve una rettifica di scarto esplicita.
              </p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setCompliance(null)}>
                  Annulla
                </Button>
                <Button
                  disabled={!complianceNote.trim() || complianceMutation.isPending}
                  onClick={() => {
                    const quantity = complianceQuantity.trim() ? parseQuantity(complianceQuantity) : null;
                    if (complianceQuantity.trim() && quantity === null) {
                      toast.error("Inserisci solo un numero");
                      return;
                    }
                    if (quantity !== null && compliance.counted !== null && quantity > Number(compliance.counted)) {
                      toast.error("La quantità non conforme non può superare la quantità fisica confermata");
                      return;
                    }
                    complianceMutation.mutate({
                      row: compliance,
                      nonCompliant: true,
                      quantity,
                      note: complianceNote.trim(),
                    });
                  }}
                >
                  <TriangleAlert className="size-4" /> Registra segnalazione
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Proposta d'acquisto */}
      <Dialog
        open={proposalRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProposalRow(null);
            setProposalNote("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          {proposalRow ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Proponi per l'acquisto</DialogTitle>
                <DialogDescription className="text-xs">
                  {rowName(proposalRow)} · Cod. {proposalRow.code}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                className="min-h-20 text-sm"
                maxLength={300}
                value={proposalNote}
                placeholder="Es. prodotto finito, serve per un nuovo cliente"
                onChange={(event) => setProposalNote(event.target.value)}
                aria-label="Nota della proposta"
              />
              <p className="rounded-sm border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                Resta una proposta: comparirà nella lista della spesa da confermare, senza creare ordini o righe
                definitive.
              </p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setProposalRow(null)}>
                  Annulla
                </Button>
                <Button
                  disabled={proposalMutation.isPending}
                  onClick={() =>
                    proposalMutation.mutate({
                      productId: proposalRow.product_id,
                      action: "flag",
                      note: proposalNote.trim() || null,
                    })
                  }
                >
                  <ShoppingCart className="size-4" /> Proponi
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Articoli senza quantità inserita */}
      <Dialog open={emptyRows !== null} onOpenChange={(open) => !open && setEmptyRows(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-1 border-b border-border bg-primary/10 px-5 py-4 text-left">
            <DialogTitle className="text-base font-bold">Inventario incompleto</DialogTitle>
            <DialogDescription className="text-xs">
              Ci sono {(emptyRows ?? []).length} articoli senza quantità inserita. Potresti aver dimenticato di contarli
              oppure potrebbero essere prodotti esauriti.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 divide-y divide-border overflow-y-auto px-5">
            {(emptyRows ?? []).map((row) => (
              <li key={rowKey(row)} className="flex min-w-0 items-center gap-3 py-2.5">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {row.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{rowName(row)}</span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{rowUnit(row)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-3 border-t border-border px-5 py-4">
            <div className="grid gap-2">
              <Button
                className="w-full"
                onClick={() => {
                  // Non conferma nulla: le quantità scritte restano in bozza.
                  setEmptyRows(null);
                  setWorkFilter("pending");
                  setTab("conteggio");
                  window.setTimeout(() => {
                    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-count-input="true"]'));
                    (inputs.find((input) => input.value.trim() === "") ?? inputs[0])?.focus();
                  }, 150);
                }}
              >
                Riprendi e inserisci
              </Button>
              <Button variant="outline" className="h-auto w-full whitespace-normal py-2 text-xs" disabled={countMutation.isPending} onClick={() => void runConfirmAll("soldOut")}>
                Conferma gli articoli senza quantità come esauriti
              </Button>
              <Button variant="outline" className="h-auto w-full whitespace-normal py-2 text-xs" disabled={countMutation.isPending} onClick={() => void runConfirmAll("enteredOnly")}>
                Lasciali vuoti e chiudi comunque l'inventario
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setEmptyRows(null)}>
                Torna indietro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmedOpen} onOpenChange={setConfirmedOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Chiudere l'inventario?</DialogTitle>
            <DialogDescription>
              Le quantità inserite diventano giacenza. I prodotti non contati restano senza quantità.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {([true, false] as const).map((goToList) => (
              <Button
                key={String(goToList)}
                variant={goToList ? "default" : "outline"}
                className="h-auto w-full whitespace-normal py-2"
                disabled={closeMutation.isPending}
                onClick={async () => {
                  try {
                    await flushDraftWrites();
                    const remaining = await savedDraftsQuery.refetch();
                    if (remaining.error) throw remaining.error;
                    if ((remaining.data ?? []).some((draft) => draft.quantity.trim())) {
                      setConfirmedOpen(false);
                      toast.info("Ci sono ancora bozze: confermale o correggile prima di chiudere.");
                      await openBulkReview();
                      return;
                    }
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Impossibile verificare le bozze");
                    return;
                  }
                  // Entrambe le scelte chiudono l'inventario; cambia solo dove si va dopo.
                  if (sessionId) {
                    try {
                      await closeMutation.mutateAsync();
                    } catch {
                      return;
                    }
                  }
                  setConfirmedOpen(false);
                  await queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] });
                  if (goToList) void navigate({ to: "/acquisti/lista-spesa" });
                }}
              >
                {closeMutation.isPending
                  ? "Chiusura in corso…"
                  : goToList
                    ? "Termina inventario e vai alla Lista della Spesa"
                    : "Termina inventario e resta nel Conteggio"}
              </Button>
            ))}
            <Button variant="ghost" className="w-full" disabled={closeMutation.isPending} onClick={() => setConfirmedOpen(false)}>
              Torna indietro (non chiude nulla)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewClosedOpen} onOpenChange={setViewClosedOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1600px] overflow-y-auto sm:max-w-[1600px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-base">{(viewedSession ?? lastClosedQuery.data?.session)?.name ?? "Ultimo inventario"}</DialogTitle>
            <DialogDescription>
              Le quantità confermate sono visibili qui sotto. Usa “Modifica giacenza” per registrare una rettifica tracciata senza cambiare il conteggio originale.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Inventario chiuso — sola lettura
          </p>
          {viewedSession ?? lastClosedQuery.data ? (
            <InventorySessionCounter
              companyId={companyId}
              session={(viewedSession ?? lastClosedQuery.data?.session)!}
              locations={locations}
              onCorrectCount={(count, product) => {
                setCorrection({
                  productId: product.id,
                  linkId: count.product_supplier_link_id,
                  locationId: count.location_id,
                  countId: count.id,
                  code: product.code,
                  name: product.description ?? product.code,
                  unit: count.unit_code?.trim() || product.danea_um?.trim() || "",
                  countedQuantity: Number(count.counted_quantity),
                  countedAt: count.counted_at,
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <InventoryProductDialog productId={productDialogRow?.product_id ?? null} supplierLinkId={productDialogRow?.product_supplier_link_id ?? null} supplierName={productDialogRow ? (productDialogRow.supplier_name ?? null) : null} returnScrollY={productReturnScroll.current} onClose={() => setProductDialogRow(null)} />
      <InventoryHistoryDialog
        companyId={companyId}
        archiveId={archiveId}
        open={inventoryHistoryOpen}
        onOpenChange={setInventoryHistoryOpen}
        onView={(session) => {
          setViewedSession(session);
          setInventoryHistoryOpen(false);
          setViewClosedOpen(true);
        }}
      />

      <Dialog open={clearDraftsOpen} onOpenChange={setClearDraftsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Svuotare l'inventario?</DialogTitle>
            <DialogDescription>
              Cancello tutte le quantità dell'inventario in corso, anche quelle già confermate, e sblocco tutte le card. La giacenza di magazzino non cambia e lo storico dei conteggi resta. Solo un amministratore può farlo; se gli ordini del ciclo sono già stati inviati non viene modificato nulla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setClearDraftsOpen(false)}>Annulla</Button>
            <Button variant="destructive" disabled={clearAllDrafts.isPending} onClick={() => clearAllDrafts.mutate()}>
              Svuota inventario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InventoryConfirmAllDialog
        open={confirmAllOpen} onOpenChange={setConfirmAllOpen} review={bulkReview}
        loading={reviewLoading} pending={confirmAll.isPending} error={reviewError} skipped={bulkSkipped}
        onConfirm={() => { setReviewError(null); confirmAll.mutate(); }}
        onCorrect={() => { setConfirmAllOpen(false); setTab("conteggio"); }}
      />

      <Dialog open={reopenResetOpen} onOpenChange={setReopenResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Rifare l'inventario da zero?</DialogTitle>
            <DialogDescription>
              Il conteggio confermato viene riaperto e tutte le quantità cancellate: le card si sbloccano vuote. La Lista della Spesa resta com'è e lo storico non si perde.
              Se gli ordini del ciclo sono già stati inviati, l’operazione non è consentita e nessun dato viene modificato.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReopenResetOpen(false)}>Annulla</Button>
            <Button variant="destructive" disabled={reopenCount.isPending} onClick={() => reopenCount.mutate(true)}>
              Rifai inventario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Storico append-only */}
      <Dialog open={historyRow !== null} onOpenChange={(open) => !open && setHistoryRow(null)}>
        <DialogContent className="max-w-lg">
          {historyRow ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Storico dei controlli</DialogTitle>
                <DialogDescription className="text-xs">
                  {rowName(historyRow)} · Cod. {historyRow.code}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {historyQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Caricamento…</p>
                ) : (historyQuery.data ?? []).length ? (
                  (historyQuery.data ?? []).map((entry: CountHistoryEntry) => (
                    <div key={entry.id} className="rounded-sm border border-border bg-muted/30 px-2 py-1.5 text-xs">
                      <p className="font-semibold">
                        {new Date(entry.created_at).toLocaleString("it-IT")} · {ENTRY_LABELS[entry.entry_type]}
                        {entry.location_name ? ` · ${entry.location_name}` : ""}
                      </p>
                      <p className="text-[11px] font-semibold text-foreground">
                        Card: {entry.product_supplier_link_id ? (entry.supplier_name ?? "Fornitore") : "Senza fornitore"}
                        {historyRow && (historyRow.product_supplier_link_id ?? null) === (entry.product_supplier_link_id ?? null) ? " (questa card)" : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {entry.counted_quantity === null
                          ? "Quantità non modificata"
                          : `Quantità ${formatQuantity(Number(entry.counted_quantity), entry.unit_code ?? "")}${
                              entry.unit_code ? ` ${entry.unit_code}` : ""
                            }`}
                        {entry.non_compliant
                          ? ` · non conforme${
                              entry.non_compliant_quantity === null
                                ? " (quantità non indicata)"
                                : ` ${formatQuantity(Number(entry.non_compliant_quantity), entry.unit_code ?? "")}`
                            }`
                          : ""}
                      </p>
                      {entry.note ? <p className="mt-0.5 leading-snug">«{entry.note}»</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna registrazione per questo prodotto.</p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

    </Tabs>
  );
}

function LocationSelection({
  locations,
  selectedId,
  onSelected,
  onCancel,
  onContinue,
}: {
  locations: { id: string; name: string; code: string | null; isDefault: boolean }[];
  selectedId: string | null;
  onSelected: (id: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="mx-auto max-w-xl rounded-md border border-border bg-card">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">Nuovo conteggio fisico</h2>
        <p className="mt-1 text-sm text-muted-foreground">Seleziona la zona da cui iniziare.</p>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
        {locations.map((location) => (
          <Button
            key={location.id}
            type="button"
            variant={selectedId === location.id ? "default" : "outline"}
            className="h-auto min-h-16 justify-start py-3 text-left"
            onClick={() => onSelected(location.id)}
          >
            <MapPin className="size-5 shrink-0" />
            <span>
              {location.name}
              <small className="block font-normal opacity-75">
                {location.code ?? "—"}
                {location.isDefault ? " · Predefinita" : ""}
              </small>
            </span>
          </Button>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-4 sm:px-5">
        <Button variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button disabled={!selectedId} onClick={onContinue}>
          Inizia conteggio
        </Button>
      </div>
    </section>
  );
}

function PhysicalCount({
  companyId,
  sessionActive,
  sessionName,
  progress,
  locations,
  selectedLocation,
  rows,
  catalogCandidates,
  excludedCatalogCount,
  catalogImages,
  catalogDrafts,
  loading,
  imageUrls,
  drafts,
  productView,
  workFilter,
  category,
  subcategory,
  supplierFilter,
  supplierOptions,
  filtersActive,
  searchElsewhere,
  onShowElsewhere,
  search,
  isAdmin,
  showCompletion,
  onViewChange,
  onWorkFilterChange,
  onLocationChange,
  onAllZones,
  onCategoryChange,
  onSubcategoryChange,
  onSupplierChange,
  habitualFilter,
  onHabitualChange,
  onSearchChange,
  onDraftChange,
  onConfirm,
  onConfirmAll,
  onClearDrafts,
  savedDraftCount,
  onToggleFavorite,
  onToggleCatalogFavorite,
  onCatalogDraftChange,
  onCatalogConfirm,
  supplierInfo,
  priceSeries,
  fieldPreferences,
  locationOptions,
  onRecount,
  onNonCompliance,
  onRevokeNonCompliance,
  onProposal,
  onHistory,
  onOpenProduct,
  onCloseInventory,
  lastClosed,
  onViewLastClosed,
  onOpenInventoryHistory,
  stockHistory,

  onHideCompletion,
  closing,
  statusSlot,
  printAction,
  extraSection,
  cardMinWidth,
}: {
  companyId: string;
  sessionActive: boolean;
  sessionName: string;
  progress: InventoryProgress | undefined;
  locations: { id: string; name: string; progress: { completed: number; total: number } | undefined }[];
  selectedLocation: { id: string; name: string } | null;
  rows: InventoryCountRow[];
  catalogCandidates: CatalogCandidate[];
  excludedCatalogCount: number;
  catalogImages: Map<string, string>;
  catalogDrafts: Record<string, string>;
  loading: boolean;
  imageUrls: Map<string, string>;
  drafts: Record<string, string>;
  productView: ProductView;
  workFilter: WorkFilter;
  category: string | null;
  subcategory: string | null;
  supplierFilter: string | null;
  supplierOptions: string[];
  filtersActive: boolean;
  searchElsewhere: SearchElsewhere | null;
  onShowElsewhere: (found: SearchElsewhere) => void;
  search: string;
  isAdmin: boolean;
  showCompletion: boolean;
  onViewChange: (value: ProductView) => void;
  onWorkFilterChange: (value: WorkFilter) => void;
  onLocationChange: (id: string) => void;
  onAllZones: () => void;
  onCategoryChange: (value: string) => void;
  onSubcategoryChange: (value: string) => void;
  onSupplierChange: (value: string | null) => void;
  habitualFilter: HabitualFilter;
  onHabitualChange: (value: HabitualFilter) => void;
  onSearchChange: (value: string) => void;
  onDraftChange: (key: string, value: string) => void;
  onConfirm: (row: InventoryCountRow) => void;
  onConfirmAll: () => void;
  onClearDrafts: () => void;
  savedDraftCount: number;
  onToggleFavorite: (row: InventoryCountRow) => void;
  onToggleCatalogFavorite: (candidate: CatalogCandidate) => void;
  onCatalogDraftChange: (id: string, value: string) => void;
  onCatalogConfirm: (candidate: CatalogCandidate) => void;
  supplierInfo: Map<string, SupplierInfo>;
  priceSeries: Map<string, PriceSeriesRow>;
  fieldPreferences: FieldPreferences;
  locationOptions: { id: string; name: string }[];
  onRecount: (row: InventoryCountRow) => void;
  onNonCompliance: (row: InventoryCountRow) => void;
  onRevokeNonCompliance: (row: InventoryCountRow) => void;
  onProposal: (row: InventoryCountRow) => void;
  onHistory: (row: InventoryCountRow) => void;
  onOpenProduct: (row: InventoryCountRow) => void;
  onCloseInventory: () => void;
  lastClosed: { name: string; counted: number; total: number; finishedAt: string | null; author: string | null } | null;
  onViewLastClosed: () => void;
  onOpenInventoryHistory: () => void;
  stockHistory: Map<string, StockHistory> | null;
  onHideCompletion: () => void;
  closing: boolean;
  statusSlot?: ReactNode;
  printAction?: ReactNode;
  extraSection?: ReactNode;
  cardMinWidth: number;
}) {
  const [layout, setLayout] = useState<"cards" | "rows">("cards");
  const [layoutKey, setLayoutKey] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      // Device identity is local to this browser, independent of viewport resizing.
      try {
        const deviceKey = "trevi-inventory-device";
        let device = localStorage.getItem(deviceKey);
        if (!device) { device = crypto.randomUUID(); localStorage.setItem(deviceKey, device); }
        const key = `trevi-inventory-layout:${data.user.id}:${companyId}:${device}`;
        setLayout(localStorage.getItem(key) === "rows" ? "rows" : "cards");
        setLayoutKey(key);
      } catch { setLayout("cards"); setLayoutKey(null); }
    });
    return () => { active = false; };
  }, [companyId]);
  const changeLayout = (next: "cards" | "rows") => {
    setLayout(next);
    if (layoutKey) { try { localStorage.setItem(layoutKey, next); } catch { /* Unavailable storage never blocks work. */ } }
  };
  const layoutControls = (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5" role="group" aria-label="Vista prodotti">
      <Button size="sm" variant={layout === "cards" ? "default" : "ghost"} className="h-8 w-8 px-0" aria-label="Vista Card" aria-pressed={layout === "cards"} title="Card" onClick={() => changeLayout("cards")}><LayoutGrid className="size-4" /></Button>
      <Button size="sm" variant={layout === "rows" ? "default" : "ghost"} className="h-8 w-8 px-0" aria-label="Vista Righe" aria-pressed={layout === "rows"} title="Righe" onClick={() => changeLayout("rows")}><List className="size-4" /></Button>
    </div>
  );
  const total = progress?.total ?? 0;
  const generalCompleted = progress?.completed ?? 0;
  const generalDifferences = progress?.differences ?? 0;
  const unchanged = progress?.unchanged ?? 0;
  const notComparable = progress?.not_comparable ?? 0;
  const percentage = total ? Math.round((generalCompleted / total) * 100) : 0;
  const completed = total > 0 && (progress?.pending ?? 1) === 0;

  const scope = subcategory ?? category ?? selectedLocation?.name ?? "Tutto l'inventario";
  const scopeProgress = subcategory
    ? progress?.subcategories.find((item) => item.name === subcategory && (!category || item.category === category))
    : category
      ? progress?.categories.find((item) => item.name === category)
      : selectedLocation
        ? locations.find((item) => item.id === selectedLocation.id)?.progress
        : { completed: generalCompleted, total };

  const categories = progress?.categories?.length
    ? progress.categories
    : [...new Set([
        ...rows.map((row) => row.category?.trim() || NO_CATEGORY),
        ...catalogCandidates.map((item) => item.category?.trim() || NO_CATEGORY),
      ])].sort().map((name) => ({ name, completed: 0, total: 0 }));
  const subcategories = progress?.subcategories?.length
    ? progress.subcategories.filter((item) => !category || item.category === category)
    : [...new Set([
        ...rows.filter((row) => !category || (row.category?.trim() || NO_CATEGORY) === category)
          .map((row) => row.subcategory?.trim() || NO_SUBCATEGORY),
        ...catalogCandidates.filter((item) => !category || (item.category?.trim() || NO_CATEGORY) === category)
          .map((item) => item.subcategory?.trim() || NO_SUBCATEGORY),
      ])].sort().map((name) => ({ name, category: category ?? "", completed: 0, total: 0 }));
  // Il filtro fornitore è già applicato dalla regola unica delle card (selectInventoryCards).
  const visibleRows = rows;
  const filteredSummary = summarizeCards(visibleRows);

  // Barra compatta (ricerca + filtri) mostrata solo quando la ricerca originale esce dallo schermo.
  const cycleLock = useContext(CycleLockContext);
  const cardLockState = useContext(CardLockContext);
  const topFiltersRef = useRef<HTMLDivElement>(null);
  const [compactBar, setCompactBar] = useState(false);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const vvBottom = useVisualViewportBottom();
  // Measure a document-space marker against the CSS sticky inset, never the changing
  // header rectangle. Separate entry/exit margins prevent scroll anchoring feedback.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const search = topFiltersRef.current;
      const header = stickyHeaderRef.current;
      if (!search || !header) return;
      const scrollY = Math.max(0, window.scrollY);
      const markerY = search.getBoundingClientRect().top + window.scrollY;
      const stickyInset = Number.parseFloat(window.getComputedStyle(header).top) || 0;
      setCompactBar((current) => inventoryCompactBar(current, scrollY, markerY, stickyInset));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const resizeObserver = new ResizeObserver(schedule);
    if (stickyHeaderRef.current) resizeObserver.observe(stickyHeaderRef.current);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      resizeObserver.disconnect();
    };
  }, []);

  const filterControls = (
          <div data-tour="inv.filtri" className="flex items-center gap-1.5 overflow-x-auto py-1 [&>*]:shrink-0">
            <div className="grid grid-cols-2 rounded-md border border-border p-0.5">
              <Button size="sm" className="h-8 text-xs" variant={productView === "favorites" ? "default" : "ghost"} onClick={() => onViewChange("favorites")}>
                <Star className="size-3.5" /> Preferiti
              </Button>
              <Button size="sm" className="h-8 text-xs" variant={productView === "all" ? "default" : "ghost"} onClick={() => onViewChange("all")}>
                Tutti
              </Button>
            </div>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={onClearDrafts}>
              {!sessionActive && cycleLock.locked ? "Rifai inventario" : "Svuota"}
            </Button>
            <Button size="sm" className="h-8 px-2 text-xs" variant={workFilter === "all" ? "default" : "outline"} onClick={() => onWorkFilterChange("all")}>
              Tutti gli stati
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 px-2 text-xs" variant={workFilter !== "all" ? "default" : "outline"}>
                  {workFilter !== "all" ? `Altri stati: ${WORK_FILTER_LABELS[workFilter]}` : "Altri stati"}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {(["pending", "completed", "differences", "not_comparable", "recount", "missing_unit"] as const).map((value) => (
                  <DropdownMenuCheckboxItem key={value} checked={workFilter === value} onCheckedChange={() => onWorkFilterChange(value)}>
                    {WORK_FILTER_LABELS[value]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 px-2 text-xs" variant={habitualFilter !== null ? "default" : "outline"}>
                  Zona abituale: {habitualFilter === null ? "Tutte" : habitualFilter === NO_HABITUAL ? "Senza zona" : (locationOptions.find((l) => l.id === habitualFilter)?.name ?? "—")}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuCheckboxItem checked={habitualFilter === null} onCheckedChange={() => onHabitualChange(null)}>Tutte (anche senza zona)</DropdownMenuCheckboxItem>
                {locationOptions.map((location) => (
                  <DropdownMenuCheckboxItem key={`ab-${location.id}`} checked={habitualFilter === location.id} onCheckedChange={() => onHabitualChange(location.id)}>
                    {location.name}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuCheckboxItem checked={habitualFilter === NO_HABITUAL} onCheckedChange={() => onHabitualChange(NO_HABITUAL)}>Senza zona abituale</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <div className="flex shrink-0 items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-[11px]">
                  <SlidersHorizontal className="size-3.5" /> Filtri
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">Zona del conteggio</DropdownMenuLabel>
                <DropdownMenuItem onClick={onAllZones}>Tutte le zone</DropdownMenuItem>
                {locationOptions.map((location) => (
                  <DropdownMenuItem key={location.id} onClick={() => onLocationChange(location.id)}>
                    {location.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Fornitore</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onSupplierChange(null)}>Tutti i fornitori</DropdownMenuItem>
                {supplierOptions.map((name) => (
                  <DropdownMenuItem key={name} onClick={() => onSupplierChange(name)}>{name}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Categoria</DropdownMenuLabel>
                {categories.length ? (
                  categories.slice(0, 12).map((item) => (
                    <DropdownMenuItem key={item.name} onClick={() => onCategoryChange(item.name)}>
                      {item.name}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>Nessuna categoria</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Sottocategoria</DropdownMenuLabel>
                {subcategories.length ? subcategories.slice(0, 12).map((item) => (
                  <DropdownMenuItem key={`${item.category}-${item.name}`} onClick={() => onSubcategoryChange(item.name)}>{item.name}</DropdownMenuItem>
                )) : <DropdownMenuItem disabled>Nessuna sottocategoria</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-[11px]">
                  <Columns3 className="size-3.5" /> Colonne
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">Informazioni da mostrare</DropdownMenuLabel>
                {fieldPreferences.fields.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.id}
                    checked={fieldPreferences.isVisible(field.id)}
                    onCheckedChange={(checked) =>
                      fieldPreferences.setVisibility((current) => ({ ...current, [field.id]: checked }))
                    }
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={fieldPreferences.reset}>Ripristina predefinite</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {printAction}
            </div>
            {void excludedCatalogCount}
          </div>
  );

  return (
    <section className="space-y-2 pb-40 lg:pb-32 [overflow-anchor:none]">
      <div ref={topFiltersRef} className="h-px" aria-hidden="true" />
      <div
        ref={stickyHeaderRef}
        className={cn(
          // Sotto la testata mobile (sticky top-0, h-14) e sempre con sfondo pieno.
          "sticky top-14 z-10 rounded-md border bg-card px-3 py-2 shadow-sm lg:top-0",
          completed ? "border-success/60" : "border-primary/20",
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
              {sessionActive ? "Inventario generale" : "Nessun inventario in corso"}
            </p>
            <h2 className="truncate font-display text-sm font-bold uppercase leading-tight sm:text-base">
              {sessionActive ? sessionName : cycleLock.locked ? "Completa prima il ciclo acquisti" : "Scrivi una quantità per iniziare"}
            </h2>
          </div>
          {sessionActive ? (
            <div className="flex shrink-0 items-baseline gap-1.5">
              <p className="text-lg font-bold leading-none sm:text-xl">
                {generalCompleted} / {total}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground">{percentage}%</p>
            </div>
          ) : null}
        </div>
        {compactBar ? (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer">{cycleLock.locked ? "Ciclo acquisti bloccato" : completed ? "Conteggio completato" : "Inventario in corso"} · Dettagli e azioni</summary>
            {statusSlot}
          </details>
        ) : statusSlot}
        {!compactBar && !sessionActive && lastClosed ? (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1.5">
            <div className="min-w-0 text-xs leading-tight text-muted-foreground">
              <p className="text-[10px] font-semibold uppercase">Ultimo inventario · passato, non è il conteggio da fare ora</p>
              <p className="font-medium text-foreground">
                {lastClosed.finishedAt ? dateTimeShort(lastClosed.finishedAt) : lastClosed.name}
              </p>
              <p>
                {lastClosed.author ? `Fatto da ${lastClosed.author} · ` : ""}
                {lastClosed.counted} prodotti contati
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onViewLastClosed}>
                Visualizza
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" data-tour="inv.storico" onClick={onOpenInventoryHistory}>
                Storico inventari
              </Button>
            </div>
          </div>
        ) : null}
        {sessionActive && !compactBar ? (
          <>
            <Progress value={percentage} className="mt-1.5 h-2" />
            <div className="mt-1.5 grid grid-cols-3 divide-x divide-border text-center text-[10px] leading-tight sm:text-xs">
              <p>
                <strong className="mr-1 text-sm sm:text-base">{unchanged}</strong>confermati
              </p>
              <p>
                <strong className="mr-1 text-sm text-destructive sm:text-base">{generalDifferences}</strong>differenze
              </p>
              <p>
                <strong className="mr-1 text-sm text-primary sm:text-base">{total - generalCompleted}</strong>mancanti
              </p>
            </div>
            {(progress?.missing_unit ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => onWorkFilterChange(workFilter === "missing_unit" ? "all" : "missing_unit")}
                className="mt-1.5 block w-full cursor-pointer rounded-sm border border-warning/50 bg-warning/10 px-2 py-1 text-left text-[10px] font-semibold text-warning-foreground transition-colors hover:bg-warning/20"
              >
                {progress?.missing_unit} {progress?.missing_unit === 1 ? "prodotto" : "prodotti"} senza U.M. di magazzino: conteggio disponibile nella U.M. scelta.{" "}
                <span className="underline underline-offset-2">
                  {workFilter === "missing_unit" ? "Togli il filtro per vedere tutti i prodotti." : "Tocca qui per vedere quali sono."}
                </span>
              </button>
            ) : null}
          </>
        ) : null}
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div data-tour="inv.ricerca" className="relative min-w-0">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8 text-sm" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Cerca prodotto o codice" aria-label="Ricerca prodotto" />
          </div>
          {layoutControls}
        </div>
        {filterControls}
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {sessionActive ? (
            <div className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
              <p aria-live="polite">
                <strong className="text-foreground">
                  Vista attuale · {productView === "favorites" ? "Preferiti" : "Tutti"}{filtersActive ? " (filtrata)" : ""}
                </strong>
                {" · "}<strong className="text-foreground">{filteredSummary.cards}</strong> card da contare
                {" · "}<strong className="text-foreground">{filteredSummary.confirmed}</strong> contate
                {" · "}<strong className="text-primary">{filteredSummary.pending}</strong> mancanti
                {" · "}{cardPercentage(filteredSummary)}%
                {filteredSummary.products !== filteredSummary.cards ? ` · ${filteredSummary.products} prodotti` : ""}
                {filteredSummary.differences ? ` · ${filteredSummary.differences} differenze` : ""}
              </p>
              {filtersActive ? (
                <p className="mt-0.5">«Conferma tutto» controlla tutte le card della sessione, anche quelle non visualizzate.</p>
              ) : null}
            </div>
          ) : scope !== "Tutto l'inventario" ? (
            <p className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
              <strong className="text-foreground">{scope}</strong> · {scopeProgress?.completed ?? 0} / {scopeProgress?.total ?? visibleRows.length} completati
            </p>
          ) : null}
          {cardLockState.canSave ? null : (
            <div role="alert" className="m-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
              Aggiorna la pagina: l'Inventario è stato aggiornato. I salvataggi sono sospesi fino al ricaricamento.
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.location.reload()}>Ricarica</Button>
            </div>
          )}
          {visibleRows.length || catalogCandidates.length ? (
            <div
              data-tour="inv.card"
              className={layout === "rows" ? "grid grid-cols-1 gap-1 p-1" : "grid items-stretch gap-2 p-2"}
              style={layout === "cards" ? { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardMinWidth}px), 1fr))` } : undefined}
            >
              {[
                // Intestazione del prodotto quando ha più card: nome e totale (solo U.M. compatibili).
                ...[...new Map(visibleRows.map((row) => [groupKey(row), row])).values()]
                  .filter((row) => visibleRows.filter((other) => groupKey(other) === groupKey(row)).length > 1)
                  .map((row) => {
                    const cards = visibleRows.filter((other) => groupKey(other) === groupKey(row));
                    return {
                      key: `gruppo-${groupKey(row)}`,
                      description: row.description,
                      code: row.code,
                      header: true,
                      node: <CardGroupHeader name={rowName(row)} zone={row.location_name} cards={cards} />,
                    };
                  }),
                ...visibleRows.map((row) => ({
                  key: rowKey(row),
                  header: false,
                  description: row.description,
                  code: row.code,
                  node: (
                    <ProductCard
                      layout={layout}
                      companyId={companyId}
                      row={row}
                      imageUrl={imageUrls.get(row.product_id)}
                      value={drafts[rowKey(row)] ?? ""}
                      isAdmin={isAdmin}
                      actionsEnabled={sessionActive}
                      supplier={supplierInfo.get(row.product_id) ?? null}
                      priceSeries={priceSeries.get(row.product_id) ?? null}
                      isVisible={fieldPreferences.isVisible}
                      onChange={(value) => onDraftChange(rowKey(row), value)}
                      onConfirm={() => onConfirm(row)}
                      onToggleFavorite={() => onToggleFavorite(row)}
                      onRecount={() => onRecount(row)}
                      onNonCompliance={() => onNonCompliance(row)}
                      onRevokeNonCompliance={() => onRevokeNonCompliance(row)}
                      onProposal={() => onProposal(row)}
                      onHistory={() => onHistory(row)}
                      onOpenProduct={() => onOpenProduct(row)}
                      history={stockHistory ? (stockHistory.get(row.product_id) ?? null) : null}
                    />
                  ),
                })),
                ...catalogCandidates.map((candidate) => ({
                  key: `catalogo-${candidate.sellerProductId}`,
                  header: false,
                  description: candidate.description,
                  code: candidate.code,
                  node: (
                    <CatalogProductCard
                      candidate={candidate}
                      imageUrl={catalogImages.get(candidate.sellerProductId)}
                      value={catalogDrafts[candidate.sellerProductId] ?? ""}
                      disabled={!isAdmin || cycleLock.locked}
                      onChange={(value) => onCatalogDraftChange(candidate.sellerProductId, value)}
                      onConfirm={() => onCatalogConfirm(candidate)}
                      onToggleFavorite={() => onToggleCatalogFavorite(candidate)}
                    />
                  ),
                })),
              ]
                .sort((left, right) => byName(left.description, left.code, right.description, right.code)
                  || Number(right.header) - Number(left.header))
                .map((item) => (
                  <div key={item.key} className={cn("flex h-full min-w-0 flex-col", item.header && "col-span-full")}>
                    {item.node}
                  </div>
                ))}
            </div>
          ) : null}


          {!visibleRows.length && !catalogCandidates.length ? (
            <div className="p-8 text-center">
              <PackageSearch className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                {loading ? "Caricamento…" : search.trim() && !searchElsewhere && sessionActive ? "Nessun prodotto trovato" : "Nessun prodotto in questa vista"}
              </p>
              {!loading && searchElsewhere ? (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span>{elsewhereText(searchElsewhere)}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onShowElsewhere(searchElsewhere)}>Mostra</Button>
                </div>
              ) : (
                <div className="mt-1 grid justify-items-center gap-2 text-xs text-muted-foreground">
                  <span>{filtersActive ? "Ci sono filtri attivi che nascondono i prodotti." : "Cambia filtro o selezione per continuare."}</span>
                  {filtersActive && !loading ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => onShowElsewhere({ reasons: ["view", "work", "category", "subcategory", "location", "supplier"], locations: [] })}>
                      Togli i filtri
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {extraSection}

          <div data-tour="inv.conferma" style={{ "--vv-bottom": `${vvBottom}px` } as CSSProperties} className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+var(--vv-bottom,0px))] z-20 grid justify-items-center gap-1.5 border-t border-sidebar-border bg-sidebar px-3 py-2 sm:px-5 lg:bottom-0 lg:left-60 lg:px-4">
            {savedDraftCount ? (
              <span className="min-w-0 text-center text-[11px] text-sidebar-foreground/70">
                Bozza salvata · {savedDraftCount} {savedDraftCount === 1 ? "quantità non confermata" : "quantità non confermate"}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="w-full max-w-md shrink-0 justify-center bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
              onClick={onConfirmAll}
              disabled={!sessionActive || !cardLockState.canSave || cardLockState.pending || closing}
            >
              <CheckCheck /> Conferma tutto
            </Button>
            {sessionActive && isAdmin ? <Button size="sm" variant="outline" className="w-full max-w-md" disabled={closing || cardLockState.pending || !cardLockState.canSave} onClick={onCloseInventory}>
              <Lock /> Chiudi inventario
            </Button> : null}
          </div>
        </div>
      </div>

      {completed && showCompletion ? (
        <CompletionSummary
          total={total}
          unchanged={unchanged}
          differences={generalDifferences}
          notComparable={notComparable}
          isAdmin={isAdmin}
          closing={closing}
          onShowDifferences={() => {
            onWorkFilterChange("differences");
            onHideCompletion();
          }}
          onClose={onCloseInventory}
        />
      ) : null}
    </section>
  );
}

/** Storico del prodotto quando non c'è un inventario aperto: giacenza reale e ultimo conteggio compatibile. */
type StockHistory = {
  hasCount: boolean;
  /** Conteggi esistenti ma non nella U.M. di magazzino attuale: nessuna giacenza numerica. */
  toVerify: boolean;
  stock: number | null;
  lastQuantity: number | null;
  lastUnit: string | null;
  lastAt: string | null;
  lastCountId: string | null;
  lastSessionId: string | null;
  physical: number | null;
  previousQuantity: number | null;
  countNote: string | null;
  edits: PhysicalEdit[];
};

function ProductCard({
  layout = "cards",
  companyId,
  row,
  imageUrl,
  value,
  isAdmin,
  actionsEnabled,
  supplier,
  priceSeries,
  isVisible,
  onChange,
  onConfirm,
  onToggleFavorite,
  onRecount,
  onNonCompliance,
  onRevokeNonCompliance,
  onProposal,
  onHistory,
  onOpenProduct,
  history,
}: {
  layout?: "cards" | "rows";
  companyId: string;
  row: InventoryCountRow;
  imageUrl: string | undefined;
  value: string;
  isAdmin: boolean;
  actionsEnabled: boolean;
  supplier: SupplierInfo | null;
  priceSeries: PriceSeriesRow | null;
  isVisible: (id: InventoryFieldId) => boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onToggleFavorite: () => void;
  onRecount: () => void;
  onNonCompliance: () => void;
  onRevokeNonCompliance: () => void;
  onProposal: () => void;
  onHistory: () => void;
  onOpenProduct: () => void;
  history?: StockHistory | null;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const rowLayout = layout === "rows";
  const cycleLock = useContext(CycleLockContext);
  const cycleLocked = cycleLock.locked && Boolean(history);
  const canCorrect =
    cycleLocked && isAdmin && Boolean(history?.lastCountId) && history?.lastSessionId === cycleLock.cycleSessionId;
  const correctionTarget: PhysicalQuickEditTarget | null =
    canCorrect && history?.lastCountId && history.lastQuantity != null && history.physical != null && cycleLock.companyId && cycleLock.locationId
      ? {
          companyId: cycleLock.companyId,
          listId: cycleLock.listId ?? null,
          productId: row.product_id,
          linkId: row.product_supplier_link_id,
          locationId: cycleLock.locationId,
          countId: history.lastCountId,
          unit: history.lastUnit ?? rowUnit(row) ?? "",
          countedQuantity: history.lastQuantity,
          countedAt: history.lastAt,
          physical: history.physical,
          previousQuantity: history.previousQuantity,
          countNote: history.countNote,
          edits: history.edits,
        }
      : null;
  const correction = usePhysicalCorrection(correctionTarget, Boolean(cycleLock.unlockedAll));
  const correcting = correction.editing;
  // Bloccata: scheda ocra, controlli disabilitati (matita esclusa). Sbloccata: aspetto normale.
  const cardLock = useContext(CardLockContext);
  const locked = inventoryCardLocked(row.counted !== null, cardLock.unlocked.has(rowKey(row)), cycleLocked, correcting);
  const editable = cardLock.canSave
    && canEditInventoryCard(locked, correction.pending || cardLock.pending, row.stock_unit_missing);
  const showCard = actionsEnabled && (cardLock.groupSize.get(groupKey(row)) ?? 0) > 0;
  const changeQuantity = (next: string) => {
    if (!editable) return;
    if (correcting) correction.setValue(next); else onChange(next);
  };
  const confirmQuantity = () => {
    if (!editable) return;
    if (correcting) void correction.confirm(); else onConfirm();
  };
  const unitChoice = useContext(UnitChoiceContext);
  const allowedUnits = unitChoice.allowed.get(row.product_id) ?? [];
  // Default: la prima U.M. abituale del prodotto è automaticamente preferita;
  // seguono l'U.M. dell'ultimo conteggio e, per ultima, la U.M. di magazzino.
  const lastCountedUnitId = allowedUnits.find((option) => option.code === row.counted_unit_code?.trim())?.id;
  const chosenUnitId = inventoryDefaultUnitId({
    chosenId: unitChoice.chosen[rowKey(row)],
    preferredId: unitChoice.preferred.get(row.product_id),
    lastCountedId: lastCountedUnitId,
    stockUnitId: allowedUnits.find((option) => option.code === rowUnit(row))?.id,
  }) ?? undefined;
  const unit = allowedUnits.find((option) => option.id === chosenUnitId)?.code ?? rowUnit(row);
  const conversionQuery=useQuery({queryKey:["inventory-count-factor",row.product_id,chosenUnitId],enabled:editable&&Boolean(chosenUnitId)&&unit!==row.stock_unit_code, retry:false,queryFn:async()=>{
    if(!chosenUnitId) return null;
    const {data,error}=await supabase.rpc("inventory_count_conversion",{_product_id:row.product_id,_unit_id:chosenUnitId});
    if(error) throw new Error(error.message);
    return data?.[0]?.factor??null;
  }});
  const draftFactor=unit===row.stock_unit_code?1:conversionQuery.data??null;
  const unitMissing = row.stock_unit_missing;
  const name = rowName(row);
  // Giacenza "Da verificare": nessun numero finché non c'è un conteggio nella U.M. di magazzino.
  const calculated = row.calculated === null ? null : Number(row.calculated);
  const counted = parseQuantity(value);
  const isConfirmed = row.counted !== null;
  const countedUnit = row.counted_unit_code?.trim() || unit;
  const confirmedDifference = isConfirmed && row.units_comparable !== false ? Number(row.difference ?? 0) : null;
  const hasDifference = isConfirmed && confirmedDifference !== null && confirmedDifference !== 0;
  const difference = calculated === null || (history && !history.hasCount)
    ? null
    : counted === null
      ? (isConfirmed ? confirmedDifference : null)
      : draftFactor===null?null:counted*draftFactor - calculated;
  const needsRecount = row.recount_requested_at !== null;
  const proposalOpen = row.proposal_status === "aperta";
  const status = needsRecount
    ? "Da ricontare"
    : !isConfirmed
      ? "Mai contato"
      : hasDifference
        ? confirmedDifference! > 0
          ? "Differenza in più"
          : "Differenza in meno"
        : Number(row.counted) === 0
          ? "Zero verificato"
          : "Confermato";
  // Senza inventario aperto: lo stato riflette lo storico del prodotto, non la sessione.
  const previewStatus = history && !isConfirmed && !needsRecount
      ? (history.hasCount ? "Contato in precedenza" : history.toVerify ? "Da verificare" : "Mai contato")
      : null;

  return (
    <article
      className={cn(
        rowLayout ? "@container grid grid-cols-1 items-center gap-1 rounded-md border bg-card px-2 py-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:gap-3" : "@container flex h-full flex-col rounded-md border-2 bg-card p-2",
        !isConfirmed && "border-border",
        isConfirmed && !hasDifference && "border-success/50 bg-success/5",
        hasDifference && "border-destructive/50 bg-destructive/5",
        needsRecount && "border-primary/60 bg-primary/5",
        locked && "border-primary/60 bg-primary/15",
      )}
    >
      {/* Nome a tutta larghezza, comandi a destra; immagine e scritte sotto, così il nome non compete con l'immagine. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1 gap-y-1">
        <div className="col-start-1 row-start-1 min-w-0">
          <p title={name} className="truncate font-display text-[13px] font-bold uppercase leading-tight @[340px]:text-sm">{name}</p>
          {rowLayout ? <p className="truncate text-[10px] leading-tight text-muted-foreground" title={`Cod. ${row.code} · ${cardTitle(row)}${isVisible("zona") && row.location_name ? ` · Zona conteggio: ${row.location_name}` : ""}`}>
            {row.code} · {cardTitle(row)}{isVisible("zona") && row.location_name ? ` · ${row.location_name}` : ""}
          </p> : null}
          {showCard && !rowLayout ? (
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
              <span className="truncate text-[11px] font-semibold leading-tight text-foreground">{cardTitle(row)}</span>
              {/* Stella della card nascosta: nell'Inventario decide solo la stella del prodotto (dati invariati). */}
              {row.card_label && row.card_label !== "Senza fornitore" ? (
                <span className="rounded-sm bg-muted px-1 py-0.5 text-[9px] font-bold uppercase leading-none text-muted-foreground">{row.card_label}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={rowLayout ? "hidden" : "col-start-1 row-start-2 flex min-w-0 items-start gap-2"}>
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded-sm border border-border object-cover @[340px]:size-12" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-muted @[340px]:size-12">
              <Package className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
          <p className="text-[11px] leading-tight text-muted-foreground">
            Cod. {row.code}
            {unit ? ` · ${unit}` : ""}
            {isVisible("zona") ? ` · Zona conteggio: ${row.location_name}` : ""}
          </p>
          <HabitualZoneControl productId={row.product_id} />
          {isVisible("categoria") && row.category ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {row.category}
              {isVisible("sottocategoria") && row.subcategory ? ` · ${row.subcategory}` : ""}
            </p>
          ) : null}
          {isVisible("fornitore") || isVisible("prezzo_acquisto") ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {isVisible("fornitore") ? (supplier?.name ?? "Nessun fornitore collegato") : ""}
              {isVisible("prezzo_acquisto") && supplier?.cost !== null && supplier?.cost !== undefined
                ? ` · € ${Number(supplier.cost).toFixed(2).replace(".", ",")}`
                : ""}
            </p>
          ) : null}
          {isVisible("scorta_minima") || isVisible("fabbisogno") ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {isVisible("scorta_minima") ? `Scorta minima ${row.min_stock ?? "—"}` : ""}
              {isVisible("fabbisogno") && row.order_multiple ? ` · multiplo ${row.order_multiple}` : ""}
            </p>
          ) : null}
          {isVisible("ultimo_conteggio") && row.counted_at ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              Ultimo conteggio {new Date(row.counted_at).toLocaleDateString("it-IT")}
            </p>
          ) : null}
          {history?.hasCount && history.lastQuantity !== null ? (
            <p className="whitespace-normal break-words text-[11px] font-semibold leading-tight text-foreground">
              Ultimo conteggio: {formatQuantity(history.lastQuantity, history.lastUnit ?? unit)}
              {history.lastUnit ?? unit ? ` ${history.lastUnit ?? unit}` : ""}
              {history.lastAt ? ` · ${new Date(history.lastAt).toLocaleDateString("it-IT")}` : ""}
            </p>
          ) : null}
          </div>
        </div>
        <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-0.5">
          <PriceTrendIcon
            series={priceSeries}
            label={`Andamento prezzo di ${name}`}
            companyId={companyId}
            productId={row.product_id}
          />
          {isAdmin ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 w-7 px-0", row.is_favorite && "text-primary")}
              tabIndex={-1}
              aria-label={row.is_favorite ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
              title={row.is_favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
              onClick={onToggleFavorite}
              disabled={locked}
            >
              <Star className={cn("size-3.5", row.is_favorite && "fill-current")} />
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 px-0"
                tabIndex={-1}
                aria-label={`Azioni su ${name}`}
              >
                <MoreVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={onRecount} disabled={!isAdmin || !actionsEnabled}>
                <RotateCcw className="size-3.5" /> Segna da ricontare
              </DropdownMenuItem>
              {row.non_compliant ? (
                <DropdownMenuItem onClick={onRevokeNonCompliance} disabled={!isAdmin || !actionsEnabled}>
                  <TriangleAlert className="size-3.5" /> Revoca non conforme
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onNonCompliance} disabled={!isAdmin || !actionsEnabled}>
                  <TriangleAlert className="size-3.5" /> Segnala non conforme
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onProposal} disabled={!isAdmin || !actionsEnabled}>
                <ShoppingCart className="size-3.5" />
                {proposalOpen ? "Chiudi proposta d'acquisto" : "Proponi per l'acquisto"}
              </DropdownMenuItem>
              {rowLayout ? <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{previewStatus ?? status}</DropdownMenuLabel>
                <DropdownMenuItem disabled>Calcolata: {calculated === null || (history && !history.hasCount) ? "—" : formatQuantity(calculated, row.stock_unit_code ?? "")} {unit}</DropdownMenuItem>
                {[1, 3, 5, 10].map((increment) => <DropdownMenuItem key={increment} disabled={!editable} onClick={() => changeQuantity(addToQuantity(correcting ? correction.value : value, increment))}>+{increment}</DropdownMenuItem>)}
                <DropdownMenuItem disabled={!editable} onClick={() => changeQuantity("")}>Azzera quantità</DropdownMenuItem>
                <DropdownMenuLabel>Zona abituale</DropdownMenuLabel>
                <HabitualZoneControl productId={row.product_id} />
                {isVisible("categoria") && row.category ? <DropdownMenuLabel>{row.category}{isVisible("sottocategoria") && row.subcategory ? ` · ${row.subcategory}` : ""}</DropdownMenuLabel> : null}
                {isVisible("prezzo_acquisto") && supplier?.cost != null ? <DropdownMenuLabel>Prezzo acquisto: € {Number(supplier.cost).toFixed(2).replace(".", ",")}</DropdownMenuLabel> : null}
                {isVisible("scorta_minima") ? <DropdownMenuLabel>Scorta minima: {row.min_stock ?? "—"}</DropdownMenuLabel> : null}
                {isVisible("fabbisogno") ? <DropdownMenuLabel>Multiplo: {row.order_multiple ?? "—"}</DropdownMenuLabel> : null}
                {isVisible("ultimo_conteggio") && row.counted_at ? <DropdownMenuLabel>Ultimo conteggio: {dateTimeShort(row.counted_at)}</DropdownMenuLabel> : null}
                {isVisible("non_conforme") && row.non_compliant ? <DropdownMenuLabel>Non conforme</DropdownMenuLabel> : null}
                {isVisible("proposta") && proposalOpen ? <DropdownMenuLabel>Da proporre per acquisto</DropdownMenuLabel> : null}
              </> : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onHistory} disabled={!actionsEnabled}>
                <History className="size-3.5" /> Storico dei controlli
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenProduct}>
                <ExternalLink className="size-3.5" /> Apri prodotto → Inventario
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasDifference ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 w-7 px-0", row.note && "text-primary")}
              tabIndex={-1}
              aria-label={`Nota ${name}`}
              title="Vedi nota"
              onClick={() => setNoteOpen((open) => !open)}
            >
              <StickyNote className={cn("size-3.5", row.note && "fill-current")} />
            </Button>
          ) : null}
        </div>
      </div>
      {/* Stato della card su una riga propria: nella card stretta non ruba spazio al nome. */}
      <div className={rowLayout ? "hidden" : "mt-1.5 flex flex-wrap items-center gap-1"}>
        <span
          className={cn(
            "rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none",
            !isConfirmed && "bg-muted text-muted-foreground",
            isConfirmed && !hasDifference && "bg-success/15 text-success",
            hasDifference && "bg-destructive/10 text-destructive",
            needsRecount && "bg-primary/15 text-primary",
          )}
        >
          {previewStatus ?? status}
        </span>
        {isVisible("non_conforme") && row.non_compliant ? (
          <span className="rounded-sm bg-destructive/10 px-1.5 py-1 text-[9px] font-bold uppercase leading-none text-destructive">
            Non conforme
            {row.non_compliant_quantity === null
              ? ""
              : ` ${formatQuantity(Number(row.non_compliant_quantity), unit)}`}
          </span>
        ) : null}
        {isVisible("proposta") && proposalOpen ? (
          <span className="rounded-sm bg-primary/15 px-1.5 py-1 text-[9px] font-bold uppercase leading-none text-primary">
            Da proporre per acquisto
          </span>
        ) : null}
      </div>

      {/* Card stretta (< 340 px): «Conferma» va a capo a tutta larghezza invece di comprimersi o perdere il testo. */}
      <div className={rowLayout ? "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2" : "mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-1.5 @[340px]:grid-cols-[auto_minmax(110px,1fr)_auto_auto]"}>
        <div className={rowLayout ? "hidden" : undefined}>
          <p className="text-[9px] leading-none text-muted-foreground">Calcolata</p>
          <p className="mt-1 text-sm font-bold leading-none">
            {/* Giacenza non nota o da verificare: mai mostrata come 0. */}
            {calculated === null || (history && !history.hasCount) ? "—" : formatQuantity(calculated, row.stock_unit_code ?? "")}
          </p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] font-medium leading-none text-muted-foreground">Quantità fisica</p>
            {editable && allowedUnits.length ? (
              <Select value={chosenUnitId ?? ""} onValueChange={(id) => unitChoice.choose(rowKey(row), id)}>
                <SelectTrigger aria-label="Unità di misura inventario" className="h-6 w-24 px-1 text-[10px]"><SelectValue placeholder="U.M." /></SelectTrigger>
                <SelectContent>{allowedUnits.map((option) => <SelectItem key={option.id} value={option.id}>{option.code}</SelectItem>)}</SelectContent>
              </Select>
            ) : unit ? (
              <span className="text-[10px] font-semibold leading-none text-muted-foreground/90" aria-label="Unità di misura inventario">
                {unit}
              </span>
            ) : null}
          </div>
          <div className={rowLayout ? "mt-0.5 flex items-center gap-1" : "mt-1 flex items-center gap-1"}>
            <Input
              className={cn("min-w-0 flex-1 px-2 text-right text-base font-bold disabled:opacity-100", rowLayout ? "h-8" : "h-10")}
              type="text"
              inputMode="decimal"
              data-count-input="true"
              pattern="[0-9]*[.,]?[0-9]*"
              enterKeyHint="done"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={
                correctionTarget
                  ? correction.value
                  : cycleLocked && history?.physical != null
                    ? formatQuantity(history.physical, history.lastUnit ?? unit)
                    : value
              }
              disabled={!editable}
              title={locked ? (correctionTarget || !cycleLocked ? "Premi la matita per sbloccare" : "Completa prima il ciclo acquisti") : undefined}
              placeholder={isConfirmed ? formatQuantity(Number(row.counted), countedUnit) : ""}
              onChange={(event) => changeQuantity(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter" && editable) {
                  event.currentTarget.blur();
                  confirmQuantity();
                }
              }}
              aria-label={`Quantità fisica ${name}`}
            />
            {correctionTarget || (!cycleLocked && row.counted !== null) ? (
              <Button
                type="button"
                variant={!locked ? "secondary" : "outline"}
                size="sm"
                className={rowLayout ? "h-8 w-7 shrink-0 px-0" : "h-10 w-9 shrink-0 px-0"}
                aria-label={!locked ? `Blocca ${name}` : `Sblocca ${name}`}
                title={!locked ? "Blocca" : "Sblocca"}
                disabled={correction.pending || cardLock.pending}
                onClick={() => { if (correctionTarget) correction.toggle(); else cardLock.toggle(rowKey(row)); }}
              >
                {!locked ? <Lock className="size-4" /> : <Pencil className="size-4" />}
              </Button>
            ) : null}
          </div>
          {correcting && correction.needsReason ? (
            <div className="mt-1 space-y-1">
              <p className="text-[10px] font-semibold text-destructive">
                Risultavano {formatQuantity(history?.previousQuantity ?? 0, unit)} {unit}: indica il motivo.
              </p>
              <Input className="h-8 text-xs" placeholder="Motivo (es. merce scartata)" value={correction.reason}
                onChange={(e) => correction.setReason(e.target.value)} />
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[9px] leading-none text-muted-foreground">Differenza</p>
          <p
            className={cn(
              "mt-1 text-sm font-bold leading-none",
              difference !== null && difference < 0 && "text-destructive",
              difference !== null && difference > 0 && "text-success",
            )}
          >
            {difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference, row.stock_unit_code ?? "")}`}
          </p>
        </div>
        <Button className={rowLayout ? "h-8 shrink-0 px-2 text-[11px]" : "col-span-full h-10 w-full px-2 text-[11px] @[340px]:col-span-1 @[340px]:w-auto sm:px-3"} variant={isConfirmed ? "secondary" : "default"} onClick={confirmQuantity} disabled={!editable}>
          <Check className="size-4" />
          <span>Conferma</span>
        </Button>
      </div>

      <div className={rowLayout ? "hidden" : "mt-1.5 grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2"}>
        {[1, 3, 5, 10].map((increment) => (
          <Button
            key={increment}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 justify-center px-0 text-xs font-bold leading-none"
            tabIndex={-1}
            aria-label={`Aggiungi ${increment} a ${name}`}
            disabled={!editable}
            onClick={() => changeQuantity(addToQuantity(correcting ? correction.value : value, increment))}
          >
            +{increment}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-11 shrink-0 justify-center px-0"
          tabIndex={-1}
          aria-label={`Azzera quantità ${name}`}
          title="Azzera"
          disabled={!editable}
          onClick={() => changeQuantity("")}
        >
          <Delete className="size-4" />
        </Button>
      </div>
      {noteOpen && hasDifference ? (
        <div className="mt-1.5 space-y-1.5 rounded-sm border border-border bg-muted/30 p-1.5">
          <p className="text-[9px] font-bold uppercase leading-none text-muted-foreground">Nota differenza</p>
          <p className="text-xs leading-snug">{row.note?.trim() || "Nessuna nota registrata."}</p>
          {row.note?.trim() && confirmedDifference !== null ? (
            <AiAnalysisDemo name={name} unit={unit} difference={confirmedDifference} note={row.note.trim()} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CatalogProductCard({
  candidate,
  imageUrl,
  value,
  disabled,
  onChange,
  onConfirm,
  onToggleFavorite,
}: {
  candidate: CatalogCandidate;
  imageUrl: string | undefined;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onToggleFavorite: () => void;
}) {
  const name = candidate.description?.trim() || candidate.code;
  const unit = candidate.danea_um?.trim() ?? "";
  return (
    <article className="@container flex h-full flex-col rounded-md border-2 border-border bg-card p-2">
      <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="size-12 rounded-sm border border-border object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-sm border border-border bg-muted">
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold uppercase leading-tight">{name}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">Cod. {candidate.code}{unit ? ` · ${unit}` : ""}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {candidate.sellerCompanyName}{candidate.category ? ` · ${candidate.category}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm"
            className={cn("h-7 w-7 px-0", candidate.isFavorite && "text-primary")}
            aria-label={candidate.isFavorite ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
            title={candidate.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            onClick={onToggleFavorite} disabled={disabled}>
            <Star className={cn("size-3.5", candidate.isFavorite && "fill-current")} />
          </Button>
          <span className="rounded-sm bg-muted px-1.5 py-1 text-[9px] font-bold uppercase leading-none text-muted-foreground">
            Mai contato
          </span>
        </div>
      </div>
      {/* Card stretta (< 340 px): «Conferma» va a capo a tutta larghezza invece di comprimersi o perdere il testo. */}
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-1.5 @[340px]:grid-cols-[auto_minmax(110px,1fr)_auto_auto]">
        <div><p className="text-[9px] leading-none text-muted-foreground">Calcolata</p><p className="mt-1 text-sm font-bold leading-none">—</p></div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-[9px] font-medium leading-none text-muted-foreground">Quantità fisica</p>
            {unit ? <span className="text-[10px] font-semibold leading-none text-muted-foreground/90">{unit}</span> : null}
          </div>
          <Input className="mt-1 h-10 px-2 text-right text-base font-bold" inputMode="decimal" value={value}
            disabled={disabled} onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); onConfirm(); } }}
            aria-label={`Quantità fisica ${name}`} />
        </div>
        <div className="text-right"><p className="text-[9px] leading-none text-muted-foreground">Differenza</p><p className="mt-1 text-sm font-bold leading-none">—</p></div>
        <Button className="col-span-full h-10 w-full px-2 text-[11px] @[340px]:col-span-1 @[340px]:w-auto sm:px-3" onClick={onConfirm} disabled={disabled}>
          <Check className="size-4" /><span>Conferma</span>
        </Button>
      </div>
      <div className="mt-1.5 grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2">
        {[1, 3, 5, 10].map((increment) => (
          <Button key={increment} type="button" variant="outline" size="sm" className="h-8 px-0 text-xs font-bold"
            disabled={disabled} onClick={() => onChange(addToQuantity(value, increment))}>+{increment}</Button>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-8 w-11 px-0" disabled={disabled}
          onClick={() => onChange("")} aria-label={`Azzera quantità ${name}`}><Delete className="size-4" /></Button>
      </div>
    </article>
  );
}

function AiAnalysisDemo({
  name,
  unit,
  difference,
  note,
}: {
  name: string;
  unit: string;
  difference: number;
  note: string;
}) {
  return (
    <div className="rounded-sm border border-primary/30 bg-primary/5 p-1.5">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase leading-none text-primary">
        <Sparkles className="size-3" /> Analisi AI — DEMO
      </p>
      <p className="mt-1 text-[10px] leading-snug">
        <strong>Spiegazione:</strong> la differenza di {difference > 0 ? "+" : ""}
        {formatQuantity(difference, unit)} {unit} su {name} potrebbe essere collegata a: «{note}».
      </p>
      <p className="text-[10px] leading-snug">
        <strong>Azione proposta:</strong> verificare lo scarto indicato e, se corretto, registrare la causale appropriata.
      </p>
      <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
        Simulazione frontend: l'AI, quando verrà collegata, dovrà esclusivamente analizzare e proporre — non modificherà
        mai automaticamente quantità, inventario, movimenti o provenienze.
      </p>
    </div>
  );
}

function CompletionSummary({
  total,
  unchanged,
  differences,
  notComparable,
  isAdmin,
  closing,
  onShowDifferences,
  onClose,
}: {
  total: number;
  unchanged: number;
  differences: number;
  notComparable: number;
  isAdmin: boolean;
  closing: boolean;
  onShowDifferences: () => void;
  onClose: () => void;
}) {
  return (
    <section className="rounded-md border-2 border-success/50 bg-success/10 p-5 text-center sm:p-8">
      <CheckCheck className="mx-auto size-10 text-success" />
      <p className="mt-3 text-xs font-bold uppercase text-success">Inventario completato</p>
      <h3 className="mt-1 font-display text-2xl font-bold">{total} prodotti controllati</h3>
      <div className="mx-auto mt-5 grid max-w-lg grid-cols-3 divide-x divide-border">
        <p>
          <strong className="block text-2xl">{unchanged}</strong>
          <span className="text-sm text-muted-foreground">senza differenze</span>
        </p>
        <p>
          <strong className="block text-2xl text-destructive">{differences}</strong>
          <span className="text-sm text-muted-foreground">con differenze</span>
        </p>
        <p>
          <strong className="block text-2xl">{notComparable}</strong>
          <span className="text-sm text-muted-foreground">U.M. non confrontabili</span>
        </p>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Tutti gli articoli sono stati controllati. L'inventario resta in corso: puoi ricontare un articolo quando serve.
      </p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        <Button variant="outline" onClick={onShowDifferences}>
          <CircleAlert /> Vedi solo differenze
        </Button>
        {/* "Chiudi inventario" rimosso dal completamento: il 100% non chiude la sessione. */}
        {void onClose}
        {void isAdmin}
        {void closing}
      </div>
    </section>
  );
}

export { NO_CATEGORY, NO_SUBCATEGORY };

/** Semaforo del ciclo Inventario → Lista della Spesa → Ordini. */
function CycleLight({ cycle, sessionActive }: { cycle: CycleStatus | undefined; sessionActive: boolean }) {
  if (!cycle) return null;
  const color = sessionActive ? "giallo" : cycle.color;
  const config = {
    verde: { dot: "bg-success", label: "PRONTO PER INVENTARIO", text: cycle.cycle_outcome === "completato" ? "Ciclo acquisti completato: ordini e acquisti diretti gestiti." : "Nessun inventario in corso e nessun ciclo acquisti da completare." },
    arancione: {
      dot: "bg-warning",
      label: "PRONTO PER INVENTARIO — CICLO CHIUSO",
      text: `Ciclo chiuso con ${cycle.to_verify ?? 0} ${(cycle.to_verify ?? 0) === 1 ? "elemento" : "elementi"} da verificare.`,
    },
    giallo: { dot: "bg-primary", label: "INVENTARIO IN CORSO", text: "Continua il conteggio: le quantità scritte restano salvate finché non termini l'inventario." },
    rosso: {
      dot: "bg-destructive",
      label: "INVENTARIO COMPLETATO — ACQUISTI DA GESTIRE",
      text: cycle.cycle_outcome === "da_verificare"
        ? `Ciclo chiuso con ${cycle.to_verify ?? 0} elementi da verificare (quantità non determinabili con certezza).`
        : cycle.evaluated_at
        ? `Valutazione terminata: ${cycle.missing_orders ?? 0} acquisti ancora senza ordine.`
        : "Valuta nella Lista della Spesa cosa acquistare. Non si può iniziare un nuovo inventario finché il ciclo non è concluso.",
    },
  }[color];
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-1.5">
      <span className={`size-3 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide">{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.text}</p>
      </div>
      {color === "arancione" && cycle.list_id ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/acquisti/lista-spesa/stampa/$listId" params={{ listId: cycle.list_id }} search={{ tipo: "completa" } as never}>
            Visualizza
          </Link>
        </Button>
      ) : null}
      {color === "rosso" ? (
        <Button asChild size="sm">
          <Link to={cycle.evaluated_at ? "/acquisti/ordini" : "/acquisti/lista-spesa"}>
            {cycle.evaluated_at ? "Vai agli Ordini" : "Vai alla Lista della Spesa"}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
