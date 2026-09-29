import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CYCLE_QUERY_KEY } from "@/components/shopping/inventory-to-evaluate";
import { getInventoryCycleStatus, type CycleStatus } from "@/lib/inventory-cycle.functions";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  CheckCheck,
  CircleAlert,
  ClipboardCheck,
  Columns3,
  Delete,
  ExternalLink,
  History,
  MapPin,
  MoreVertical,
  Package,
  PackageSearch,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  StickyNote,
  TriangleAlert,
} from "lucide-react";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { getCatalogImageUrls } from "@/lib/catalog.functions";
import {
  adoptCatalogProduct,
  closeGeneralInventory,
  getCountHistory,
  getInventoryProgress,
  getInventoryRows,
  getFavoriteProductIds,
  getSupplierCatalogCandidates,
  manageCatalogProductFavorite,
  manageCompanyProductFavorite,
  managePurchaseProposal,
  recordCountEntry,
  startGeneralInventory,
  getProductCountUnits,
  manageCountDraft,
  type CatalogCandidate,
  type CountHistoryEntry,
  type InventoryCountRow,
  type InventoryProgress,
  type ProductCountUnit,
} from "@/lib/inventory-count.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { cn } from "@/lib/utils";
import { CorrectCountDialog, type CountCorrectionTarget } from "@/components/inventory/correct-count-dialog";
import { PhysicalQuickEdit, type PhysicalEdit } from "@/components/inventory/physical-quick-edit";
import { InventorySessionCounter } from "@/components/inventory/inventory-session-counter";
import type { SessionRow } from "@/lib/inventory";

type ProductView = "favorites" | "all";
type WorkFilter = "all" | "pending" | "completed" | "differences" | "not_comparable" | "recount";
type SupplierInfo = { name: string | null; cost: number | null };
type FieldPreferences = ReturnType<typeof useInventoryFieldPreferences>;

const ENTRY_LABELS: Record<string, string> = {
  conteggio: "Primo conteggio",
  riconteggio: "Riconteggio",
  segnalazione: "Segnalato non conforme",
  revoca_segnalazione: "Segnalazione revocata",
  richiesta_riconteggio: "Segnato da ricontare",
};


const NO_CATEGORY = "Senza categoria";
const NO_SUBCATEGORY = "Senza sottocategoria";

