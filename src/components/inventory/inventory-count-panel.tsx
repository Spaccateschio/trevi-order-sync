import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Delete,
  LayoutGrid,
  MapPin,
  Package,
  PackageSearch,
  Search,
  Sparkles,
  Star,
  StickyNote,
  Tags,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useInventoryLocations } from "@/components/inventory/inventory-locations-manager";
import { InventoryRequirementsPanel } from "@/components/inventory/inventory-requirements-panel";
import { supabase } from "@/integrations/supabase/client";
import {
  closeGeneralInventory,
  getInventoryProgress,
  getInventoryRows,
  manageCompanyProductFavorite,
  startGeneralInventory,
  type InventoryCountRow,
  type InventoryProgress,
} from "@/lib/inventory-count.functions";
import { recordInventoryCount } from "@/lib/inventory.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { cn } from "@/lib/utils";

type ProductView = "favorites" | "all";
type WorkFilter = "pending" | "completed" | "differences";
type NavigationMode = "zones" | "categories" | "subcategories" | "products" | "search";

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

function rowUnit(row: InventoryCountRow) {
  return row.danea_um?.trim() || "";
}

export function InventoryCountPanel({
  companyId,
  archiveId,
  isAdmin,
}: {
  companyId: string;
  archiveId: string | null;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const start = useServerFn(startGeneralInventory);
  const close = useServerFn(closeGeneralInventory);
  const readProgress = useServerFn(getInventoryProgress);
  const readRows = useServerFn(getInventoryRows);
  const saveCount = useServerFn(recordInventoryCount);
  const toggleFavorite = useServerFn(manageCompanyProductFavorite);
  const getImageUrls = useServerFn(getProductImageUrls);

  const { data: locations = [] } = useInventoryLocations(companyId);
  const activeLocations = locations.filter((location) => location.status === "attivo");
  const defaultLocation = activeLocations.find((location) => location.is_default) ?? activeLocations[0];

  const [tab, setTab] = useState("conteggio");
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [productView, setProductView] = useState<ProductView>("favorites");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("pending");
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("products");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ row: InventoryCountRow; value: number } | null>(null);
  const [pendingReason, setPendingReason] = useState("");
  const [showCompletion, setShowCompletion] = useState(true);

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

  const progressQuery = useQuery({
    queryKey: ["inventory-progress", sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => readProgress({ data: { sessionId: sessionId! } }),
  });
  const progress: InventoryProgress | undefined = progressQuery.data;

  const searching = navigationMode === "search" && search.trim().length > 0;
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
    return all.filter((row) => {
      if (workFilter === "pending") return row.counted === null;
      if (workFilter === "completed") return row.counted !== null;
      return row.counted !== null && Number(row.difference ?? 0) !== 0;
    });
  }, [rowsQuery.data, workFilter]);

  const imageProductIds = useMemo(
    () => rows.filter((row) => row.thumbnail_path).slice(0, 50).map((row) => row.product_id),
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
      setNavigationMode("products");
      setSelectedLocationId(activeLocations.length > 1 ? (defaultLocation?.id ?? null) : (defaultLocation?.id ?? null));
      setSelectingLocation(activeLocations.length > 1);
      toast.success("Inventario generale aperto");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const countMutation = useMutation({
    mutationFn: (input: { row: InventoryCountRow; value: number; notes: string | null }) =>
      saveCount({
        data: {
          companyId,
          sessionId: sessionId!,
          productId: input.row.product_id,
          locationId: input.row.location_id,
          countedQuantity: input.value,
          unitId: null,
          unitCode: rowUnit(input.row) || null,
          notes: input.notes,
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
      await queryClient.invalidateQueries({ queryKey: ["inventory-rows"] });
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
  const zoneProgress = new Map((progress?.zones ?? []).map((zone) => [zone.location_id, zone]));

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="conteggio">Conteggio</TabsTrigger>
          <TabsTrigger value="fabbisogno">Fabbisogno</TabsTrigger>
          <TabsTrigger value="zone">Zone</TabsTrigger>
        </TabsList>
        {sessionId ? (
          activeLocations.length > 1 ? (
            <Button size="sm" variant="outline" onClick={() => setNavigationMode("zones")}>
              <MapPin aria-hidden="true" />
              <span className="hidden sm:inline">Cambia zona</span>
              <span className="sm:hidden">Zone</span>
            </Button>
          ) : null
        ) : (
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
        )}
      </div>

      <TabsContent value="conteggio">
        {!sessionId ? (
          <section className="rounded-md border border-border bg-card p-6 text-center">
            <ClipboardCheck className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">Nessun inventario generale aperto</p>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Premi Nuovo conteggio per avviare l'inventario generale su tutte le zone attive."
                : "Un amministratore deve avviare l'inventario: poi potrai partecipare al conteggio."}
            </p>
          </section>
        ) : selectingLocation ? (
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
            sessionName={progress?.session_name ?? sessionQuery.data?.name ?? "Inventario generale"}
            progress={progress}
            locations={activeLocations.map((location) => ({
              id: location.id,
              name: location.name,
              progress: zoneProgress.get(location.id),
            }))}
            selectedLocation={selectedLocation ? { id: selectedLocation.id, name: selectedLocation.name } : null}
            rows={rows}
            loading={rowsQuery.isLoading}
            imageUrls={imageUrls}
            drafts={drafts}
            productView={productView}
            workFilter={workFilter}
            navigationMode={navigationMode}
            category={category}
            subcategory={subcategory}
            search={search}
            isAdmin={isAdmin}
            showCompletion={showCompletion}
            onViewChange={setProductView}
            onWorkFilterChange={setWorkFilter}
            onNavigationModeChange={setNavigationMode}
            onLocationChange={(id) => {
              setSelectedLocationId(id);
              setCategory(null);
              setSubcategory(null);
              setNavigationMode("categories");
            }}
            onAllZones={() => {
              setSelectedLocationId(null);
              setCategory(null);
              setSubcategory(null);
              setNavigationMode("categories");
            }}
            onCategoryChange={(value) => {
              setCategory(value);
              setSubcategory(null);
              setNavigationMode("subcategories");
            }}
            onSubcategoryChange={(value) => {
              setSubcategory(value);
              setNavigationMode("products");
            }}
            onSearchChange={setSearch}
            onDraftChange={(key, value) => setDrafts((current) => ({ ...current, [key]: value }))}
            onConfirm={confirmRow}
            onConfirmAll={confirmAllUnchanged}
            onToggleFavorite={(row) =>
              favoriteMutation.mutate({ productId: row.product_id, favorite: !row.is_favorite })
            }
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
  sessionName,
  progress,
  locations,
  selectedLocation,
  rows,
  loading,
  imageUrls,
  drafts,
  productView,
  workFilter,
  navigationMode,
  category,
  subcategory,
  search,
  isAdmin,
  showCompletion,
  onViewChange,
  onWorkFilterChange,
  onNavigationModeChange,
  onLocationChange,
  onAllZones,
  onCategoryChange,
  onSubcategoryChange,
  onSearchChange,
  onDraftChange,
  onConfirm,
  onConfirmAll,
  onToggleFavorite,
  onCloseInventory,
  onHideCompletion,
  closing,
}: {
  sessionName: string;
  progress: InventoryProgress | undefined;
  locations: { id: string; name: string; progress: { completed: number; total: number } | undefined }[];
  selectedLocation: { id: string; name: string } | null;
  rows: InventoryCountRow[];
  loading: boolean;
  imageUrls: Map<string, string>;
  drafts: Record<string, string>;
  productView: ProductView;
  workFilter: WorkFilter;
  navigationMode: NavigationMode;
  category: string | null;
  subcategory: string | null;
  search: string;
  isAdmin: boolean;
  showCompletion: boolean;
  onViewChange: (value: ProductView) => void;
  onWorkFilterChange: (value: WorkFilter) => void;
  onNavigationModeChange: (value: NavigationMode) => void;
  onLocationChange: (id: string) => void;
  onAllZones: () => void;
  onCategoryChange: (value: string) => void;
  onSubcategoryChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onDraftChange: (key: string, value: string) => void;
  onConfirm: (row: InventoryCountRow) => void;
  onConfirmAll: () => void;
  onToggleFavorite: (row: InventoryCountRow) => void;
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

  const categories = progress?.categories ?? [];
  const subcategories = (progress?.subcategories ?? []).filter((item) => !category || item.category === category);

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
            <p className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">Inventario generale</p>
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

      <div className="rounded-md border border-border bg-card p-1">
        <div className="grid grid-cols-5 gap-1">
          {(
            [
              ["zones", MapPin, "Zone"],
              ["categories", LayoutGrid, "Categorie"],
              ["subcategories", Tags, "Sottocategorie"],
              ["products", Boxes, "Prodotti"],
              ["search", Search, "Cerca"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <Button
              key={mode}
              variant={navigationMode === mode ? "default" : "ghost"}
              className="h-11 min-w-0 flex-col gap-0 px-1 text-[9px] sm:h-10 sm:flex-row sm:gap-1.5 sm:text-xs"
              onClick={() => onNavigationModeChange(mode)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-card px-2 py-1 text-xs">
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("zones")}>
          Tutte le zone
        </Button>
        {selectedLocation ? (
          <>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("categories")}>
              {selectedLocation.name}
            </Button>
          </>
        ) : null}
        {category ? (
          <>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("subcategories")}>
              {category}
            </Button>
          </>
        ) : null}
        {subcategory ? (
          <>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("products")}>
              {subcategory}
            </Button>
          </>
        ) : null}
      </div>

      {navigationMode === "zones" ? (
        <VisualGrid
          title="Scegli una zona"
          items={[
            { id: "all", name: "Tutte", progress: { completed: generalCompleted, total } },
            ...locations.map((item) => ({ id: item.id, name: item.name, progress: item.progress })),
          ]}
          onSelect={(id) => {
            if (id === "all") onAllZones();
            else onLocationChange(id);
          }}
        />
      ) : null}
      {navigationMode === "categories" ? (
        <VisualGrid
          title={selectedLocation ? `Categorie · ${selectedLocation.name}` : "Categorie"}
          items={categories.map((item) => ({ id: item.name, name: item.name, progress: item }))}
          onSelect={onCategoryChange}
        />
      ) : null}
      {navigationMode === "subcategories" ? (
        <VisualGrid
          title={category ? `Sottocategorie · ${category}` : "Sottocategorie"}
          items={subcategories.map((item) => ({ id: item.name, name: item.name, progress: item }))}
          onSelect={onSubcategoryChange}
        />
      ) : null}

      {navigationMode === "search" ? (
        <div className="relative rounded-md border border-border bg-card p-2">
          <Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-10 pl-9 text-sm"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Cerca prodotto o codice"
            aria-label="Ricerca prodotto"
          />
        </div>
      ) : null}

      {navigationMode === "products" || (navigationMode === "search" && search.trim()) ? (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid gap-1.5 border-b border-border p-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="min-w-0">
              <p className="font-display font-semibold">{scope}</p>
              <p className="text-xs text-muted-foreground">
                Selezione corrente:{" "}
                <strong>
                  {scopeProgress?.completed ?? 0} / {scopeProgress?.total ?? rows.length}
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
            <div className="grid grid-cols-3 rounded-md border border-border p-0.5">
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "pending" ? "default" : "ghost"} onClick={() => onWorkFilterChange("pending")}>
                Da controllare
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "completed" ? "default" : "ghost"} onClick={() => onWorkFilterChange("completed")}>
                Completati
              </Button>
              <Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "differences" ? "default" : "ghost"} onClick={() => onWorkFilterChange("differences")}>
                Differenze
              </Button>
            </div>
          </div>

          <div className="grid gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <ProductCard
                key={rowKey(row)}
                row={row}
                imageUrl={imageUrls.get(row.product_id)}
                value={drafts[rowKey(row)] ?? ""}
                isAdmin={isAdmin}
                onChange={(value) => onDraftChange(rowKey(row), value)}
                onConfirm={() => onConfirm(row)}
                onToggleFavorite={() => onToggleFavorite(row)}
              />
            ))}
          </div>
          {!rows.length ? (
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
      ) : null}

      {completed && showCompletion ? (
        <CompletionSummary
          total={total}
          unchanged={unchanged}
          differences={generalDifferences}
          isAdmin={isAdmin}
          closing={closing}
          onShowDifferences={() => {
            onNavigationModeChange("products");
            onWorkFilterChange("differences");
            onHideCompletion();
          }}
          onClose={onCloseInventory}
        />
      ) : null}
    </section>
  );
}

function VisualGrid({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: { id: string; name: string; progress: { completed: number; total: number } | undefined }[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-2 sm:p-3">
      <h3 className="mb-2 font-display text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const percentage = item.progress?.total ? Math.round((item.progress.completed / item.progress.total) * 100) : 0;
          return (
            <Button
              key={item.id}
              variant="outline"
              className="h-auto min-h-16 flex-col items-stretch justify-between gap-1.5 p-2 text-left"
              onClick={() => onSelect(item.id)}
            >
              <span className="line-clamp-1 text-xs font-semibold sm:text-sm">{item.name}</span>
              {item.progress ? (
                <span>
                  <span className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>
                      {item.progress.completed} / {item.progress.total}
                    </span>
                    <span>{percentage}%</span>
                  </span>
                  <Progress value={percentage} className="h-1.5" />
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function ProductCard({
  row,
  imageUrl,
  value,
  isAdmin,
  onChange,
  onConfirm,
  onToggleFavorite,
}: {
  row: InventoryCountRow;
  imageUrl: string | undefined;
  value: string;
  isAdmin: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onToggleFavorite: () => void;
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

  return (
    <article
      className={cn(
        "rounded-md border-2 bg-card p-2",
        !isConfirmed && "border-border",
        isConfirmed && !hasDifference && "border-success/50 bg-success/5",
        hasDifference && "border-destructive/50 bg-destructive/5",
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
            {unit ? ` · ${unit}` : ""} · {row.location_name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            )}
          >
            {!isConfirmed ? "Da controllare" : hasDifference ? "Differenza" : "Confermato"}
          </span>
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
