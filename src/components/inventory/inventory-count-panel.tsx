import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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

import { useMemo, useState } from "react";
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
  type CatalogCandidate,
  type CountHistoryEntry,
  type InventoryCountRow,
  type InventoryProgress,
} from "@/lib/inventory-count.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { cn } from "@/lib/utils";

type ProductView = "favorites" | "all";
type WorkFilter = "pending" | "completed" | "differences" | "recount";
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


  const { data: locations = [] } = useInventoryLocations(companyId);
  const activeLocations = locations.filter((location) => location.status === "attivo");
  const defaultLocation = activeLocations.find((location) => location.is_default) ?? activeLocations[0];

  const [tab, setTab] = useState(initialTab ?? "conteggio");
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [productView, setProductView] = useState<ProductView>("all");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("pending");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
        if (workFilter !== "pending") return false;
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

  const rows = useMemo(() => {
    const all = rowsQuery.data ?? [];
    return all
      .filter((row) => {
        // Stessa popolazione del Fabbisogno: solo prodotti gestiti dall'azienda.
        if (managedProductIds.size && !managedProductIds.has(row.product_id)) return false;
        if (workFilter === "pending") return row.counted === null;
        if (workFilter === "recount") return row.recount_requested_at !== null;
        if (workFilter === "completed") return row.counted !== null;
        return row.counted !== null && Number(row.difference ?? 0) !== 0;
      })
      .sort((left, right) => byName(left.description, left.code, right.description, right.code));
  }, [managedProductIds, rowsQuery.data, workFilter]);


  const imageProductIds = useMemo(
    () => [...new Set(rows.map((row) => row.product_id))].slice(0, 50),
    [rows],
  );
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
    queryKey: ["inventario-info-fornitore", companyId, imageProductIds],
    enabled: imageProductIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("product_id, manual_cost, is_preferred, sourcing_priority, supplier_records(legal_name)")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("product_id", imageProductIds);
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
    queryKey: ["inventario-andamento-prezzo", companyId, imageProductIds],
    enabled: imageProductIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchPriceSeriesForProducts(companyId, imageProductIds),
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
      setProductView("all");
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
      setProductView("all");
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
    mutationFn: (input: { row: InventoryCountRow; value: number; notes: string | null }) =>
      saveEntry({
        data: {
          companyId,
          sessionId: sessionId!,
          productId: input.row.product_id,
          locationId: input.row.location_id,
          entryType: input.row.counted !== null ? "riconteggio" : "conteggio",
          countedQuantity: input.value,
          unitCode: rowUnit(input.row) || null,
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
          : `Inventario chiuso: ${summary.total} prodotti, ${summary.differences} con differenze`,
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
    if (value !== Number(row.calculated)) {
      setPending({ row, value });
      setPendingReason(row.note ?? "");
      return;
    }
    countMutation.mutate({ row, value, notes: null });
  };

  const savePendingDifference = () => {
    if (!pending) return;
    countMutation.mutate({ row: pending.row, value: pending.value, notes: pendingReason.trim() });
    setPending(null);
    setPendingReason("");
  };

  const confirmAllUnchanged = async () => {
    const targets = rows.filter((row) => row.counted === null);
    if (!targets.length) {
      toast.info("Nessun prodotto da confermare in questa vista");
      return;
    }
    for (const row of targets) {
      await countMutation.mutateAsync({ row, value: Number(row.calculated), notes: null });
    }
    toast.success(`${targets.length} prodotti confermati invariati`);
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
            disabled={!isAdmin || !archiveId || !activeLocations.length || startMutation.isPending}
            title={isAdmin ? undefined : "Solo un amministratore può avviare l'inventario"}
          >
            <ClipboardCheck aria-hidden="true" />
            <span className="hidden sm:inline">Nuovo conteggio</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        ) : null}
      </div>

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
              image_path: null, thumbnail_path: null, calculated: 0, counted: null, difference: null,
              counted_at: null, counted_by: null, note: null, recount_requested_at: null, non_compliant: false,
              non_compliant_quantity: null, non_compliant_note: null, proposal_status: null, proposal_flagged_at: null,
              min_stock: null, order_multiple: null,
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
                return;
              }
              const productId = key.split(":")[0];
              if (productId) setDraftFirst((current) => ({ ...current, [productId]: value }));
            }}
            onConfirm={(row) => {
              if (sessionId) {
                confirmRow(row);
                return;
              }
              const value = parseQuantity(draftFirst[row.product_id] ?? "");
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
            onConfirmAll={confirmAllUnchanged}
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

            onHideCompletion={() => setShowCompletion(false)}
            closing={closeMutation.isPending}
          />
        )}
      </TabsContent>

      <TabsContent value="fabbisogno">
        {archiveId ? (
          <InventoryRequirementsPanel companyId={companyId} archiveId={archiveId} />
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

  onHideCompletion: () => void;
  closing: boolean;
}) {
  const total = progress?.total ?? 0;
  const generalCompleted = progress?.completed ?? 0;
  const generalDifferences = progress?.differences ?? 0;
  const unchanged = progress?.unchanged ?? 0;
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

  return (
    <section className="space-y-2">
      <div
        className={cn(
          "sticky top-0 z-20 rounded-md border px-3 py-2 shadow-sm",
          completed ? "border-success/40 bg-success/10" : "border-primary/20 bg-card",
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
              {sessionActive ? "Inventario generale" : "Conteggio pronto"}
            </p>
            <h2 className="truncate font-display text-sm font-bold uppercase leading-tight sm:text-base">{sessionName}</h2>
          </div>
          <div className="flex shrink-0 items-baseline gap-1.5">
            <p className="text-lg font-bold leading-none sm:text-xl">
              {generalCompleted} / {total}
            </p>
            <p className="text-[10px] font-semibold text-muted-foreground">{percentage}%</p>
          </div>
        </div>
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
      </div>

      <div className="relative rounded-md border border-border bg-card p-2">
        <Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 pl-9 text-sm" value={search} onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Cerca prodotto o codice" aria-label="Ricerca prodotto" />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid gap-1.5 border-b border-border p-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="min-w-0">
              <p className="font-display font-semibold">{scope}</p>
              <p className="text-xs text-muted-foreground">
                Selezione corrente:{" "}
                <strong>
                  {scopeProgress?.completed ?? 0} / {scopeProgress?.total ?? visibleRows.length}
                </strong>{" "}
                completati
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
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "pending" ? "default" : "outline"} onClick={() => onWorkFilterChange("pending")}>
                Da controllare
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "completed" ? "default" : "outline"} onClick={() => onWorkFilterChange("completed")}>
                Confermati
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "differences" ? "default" : "outline"} onClick={() => onWorkFilterChange("differences")}>
                Differenze
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
                <DropdownMenuItem onClick={() => onWorkFilterChange("pending")}>Da controllare</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("completed")}>Confermati</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWorkFilterChange("differences")}>Differenze</DropdownMenuItem>
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
                      disabled={!isAdmin}
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

          <div className="grid gap-2 border-t border-border p-2 sm:flex sm:justify-end">
            <Button size="sm" variant="outline" onClick={onConfirmAll}>
              <CheckCheck /> Conferma visibili invariati
            </Button>
          </div>
        </div>
      </div>

      {completed && showCompletion ? (
        <CompletionSummary
          total={total}
          unchanged={unchanged}
          differences={generalDifferences}
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
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const unit = rowUnit(row);
  const name = rowName(row);
  const calculated = Number(row.calculated);
  const counted = parseQuantity(value);
  const isConfirmed = row.counted !== null;
  const confirmedDifference = isConfirmed ? Number(row.difference ?? 0) : null;
  const hasDifference = isConfirmed && confirmedDifference !== 0;
  const difference = counted === null ? (isConfirmed ? confirmedDifference : null) : counted - calculated;
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
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            {status}
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
          <p className="mt-1 text-sm font-bold leading-none">{formatQuantity(calculated, unit)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-medium leading-none text-muted-foreground">Quantità fisica</p>
          <Input
            className="mt-1 h-10 px-2 text-right text-base font-bold"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            placeholder={isConfirmed ? formatQuantity(Number(row.counted), unit) : ""}
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
          >
            {difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference, unit)}`}
          </p>
        </div>
        <Button className="h-10 px-2 text-[11px] sm:px-3" variant={isConfirmed ? "secondary" : "default"} onClick={onConfirm}>
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
          onClick={() => onChange("")}
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
          <p className="text-[9px] font-medium leading-none text-muted-foreground">Quantità fisica</p>
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
  isAdmin,
  closing,
  onShowDifferences,
  onClose,
}: {
  total: number;
  unchanged: number;
  differences: number;
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
      <div className="mx-auto mt-5 grid max-w-lg grid-cols-2 divide-x divide-border">
        <p>
          <strong className="block text-2xl">{unchanged}</strong>
          <span className="text-sm text-muted-foreground">senza differenze</span>
        </p>
        <p>
          <strong className="block text-2xl text-destructive">{differences}</strong>
          <span className="text-sm text-muted-foreground">con differenze</span>
        </p>
      </div>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Button variant="outline" onClick={onShowDifferences}>
          <CircleAlert /> Vedi solo differenze
        </Button>
        <Button onClick={onClose} disabled={!isAdmin || closing} title={isAdmin ? undefined : "Solo un amministratore può chiudere l'inventario"}>
          <CheckCheck /> Chiudi inventario
        </Button>
      </div>
    </section>
  );
}

export { NO_CATEGORY, NO_SUBCATEGORY };