function parseQuantity(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

function rowKey(row: { product_id: string; location_id: string }) {
  return `${row.product_id}:${row.location_id}`;
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


function rowUnit(row: InventoryCountRow) {
  return row.danea_um?.trim() || "";
}

/** Confronto U.M. senza conversioni: vuoto = U.M. base (compatibilità storica). */
function sameUnit(left: string | null | undefined, right: string | null | undefined) {
  const a = left?.trim().toLowerCase() ?? "";
  const b = right?.trim().toLowerCase() ?? "";
  return !a || !b || a === b;
}

type CountUnitsContextValue = {
  options: (row: InventoryCountRow) => ProductCountUnit[];
  selected: (row: InventoryCountRow) => string;
  setSelected: (row: InventoryCountRow, code: string) => void;
};

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

const CountUnitsContext = createContext<CountUnitsContextValue>({
  options: () => [],
  selected: (row) => rowUnit(row),
  setSelected: () => undefined,
});

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
  const readHistory = useServerFn(getCountHistory);
  const manageProposal = useServerFn(managePurchaseProposal);
  const toggleFavorite = useServerFn(manageCompanyProductFavorite);
  const toggleCatalogFavorite = useServerFn(manageCatalogProductFavorite);
  const getImageUrls = useServerFn(getProductImageUrls);
  const getSellerImageUrls = useServerFn(getCatalogImageUrls);
  const readCatalogCandidates = useServerFn(getSupplierCatalogCandidates);
  const readFavoriteProductIds = useServerFn(getFavoriteProductIds);
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
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [emptyRows, setEmptyRows] = useState<InventoryCountRow[] | null>(null);
  const readCountUnits = useServerFn(getProductCountUnits);
  const [pending, setPending] = useState<{ row: InventoryCountRow; value: number } | null>(null);
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

  // Ultimo inventario generale chiuso: solo lettura, distinto dall'inventario in corso.
  const lastClosedQuery = useQuery({
    queryKey: ["inventory-last-closed", companyId, archiveId],
    enabled: Boolean(archiveId) && !sessionId && !sessionQuery.isLoading,
    queryFn: async (): Promise<{ session: SessionRow; counted: number } | null> => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("id, name, scope, location_id, status, archive_id, started_at, finished_at, notes")
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
      return { session: data as SessionRow, counted: new Set((counts ?? []).map((row) => row.product_id)).size };
    },
  });

  // Bozze salvate: quantità (e U.M.) scritte ma non confermate. Una bozza NON è un conteggio.
  const draftFn = useServerFn(manageCountDraft);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const unitDraftsRef = useRef(unitDrafts);
  unitDraftsRef.current = unitDrafts;
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [savedDraftKeys, setSavedDraftKeys] = useState<Set<string>>(new Set());
  const [clearDraftsOpen, setClearDraftsOpen] = useState(false);
  const savedDraftsQuery = useQuery({
    queryKey: ["inventory-count-drafts", sessionId],
    enabled: Boolean(sessionId),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_count_drafts")
        .select("product_id, location_id, quantity, unit_code")
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
        const key = rowKey(d);
        if (!draftTimers.current[key]) next[key] = d.quantity;
      }
      return next;
    });
    setUnitDrafts((current) => {
      const next = { ...current };
      for (const d of list) {
        const key = rowKey(d);
        if (d.unit_code && !draftTimers.current[key]) next[key] = d.unit_code;
      }
      return next;
    });
    setSavedDraftKeys(new Set(list.map((d) => rowKey(d))));
  }, [savedDraftsQuery.data]);

  // Salva subito le bozze in sospeso quando si esce dalla pagina o la finestra va in background.
  const flushRef = useRef<() => void>(() => undefined);
  flushRef.current = () => {
    if (!sessionId) return;
    for (const key of Object.keys(draftTimers.current)) {
      clearTimeout(draftTimers.current[key]);
      delete draftTimers.current[key];
      const [productId, locationId] = key.split(":");
      if (!productId || !locationId) continue;
      const value = (draftsRef.current[key] ?? "").trim();
      const unitCode = unitDraftsRef.current[key] ?? null;
      void draftFn({
        data: value === ""
          ? { action: "clear_one", sessionId, productId, locationId, quantity: null, unitCode: null }
          : { action: "set", sessionId, productId, locationId, quantity: value, unitCode },
      }).catch(() => undefined);
    }
  };
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
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
  useEffect(() => {
    if (!sessionId || !autoStartPending) return;
    setAutoStartPending(false);
    const pending = Object.entries(draftFirst);
    if (!pending.length) return;
    setDrafts((current) => ({ ...current, ...draftFirst }));
    setDraftFirst({});
    for (const [key, value] of pending) scheduleDraftSave(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, autoStartPending]);

  function scheduleDraftSave(key: string, raw: string, unit?: string | null) {
    if (!sessionId) return;
    const [productId, locationId] = key.split(":");
    if (!productId || !locationId) return;
    if (draftTimers.current[key]) clearTimeout(draftTimers.current[key]);
    setSavedDraftKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    draftTimers.current[key] = setTimeout(() => {
      delete draftTimers.current[key];
      const value = raw.trim();
      const unitCode = unit ?? unitDraftsRef.current[key] ?? null;
      void draftFn({
        data: value === ""
          ? { action: "clear_one", sessionId, productId, locationId, quantity: null, unitCode: null }
          : { action: "set", sessionId, productId, locationId, quantity: value, unitCode },
      })
        .then(() => {
          if (value !== "" && draftsRef.current[key]?.trim() === value) {
            setSavedDraftKeys((current) => new Set(current).add(key));
          }
        })
        .catch((error: Error) => toast.error(`Bozza non salvata: ${error.message}`));
    }, 1000);
  }

  function clearDraftOnServer(key: string) {
    if (!sessionId) return;
    const [productId, locationId] = key.split(":");
    if (!productId || !locationId) return;
    if (draftTimers.current[key]) {
      clearTimeout(draftTimers.current[key]);
      delete draftTimers.current[key];
    }
    setSavedDraftKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    void draftFn({ data: { action: "clear_one", sessionId, productId, locationId, quantity: null, unitCode: null } })
      .catch(() => undefined);
  }

  const clearAllDrafts = useMutation({
    mutationFn: async () => {
      Object.values(draftTimers.current).forEach(clearTimeout);
      draftTimers.current = {};
      if (sessionId) {
        await draftFn({ data: { action: "clear_all", sessionId, productId: null, locationId: null, quantity: null, unitCode: null } });
      }
    },
    onSuccess: async () => {
      setDrafts({});
      setUnitDrafts({});
      setDraftFirst({});
      setSavedDraftKeys(new Set());
      setClearDraftsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["inventory-count-drafts", sessionId] });
      toast.success("Quantità non confermate azzerate");
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
        .select("id, code, description, category, subcategory, danea_um")
        .eq("company_id", companyId)
        .eq("is_managed", true)
        .order("code")
        .limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const catalogPreview = catalogPreviewQuery.data ?? [];
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
        if (productView === "favorites" && !previewFavoriteQuery.data?.has(product.id)) return false;
        if (category && (product.category ?? NO_CATEGORY) !== category) return false;
        if (subcategory && (product.subcategory ?? NO_SUBCATEGORY) !== subcategory) return false;
        return !term || `${product.code} ${product.description ?? ""}`.toLowerCase().includes(term);
      })
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));
  }, [catalogPreview, category, previewFavoriteQuery.data, productView, search, subcategory]);
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
    enabled: !sessionId && !sessionQuery.isLoading && Boolean(archiveId) && Boolean(historyLocationId),
    queryFn: async (): Promise<Map<string, StockHistory>> => {
      const [stockResult, countsResult] = await Promise.all([
        supabase.rpc("inventory_location_stock_list", {
          _company_id: companyId,
          _archive_id: archiveId!,
          _location_id: historyLocationId!,
        }),
        supabase
          .from("inventory_counts")
          .select("id, session_id, product_id, counted_quantity, previous_quantity, notes, unit_code, counted_at, inventory_sessions!inner(status)")
          .eq("company_id", companyId)
          .eq("location_id", historyLocationId!)
          .eq("inventory_sessions.status", "completata")
          .order("counted_at", { ascending: false })
          .limit(5000),
      ]);
      if (stockResult.error) throw new Error(stockResult.error.message);
      if (countsResult.error) throw new Error(countsResult.error.message);
      const units = new Map(catalogPreview.map((product) => [product.id, product.danea_um]));
      const last = new Map<string, { quantity: number; unit: string | null; at: string; id: string; sessionId: string; previous: number | null; note: string | null }>();
      for (const count of (countsResult.data ?? []) as { id: string; session_id: string; product_id: string; counted_quantity: number; previous_quantity: number | null; notes: string | null; unit_code: string | null; counted_at: string }[]) {
        if (last.has(count.product_id)) continue;
        const productUnit = (units.get(count.product_id) ?? "").trim().toLowerCase();
        const countUnit = (count.unit_code ?? "").trim().toLowerCase();
        // Stesso criterio della giacenza: vale solo il conteggio nella U.M. del prodotto.
        if (countUnit && productUnit && countUnit !== productUnit) continue;
        last.set(count.product_id, { quantity: Number(count.counted_quantity), unit: count.unit_code, at: count.counted_at, id: count.id, sessionId: count.session_id, previous: count.previous_quantity === null ? null : Number(count.previous_quantity), note: count.notes });
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


  const previewImagesQuery = useQuery({
    queryKey: ["inventario-prodotti-immagini", companyId, catalogPreview.length],
    enabled: !sessionId && catalogPreview.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: () =>
      getImageUrls({ data: { productIds: catalogPreview.slice(0, 50).map((p) => p.id), thumbnail: true } }),
  });
  const previewImages = useMemo(
    () => new Map((previewImagesQuery.data ?? []).map((image) => [image.productId, image.url])),
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
        if (productView === "favorites" && !candidate.isFavorite) return false;
        if (supplierFilter && candidate.sellerCompanyName !== supplierFilter) return false;
        if (category && (candidate.category ?? NO_CATEGORY) !== category) return false;
        if (subcategory && (candidate.subcategory ?? NO_SUBCATEGORY) !== subcategory) return false;
        if (workFilter !== "pending" && workFilter !== "all") return false;
        return !term || `${candidate.code} ${candidate.description ?? ""}`.toLowerCase().includes(term);
      })
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));

  }, [catalogCandidates, category, productView, search, subcategory, supplierFilter, workFilter]);

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
    () => new Map((catalogImagesQuery.data ?? []).map((image) => [image.productId, image.url])),
    [catalogImagesQuery.data],
  );




  const progressQuery = useQuery({
    queryKey: ["inventory-progress", sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => readProgress({ data: { sessionId: sessionId! } }),
  });
  const progress: InventoryProgress | undefined = progressQuery.data;

  const searching = search.trim().length > 0;
  const rowsQuery = useQuery({
    queryKey: [
      "inventory-rows",
      sessionId,
      searching ? null : selectedLocationId,
      searching ? null : category,
      searching ? null : subcategory,
      searching ? search.trim() : null,
      productView,
    ],
    enabled: Boolean(sessionId),
    queryFn: () =>
      readRows({
        data: {
          sessionId: sessionId!,
          locationId: searching ? null : selectedLocationId,
          category: searching ? null : category,
          subcategory: searching ? null : subcategory,
          search: searching ? search.trim() : null,
          favoritesOnly: productView === "favorites",
        },
      }),
  });

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

  const rows = useMemo(() => {
    const all = rowsQuery.data ?? [];
    return all
      .filter((row) => {
        // Stessa popolazione del Fabbisogno: solo prodotti gestiti dall'azienda.
        if (managedProductIds.size && !managedProductIds.has(row.product_id)) return false;
        if (workFilter === "all") return true;
        if (workFilter === "pending") return row.counted === null;
        if (workFilter === "recount") return row.recount_requested_at !== null;
        if (workFilter === "completed") return row.counted !== null;
        if (workFilter === "not_comparable") return row.counted !== null && row.units_comparable === false;
        // Differenze reali: solo differenze numeriche calcolabili (stessa U.M.) e diverse da zero.
        return row.counted !== null && row.units_comparable !== false && row.difference !== null && Number(row.difference) !== 0;
      })
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));
  }, [managedProductIds, rowsQuery.data, workFilter]);


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
    () => new Map((imagesQuery.data ?? []).map((image) => [image.productId, image.url])),
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

  // U.M. ammissibili per il conteggio: solo quelle gia configurate sul prodotto.
  const countUnitProductIds = useMemo(
    () => (sessionId ? visibleProductIds : previewProducts.map((product) => product.id)),
    [sessionId, visibleProductIds, previewProducts],
  );
  const countUnitsQuery = useQuery({
    queryKey: ["inventario-um-conteggio", companyId, countUnitProductIds],
    enabled: countUnitProductIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => readCountUnits({ data: { companyId, productIds: countUnitProductIds } }),
  });
  const countUnitsByProduct = useMemo(() => {
    const map = new Map<string, ProductCountUnit[]>();
    for (const unit of countUnitsQuery.data ?? []) {
      const list = map.get(unit.product_id) ?? [];
      list.push(unit);
      map.set(unit.product_id, list);
    }
    return map;
  }, [countUnitsQuery.data]);
  const countUnitsValue = useMemo<CountUnitsContextValue>(() => {
    const options = (row: InventoryCountRow): ProductCountUnit[] => {
      const list = [...(countUnitsByProduct.get(row.product_id) ?? [])];
      const base = rowUnit(row);
      if (base && !list.some((unit) => sameUnit(unit.unit_code, base))) {
        list.unshift({ product_id: row.product_id, unit_code: base, unit_label: base, is_base: true, sources: ["base"], conversion_factor: null, conversion_reference_um: null });
      }
      const recorded = row.counted_unit_code?.trim();
      if (recorded && !list.some((unit) => sameUnit(unit.unit_code, recorded))) {
        list.push({ product_id: row.product_id, unit_code: recorded, unit_label: recorded, is_base: false, sources: ["conteggio"], conversion_factor: null, conversion_reference_um: null });
      }
      return list;
    };
    const selected = (row: InventoryCountRow) => {
      const draft = unitDrafts[rowKey(row)];
      if (draft) return draft;
      const recorded = row.counted_unit_code?.trim();
      if (row.counted !== null && recorded) {
        return options(row).find((unit) => sameUnit(unit.unit_code, recorded))?.unit_code ?? recorded;
      }
      const base = rowUnit(row);
      return options(row).find((unit) => sameUnit(unit.unit_code, base))?.unit_code ?? base;
    };
    return {
      options,
      selected,
      setSelected: (row, code) => {
        setUnitDrafts((current) => ({ ...current, [rowKey(row)]: code }));
        const raw = draftsRef.current[rowKey(row)];
        if (raw !== undefined && raw.trim() !== "") scheduleDraftSave(rowKey(row), raw, code);
      },
    };
  }, [countUnitsByProduct, unitDrafts]);



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
    onSuccess: async (locationId) => {
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
    mutationFn: (input: { row: InventoryCountRow; value: number; unit: string; notes: string | null }) =>
      saveEntry({
        data: {
          companyId,
          sessionId: sessionId!,
          productId: input.row.product_id,
          locationId: input.row.location_id,
          entryType: input.row.counted !== null ? "riconteggio" : "conteggio",
          countedQuantity: input.value,
          unitCode: input.unit || null,
          notes: input.notes,
          nonCompliant: null,
          nonCompliantQuantity: null,
        },
      }),
    onSuccess: async (_result, input) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[rowKey(input.row)];
        return next;
      });
      setUnitDrafts((current) => {
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
    mutationFn: () => close({ data: { companyId, sessionId: sessionId! } }),
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
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const catalogFavoriteMutation = useMutation({
    mutationFn: (candidate: CatalogCandidate) => toggleCatalogFavorite({ data: {
      companyId,
      sellerCompanyId: candidate.sellerCompanyId,
      sellerProductId: candidate.sellerProductId,
      favorite: !candidate.isFavorite,
    } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventario-catalogo-candidati", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti-tutti"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmRow = (row: InventoryCountRow) => {
    const value = parseQuantity(drafts[rowKey(row)] ?? "");
    if (value === null) {
      toast.error("Inserisci una quantità valida");
      return;
    }
    const unit = countUnitsValue.selected(row);
    // U.M. diversa dalla base: nessun confronto numerico con la giacenza calcolata.
    if (sameUnit(unit, rowUnit(row)) && value !== Number(row.calculated)) {
      setPending({ row, value });
      setPendingReason(row.note ?? "");
      return;
    }
    countMutation.mutate({ row, value, unit, notes: null });
  };

  const savePendingDifference = () => {
    if (!pending) return;
    countMutation.mutate({
      row: pending.row,
      value: pending.value,
      unit: countUnitsValue.selected(pending.row),
      notes: pendingReason.trim(),
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
    const all = (productView === "favorites" ? favoriteRowsQuery.data : allRowsQuery.data) ?? rows;
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
      const unit = countUnitsValue.selected(row);
      if (sameUnit(unit, rowUnit(row)) && typed !== Number(row.calculated)) {
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
    noteQueue.current = { rows: needNote, goToList: mode === "enteredOnly", showConfirmed: mode === "soldOut" };
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
      const unit = countUnitsValue.selected(row);
      if (sameUnit(unit, rowUnit(row)) && typed !== Number(row.calculated)) {
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
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="conteggio">Conteggio</TabsTrigger>
          <TabsTrigger value="fabbisogno">Fabbisogno</TabsTrigger>
          <TabsTrigger value="zone">Zone</TabsTrigger>
        </TabsList>
        {!sessionId ? (
          <Button
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

      <CycleLight cycle={cycleQuery.data} sessionActive={Boolean(sessionId)} />
      {!sessionId && cycleColor === "rosso" && isAdmin ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant={unlockedAll ? "secondary" : "outline"} onClick={() => setUnlockedAll((v) => !v)}>
            {unlockedAll ? "Blocca quantità" : "Sblocca quantità"}
          </Button>
        </div>
      ) : null}
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
                productId: row.product_id, locationId: historyLocationId, countId: history.lastCountId,
                code: row.code ?? "", name: rowName(row), unit: history.lastUnit ?? rowUnit(row) ?? "",
                countedQuantity: history.lastQuantity, countedAt: history.lastAt,
              });
            },
          }}>
          <CountUnitsContext.Provider value={countUnitsValue}>
          <PhysicalCount
            companyId={companyId}
            sessionActive={Boolean(sessionId)}
            sessionName={progress?.session_name ?? sessionQuery.data?.name ?? "Inventario generale"}
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
              image_path: null, thumbnail_path: null, calculated: stockHistoryQuery.data?.get(product.id)?.stock ?? 0, counted: null, difference: null,
              counted_at: null, counted_by: null, note: null, recount_requested_at: null, non_compliant: false,
              non_compliant_quantity: null, non_compliant_note: null, proposal_status: null, proposal_flagged_at: null,
              min_stock: null, order_multiple: null, counted_unit_code: null, units_comparable: null,
            }))}
            catalogCandidates={[]}
            excludedCatalogCount={visibleCatalogCandidates.length}
            catalogImages={catalogImages}
            catalogDrafts={catalogDrafts}
            loading={sessionId ? rowsQuery.isLoading : catalogPreviewQuery.isLoading}
            imageUrls={sessionId ? imageUrls : previewImages}
            drafts={sessionId ? drafts : draftFirst}
            productView={productView}
            workFilter={workFilter}
            category={category}
            subcategory={subcategory}
            supplierFilter={supplierFilter}
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
                confirmRow(row);
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
              firstCount.mutate({ productId: row.product_id, locationId: draftLocation.id, unit: countUnitsValue.selected(row), value });
            }}
            onConfirmAll={() => void confirmInventory()}
            onClearDrafts={() => setClearDraftsOpen(true)}
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
            onCloseInventory={() => closeMutation.mutate()}
            stockHistory={sessionId ? null : (stockHistoryQuery.data ?? null)}
            lastClosed={lastClosedQuery.data ? { name: lastClosedQuery.data.session.name, counted: lastClosedQuery.data.counted, total: lastClosedQuery.data.counted } : null}
            onViewLastClosed={() => setViewClosedOpen(true)}

            onHideCompletion={() => setShowCompletion(false)}
            closing={closeMutation.isPending}
          />
          </CountUnitsContext.Provider>
          </CycleLockContext.Provider>
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
              unit: row.danea_um?.trim() || "",
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
                const difference = pending.value - Number(pending.row.calculated);
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
                        <strong className="block text-sm">{formatQuantity(pending.value, unit)}</strong>fisica
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
                      <p className="text-xs font-semibold">Motivazione della differenza</p>
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
                      <Button disabled={!pendingReason.trim() || countMutation.isPending} onClick={savePendingDifference}>
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
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmedOpen} onOpenChange={setConfirmedOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Inventario confermato</DialogTitle>
            <DialogDescription>Tutti gli articoli sono stati controllati.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              className="h-auto w-full whitespace-normal py-2"
              disabled={closeMutation.isPending}
              onClick={async () => {
                // Chiude con la funzione esistente: solo se riesce i conteggi diventano giacenza e si apre la Lista.
                try {
                  await closeMutation.mutateAsync();
                } catch {
                  return;
                }
                setConfirmedOpen(false);
                await queryClient.invalidateQueries({ queryKey: [CYCLE_QUERY_KEY, companyId] });
                void navigate({ to: "/acquisti/lista-spesa" });
              }}
            >
              {closeMutation.isPending ? "Chiusura in corso…" : "Termina inventario e vai alla Lista della Spesa"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setConfirmedOpen(false)}>
              Resta nel Conteggio
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewClosedOpen} onOpenChange={setViewClosedOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1600px] overflow-y-auto sm:max-w-[1600px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-base">{lastClosedQuery.data?.session.name ?? "Ultimo inventario"}</DialogTitle>
            <DialogDescription>
              Le quantità confermate sono visibili qui sotto. Usa “Modifica giacenza” per registrare una rettifica tracciata senza cambiare il conteggio originale.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Inventario chiuso — sola lettura
          </p>
          {lastClosedQuery.data ? (
            <InventorySessionCounter
              companyId={companyId}
              session={lastClosedQuery.data.session}
              locations={locations}
              onCorrectCount={(count, product) => {
                setCorrection({
                  productId: product.id,
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

      <Dialog open={clearDraftsOpen} onOpenChange={setClearDraftsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Azzerare le quantità?</DialogTitle>
            <DialogDescription>
              Cancello tutte le quantità scritte e non ancora confermate. I conteggi già confermati e lo storico restano invariati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setClearDraftsOpen(false)}>Annulla</Button>
            <Button variant="destructive" disabled={clearAllDrafts.isPending} onClick={() => clearAllDrafts.mutate()}>
              Azzera quantità
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
  onCloseInventory,
  lastClosed,
  onViewLastClosed,
  stockHistory,

  onHideCompletion,
  closing,
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
  onCloseInventory: () => void;
  lastClosed: { name: string; counted: number; total: number } | null;
  onViewLastClosed: () => void;
  stockHistory: Map<string, StockHistory> | null;
  onHideCompletion: () => void;
  closing: boolean;
}) {
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
        ...rows.map((row) => row.category ?? NO_CATEGORY),
        ...catalogCandidates.map((item) => item.category ?? NO_CATEGORY),
      ])].sort().map((name) => ({ name, completed: 0, total: 0 }));
  const subcategories = progress?.subcategories?.length
    ? progress.subcategories.filter((item) => !category || item.category === category)
    : [...new Set([
        ...rows.filter((row) => !category || (row.category ?? NO_CATEGORY) === category)
          .map((row) => row.subcategory ?? NO_SUBCATEGORY),
        ...catalogCandidates.filter((item) => !category || (item.category ?? NO_CATEGORY) === category)
          .map((item) => item.subcategory ?? NO_SUBCATEGORY),
      ])].sort().map((name) => ({ name, category: category ?? "", completed: 0, total: 0 }));
  const visibleRows = supplierFilter
    ? rows.filter((row) => supplierInfo.get(row.product_id)?.name === supplierFilter)
    : rows;

  // Barra compatta (ricerca + filtri) mostrata solo quando la ricerca originale esce dallo schermo.
  const cycleLock = useContext(CycleLockContext);
  const topFiltersRef = useRef<HTMLDivElement>(null);
  const [compactBar, setCompactBar] = useState(false);
  useEffect(() => {
    const el = topFiltersRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setCompactBar(!entry.isIntersecting && entry.boundingClientRect.top < 120);
    }, { rootMargin: "-120px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="space-y-2">
      <div
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
        {!sessionActive && lastClosed ? (
          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <div className="min-w-0 text-xs leading-tight">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Ultimo inventario (chiuso)</p>
              <p className="truncate font-medium">{lastClosed.name}</p>
              <p className="text-muted-foreground">{lastClosed.counted} / {lastClosed.total} prodotti controllati</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={onViewLastClosed}>
              Visualizza inventario
            </Button>
          </div>
        ) : null}
        {sessionActive ? (
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
          </>
        ) : null}
        {compactBar && (
          <div className="mt-2 space-y-1.5 border-t border-border pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-9 text-sm" value={search} onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Cerca prodotto o codice" aria-label="Ricerca prodotto (barra fissa)" />
            </div>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
              <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" variant={productView === "favorites" ? "default" : "outline"} onClick={() => onViewChange("favorites")}>
                <Star className="size-3" /> Preferiti
              </Button>
              <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" variant={productView === "all" ? "default" : "outline"} onClick={() => onViewChange("all")}>
                Tutti
              </Button>
              <span className="mx-0.5 w-px shrink-0 bg-border" />
              {([
                ["all", "Tutti gli stati"],
                ["pending", "Da controllare"],
                ["completed", "Confermati"],
                ["differences", "Differenze"],
                ["not_comparable", "U.M. diverse"],
                ["recount", "Da ricontare"],
              ] as const).map(([value, label]) => (
                <Button key={value} size="sm" className="h-7 shrink-0 px-2 text-[11px]" variant={workFilter === value ? "default" : "outline"} onClick={() => onWorkFilterChange(value)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={topFiltersRef} className="relative rounded-md border border-border bg-card p-2">
        <Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 pl-9 text-sm" value={search} onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Cerca prodotto o codice" aria-label="Ricerca prodotto" />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2 [&>div:first-child]:basis-full">
            <div className="min-w-0">
              <p className="font-display font-semibold">{scope}</p>
              <p className="text-xs text-muted-foreground">
                Selezione corrente:{" "}
                <strong>
                  {scopeProgress?.completed ?? 0} / {scopeProgress?.total ?? visibleRows.length}
                </strong>{" "}
                completati
              </p>
              <p className="text-[11px] text-muted-foreground">
                Confermati <strong>{unchanged}</strong> · Differenze reali{" "}
                <strong className="text-destructive">{generalDifferences}</strong> · U.M. non confrontabili{" "}
                <strong>{notComparable}</strong> · Mancanti <strong>{progress?.pending ?? 0}</strong>
              </p>
            </div>
            <div className="grid grid-cols-2 rounded-md border border-border p-0.5">
              <Button
                size="sm"
                className="h-8 text-xs"
                variant={productView === "favorites" ? "default" : "ghost"}
                onClick={() => onViewChange("favorites")}
              >
                <Star className="size-3.5" /> Preferiti
              </Button>
              <Button size="sm" className="h-8 text-xs" variant={productView === "all" ? "default" : "ghost"} onClick={() => onViewChange("all")}>
                Tutti
              </Button>
            </div>
            <Button size="sm" variant="destructive" className="h-9 text-xs" onClick={onClearDrafts}>
              Azzera quantità
            </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "all" ? "default" : "outline"} onClick={() => onWorkFilterChange("all")}>
                Tutti gli stati
              </Button>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-6">
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "pending" ? "default" : "outline"} onClick={() => onWorkFilterChange("pending")}>
                Da controllare
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "completed" ? "default" : "outline"} onClick={() => onWorkFilterChange("completed")}>
                Confermati
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "differences" ? "default" : "outline"} onClick={() => onWorkFilterChange("differences")}>
                Differenze
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "not_comparable" ? "default" : "outline"} onClick={() => onWorkFilterChange("not_comparable")}>
                U.M. diverse
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "recount" ? "default" : "outline"} onClick={() => onWorkFilterChange("recount")}>
                Da ricontare
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-[11px]">
                  <SlidersHorizontal className="size-3.5" /> Filtri
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">Zona</DropdownMenuLabel>
                <DropdownMenuItem onClick={onAllZones}>Tutte le zone</DropdownMenuItem>
                {locationOptions.map((location) => (
                  <DropdownMenuItem key={location.id} onClick={() => onLocationChange(location.id)}>
                    {location.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Fornitore</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onSupplierChange(null)}>Tutti i fornitori</DropdownMenuItem>
                {[...new Set([
                  ...catalogCandidates.map((item) => item.sellerCompanyName),
                  ...[...supplierInfo.values()].flatMap((item) => item.name ? [item.name] : []),
                ])].sort().map((name) => (
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
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Stato conteggio</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onWorkFilterChange("all")}>Tutti gli stati</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("pending")}>Da controllare</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("completed")}>Confermati</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("differences")}>Differenze</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("not_comparable")}>U.M. diverse</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("recount")}>Da ricontare</DropdownMenuItem>
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
            <p className="text-[10px] text-muted-foreground">
              Costo e unità di misura della giacenza sono in sola lettura: si gestiscono nella scheda prodotto.
              {excludedCatalogCount
                ? ` ${excludedCatalogCount} articoli dei cataloghi dei fornitori non sono inclusi: entrano qui solo quando diventano prodotti tuoi.`
                : ""}
            </p>
          </div>

          {visibleRows.length || catalogCandidates.length ? (
            <div className="grid auto-rows-fr items-stretch gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">
              {[
                ...visibleRows.map((row) => ({
                  key: rowKey(row),
                  description: row.description,
                  code: row.code,
                  node: (
                    <ProductCard
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
                      history={stockHistory ? (stockHistory.get(row.product_id) ?? null) : null}
                    />
                  ),
                })),
                ...catalogCandidates.map((candidate) => ({
                  key: `catalogo-${candidate.sellerProductId}`,
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
                .sort((left, right) => byName(left.description, left.code, right.description, right.code))
                .map((item) => (
                  <div key={item.key} className="flex h-full min-w-0 flex-col">
                    {item.node}
                  </div>
                ))}
            </div>
          ) : null}


          {!visibleRows.length && !catalogCandidates.length ? (
            <div className="p-8 text-center">
              <PackageSearch className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">{loading ? "Caricamento…" : "Nessun prodotto in questa vista"}</p>
              <p className="text-xs text-muted-foreground">Cambia filtro o selezione per continuare.</p>
            </div>
          ) : null}

          <div className="grid gap-2 border-t border-border p-2 sm:flex sm:items-center sm:justify-end">
            {savedDraftCount ? (
              <span className="text-[11px] text-muted-foreground sm:mr-auto">
                Bozza salvata · {savedDraftCount} {savedDraftCount === 1 ? "quantità non confermata" : "quantità non confermate"}
              </span>
            ) : null}
            <Button size="sm" variant="outline" onClick={onConfirmAll}>
              <CheckCheck /> Conferma inventario
            </Button>
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
  history,
}: {
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
  history?: StockHistory | null;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const unitsCtx = useContext(CountUnitsContext);
  const cycleLock = useContext(CycleLockContext);
  const locked = cycleLock.locked && Boolean(history);
  const canCorrect =
    locked && isAdmin && Boolean(history?.lastCountId) && history?.lastSessionId === cycleLock.cycleSessionId;
  const unit = rowUnit(row);
  const name = rowName(row);
  const calculated = Number(row.calculated);
  const counted = parseQuantity(value);
  const isConfirmed = row.counted !== null;
  const countedUnit = row.counted_unit_code?.trim() || unit;
  const selectedUnit = unitsCtx.selected(row);
  const unitOptions = unitsCtx.options(row);
  // Nessuna operazione matematica fra U.M. diverse: la differenza esiste solo a parità di U.M.
  const effectiveUnit = counted !== null ? selectedUnit : isConfirmed ? countedUnit : selectedUnit;
  const comparable = sameUnit(effectiveUnit, unit);
  const conversion = unitOptions.find((option) => sameUnit(option.unit_code, effectiveUnit));
  const conversionHint =
    conversion && !conversion.is_base && conversion.conversion_factor
      ? `1 ${conversion.unit_code} ≈ ${formatQuantity(Number(conversion.conversion_factor), conversion.conversion_reference_um ?? unit)} ${conversion.conversion_reference_um ?? unit}`
      : null;
  const confirmedDifference = isConfirmed && row.units_comparable !== false ? Number(row.difference ?? 0) : null;
  const hasDifference = isConfirmed && confirmedDifference !== null && confirmedDifference !== 0;
  const difference = !comparable || (history && !history.hasCount)
    ? null
    : counted === null
      ? (isConfirmed ? confirmedDifference : null)
      : counted - calculated;
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
  const previewStatus =
    history && !isConfirmed && !needsRecount ? (history.hasCount ? "Contato in precedenza" : "Mai contato") : null;

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-md border-2 bg-card p-2",
        !isConfirmed && "border-border",
        isConfirmed && !hasDifference && "border-success/50 bg-success/5",
        hasDifference && "border-destructive/50 bg-destructive/5",
        needsRecount && "border-primary/60 bg-primary/5",
      )}
    >
      <div className="grid grid-cols-[48px_minmax(0,1fr)_fit-content(45%)] items-center gap-2">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="size-12 rounded-sm border border-border object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-sm border border-border bg-muted">
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold uppercase leading-tight">{name}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Cod. {row.code}
            {unit ? ` · ${unit}` : ""}
            {isVisible("zona") ? ` · ${row.location_name}` : ""}
          </p>
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
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
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
            >
              <Star className={cn("size-3.5", row.is_favorite && "fill-current")} />
            </Button>
          ) : null}
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onHistory} disabled={!actionsEnabled}>
                <History className="size-3.5" /> Storico dei controlli
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/acquisti/prodotti" search={{ prodotto: row.product_id }}>
                  <ExternalLink className="size-3.5" /> Apri prodotto → Acquisto
                </Link>
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
      {(isVisible("non_conforme") && row.non_compliant) || (isVisible("proposta") && proposalOpen) ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
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
      ) : null}

      <div className="mt-2 grid grid-cols-[auto_minmax(110px,1fr)_auto_auto] items-start gap-1.5">
        <div>
          <p className="text-[9px] leading-none text-muted-foreground">Calcolata</p>
          <p className="mt-1 text-sm font-bold leading-none">
            {/* Mai contato = giacenza non nota: mai mostrata come 0. */}
            {history && !history.hasCount ? "—" : formatQuantity(calculated, unit)}
          </p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] font-medium leading-none text-muted-foreground">Quantità fisica</p>
            {unitOptions.length > 1 ? (
              <select
                className="h-4 max-w-[64px] rounded-sm border border-border bg-background px-0.5 text-[10px] font-semibold leading-none text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={selectedUnit}
                onChange={(event) => unitsCtx.setSelected(row, event.target.value)}
                aria-label={`Unità di misura conteggio ${name}`}
                title={conversionHint ?? "Unità di misura del conteggio"}
              >
                {unitOptions.map((option) => (
                  <option key={option.unit_code} value={option.unit_code}>
                    {option.unit_code}
                  </option>
                ))}
              </select>
            ) : selectedUnit ? (
              <span className="text-[10px] font-semibold leading-none text-muted-foreground/90" aria-label="Unità di misura inventario">
                {selectedUnit}
              </span>
            ) : null}
          </div>
          <Input
            className="mt-1 h-10 px-2 text-right text-base font-bold"
            type="text"
            inputMode="decimal"
            data-count-input="true"
            pattern="[0-9]*[.,]?[0-9]*"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            disabled={locked}
            title={locked ? "Completa prima il ciclo acquisti: usa «Vai alla Lista della Spesa»" : undefined}
            placeholder={isConfirmed ? formatQuantity(Number(row.counted), countedUnit) : ""}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
                onConfirm();
              }
            }}
            aria-label={`Quantità fisica ${name}`}
          />
        </div>
        <div className="text-right">
          <p className="text-[9px] leading-none text-muted-foreground">Differenza</p>
          <p
            className={cn(
              "mt-1 text-sm font-bold leading-none",
              difference !== null && difference < 0 && "text-destructive",
              difference !== null && difference > 0 && "text-success",
            )}
            title={!comparable ? `U.M. non confrontabili${conversionHint ? ` · ${conversionHint} (indicativa)` : ""}` : undefined}
          >
            {difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference, unit)}`}
          </p>
          {!comparable ? (
            <p className="mt-0.5 text-[8px] leading-none text-muted-foreground">U.M. non confrontabili</p>
          ) : null}
        </div>
        <Button className="h-10 px-2 text-[11px] sm:px-3" variant={isConfirmed ? "secondary" : "default"} onClick={onConfirm} disabled={locked}>
          <Check className="size-4" />
          <span className="hidden min-[360px]:inline">Conferma</span>
        </Button>
      </div>
      <div className="mt-1.5 grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2">
        {[1, 3, 5, 10].map((increment) => (
          <Button
            key={increment}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 justify-center px-0 text-xs font-bold leading-none"
            tabIndex={-1}
            aria-label={`Aggiungi ${increment} a ${name}`}
            disabled={locked}
            onClick={() => onChange(addToQuantity(value, increment))}
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
          disabled={locked}
          onClick={() => onChange("")}
        >
          <Delete className="size-4" />
        </Button>
      </div>
      {canCorrect && history && history.lastCountId && history.lastQuantity !== null && history.physical !== null && cycleLock.companyId && cycleLock.locationId ? (
        <PhysicalQuickEdit
          unlockedAll={Boolean(cycleLock.unlockedAll)}
          target={{
            companyId: cycleLock.companyId,
            listId: cycleLock.listId ?? null,
            productId: row.product_id,
            locationId: cycleLock.locationId,
            countId: history.lastCountId,
            unit: history.lastUnit ?? unit ?? "",
            countedQuantity: history.lastQuantity,
            countedAt: history.lastAt,
            physical: history.physical,
            previousQuantity: history.previousQuantity,
            countNote: history.countNote,
            edits: history.edits,
          }}
        />
      ) : null}
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
    <article className="flex h-full flex-col rounded-md border-2 border-border bg-card p-2">
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
      <div className="mt-2 grid grid-cols-[auto_minmax(110px,1fr)_auto_auto] items-start gap-1.5">
        <div><p className="text-[9px] leading-none text-muted-foreground">Calcolata</p><p className="mt-1 text-sm font-bold leading-none">0</p></div>
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
        <Button className="h-10 px-2 text-[11px] sm:px-3" onClick={onConfirm} disabled={disabled}>
          <Check className="size-4" /><span className="hidden min-[360px]:inline">Conferma</span>
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
    verde: { dot: "bg-success", label: "PRONTO PER INVENTARIO", text: "Nessun inventario in corso e nessun ciclo acquisti da completare." },
    giallo: { dot: "bg-primary", label: "INVENTARIO IN CORSO", text: "Continua il conteggio: le quantità scritte restano salvate finché non termini l'inventario." },
    rosso: {
      dot: "bg-destructive",
      label: "INVENTARIO COMPLETATO — ACQUISTI DA GESTIRE",
      text: cycle.evaluated_at
        ? `Valutazione terminata: ${cycle.missing_orders ?? 0} acquisti ancora senza ordine.`
        : "Valuta nella Lista della Spesa cosa acquistare. Non si può iniziare un nuovo inventario finché il ciclo non è concluso.",
    },
  }[color];
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      <span className={`size-3 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide">{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.text}</p>
      </div>
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
