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
  PackageSearch,
  Search,
  Star,
  Tags,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MOCK_PRODUCTS, useMockLocations, type MockLocation, type MockProduct } from "@/lib/inventory-mock";

type ProductView = "favorites" | "all";
type WorkFilter = "pending" | "completed" | "differences";
type NavigationMode = "zones" | "categories" | "subcategories" | "products" | "search";

const INVENTORY_TOTAL = 200;
const INITIAL_COMPLETED = 137;
const INITIAL_WITH_DIFFERENCE = 12;

const ZONE_PROGRESS: Record<string, { completed: number; total: number }> = {
  mandrione: { completed: 84, total: 120 },
  frigo: { completed: 32, total: 40 },
  banco: { completed: 21, total: 25 },
  cella: { completed: 0, total: 15 },
};

const CATEGORY_PROGRESS: Record<string, { completed: number; total: number }> = {
  Frutta: { completed: 38, total: 52 },
  Verdura: { completed: 42, total: 65 },
  "Erbe aromatiche": { completed: 18, total: 22 },
  "Patate e cipolle": { completed: 27, total: 36 },
  Altro: { completed: 12, total: 25 },
};

const SUBCATEGORY_PROGRESS: Record<string, { completed: number; total: number }> = {
  Pomodori: { completed: 8, total: 12 },
  Insalate: { completed: 10, total: 16 },
  Zucchine: { completed: 7, total: 10 },
  Melanzane: { completed: 6, total: 9 },
  Mele: { completed: 13, total: 17 },
  Pere: { completed: 9, total: 13 },
  Agrumi: { completed: 16, total: 22 },
  Basilico: { completed: 10, total: 12 },
  Prezzemolo: { completed: 8, total: 10 },
  Patate: { completed: 15, total: 20 },
  Cipolle: { completed: 12, total: 16 },
  Radici: { completed: 12, total: 25 },
};

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
    minimumFractionDigits: unit === "pz" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function MockInventoryPanel() {
  const locations = useMockLocations();
  const activeLocations = locations.filter((location) => location.active);
  const defaultLocation = activeLocations.find((location) => location.isDefault) ?? activeLocations[0];
  const [tab, setTab] = useState("conteggio");
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(defaultLocation?.id ?? "");
  const [productView, setProductView] = useState<ProductView>("favorites");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("pending");
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("products");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [allMockCompleted, setAllMockCompleted] = useState(false);

  const selectedLocation =
    activeLocations.find((location) => location.id === selectedLocationId) ?? defaultLocation;

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return MOCK_PRODUCTS
      .filter((product) => navigationMode === "search" || !selectedLocationId || product.locationId === selectedLocationId)
      .filter((product) => navigationMode === "search" || !category || product.category === category)
      .filter((product) => navigationMode === "search" || !subcategory || product.subcategory === subcategory)
      .filter((product) => productView === "all" || product.favorite)
      .filter((product) => !term || product.name.toLowerCase().includes(term) || product.code.includes(term))
      .filter((product) => {
        const value = confirmed[product.id];
        if (workFilter === "pending") return value === undefined;
        if (workFilter === "completed") return value !== undefined;
        return value !== undefined && value !== product.calculated;
      });
  }, [category, confirmed, navigationMode, productView, search, selectedLocationId, subcategory, workFilter]);

  const newConfirmations = Object.keys(confirmed).length;
  const newDifferences = MOCK_PRODUCTS.filter((product) => {
    const value = confirmed[product.id];
    return value !== undefined && value !== product.calculated;
  }).length;
  const generalCompleted = allMockCompleted ? INVENTORY_TOTAL : Math.min(INVENTORY_TOTAL, INITIAL_COMPLETED + newConfirmations);
  const generalDifferences = INITIAL_WITH_DIFFERENCE + newDifferences;

  const beginNewCount = () => {
    setSelectedLocationId(defaultLocation?.id ?? "");
    setDrafts({});
    setConfirmed({});
    setAllMockCompleted(false);
    setProductView("favorites");
    setWorkFilter("pending");
    setNavigationMode("products");
    setCategory(null);
    setSubcategory(null);
    setSearch("");
    setSelectingLocation(activeLocations.length > 1);
  };

  const confirmProduct = (product: MockProduct) => {
    const value = parseQuantity(drafts[product.id] ?? "");
    if (value === null) {
      toast.error("Inserisci una quantità valida");
      return;
    }
    setConfirmed((current) => ({ ...current, [product.id]: value }));
    toast.success(`${product.name}: quantità confermata nella demo`);
  };

  const confirmAllUnchanged = () => {
    const nextDrafts = { ...drafts };
    const nextConfirmed = { ...confirmed };
    for (const product of products) {
      nextDrafts[product.id] = formatQuantity(product.calculated, product.unit);
      nextConfirmed[product.id] = product.calculated;
    }
    setDrafts(nextDrafts);
    setConfirmed(nextConfirmed);
    toast.success("Quantità invariate confermate nella demo");
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="conteggio">Conteggio</TabsTrigger>
          <TabsTrigger value="fabbisogno">Fabbisogno</TabsTrigger>
          <TabsTrigger value="zone">Zone</TabsTrigger>
        </TabsList>
        <Button size="sm" onClick={beginNewCount} disabled={!activeLocations.length}>
          <ClipboardCheck aria-hidden="true" />
          <span className="hidden sm:inline">Nuovo conteggio</span>
          <span className="sm:hidden">Nuovo</span>
        </Button>
      </div>

      <TabsContent value="conteggio">
        {selectingLocation ? (
          <LocationSelection
            locations={activeLocations}
            selectedId={selectedLocationId}
            onSelected={setSelectedLocationId}
            onCancel={() => setSelectingLocation(false)}
            onContinue={() => setSelectingLocation(false)}
          />
        ) : (
          <PhysicalCount
            location={selectedLocation}
            products={products}
            productView={productView}
            search={search}
            drafts={drafts}
            confirmed={confirmed}
            generalCompleted={generalCompleted}
            generalDifferences={generalDifferences}
            allMockCompleted={allMockCompleted}
            navigationMode={navigationMode}
            category={category}
            subcategory={subcategory}
            workFilter={workFilter}
            onViewChange={setProductView}
            onWorkFilterChange={setWorkFilter}
            onNavigationModeChange={setNavigationMode}
            onLocationChange={(id) => { setSelectedLocationId(id); setCategory(null); setSubcategory(null); setNavigationMode("categories"); }}
            onCategoryChange={(value) => { setCategory(value); setSubcategory(null); setNavigationMode("subcategories"); }}
            onSubcategoryChange={(value) => { setSubcategory(value); setNavigationMode("products"); }}
            onSearchChange={setSearch}
            onDraftChange={(id, value) => {
              setDrafts((current) => ({ ...current, [id]: value }));
              setConfirmed((current) => {
                const next = { ...current };
                delete next[id];
                return next;
              });
            }}
            onConfirm={confirmProduct}
            onConfirmAll={confirmAllUnchanged}
            onCompleteMock={() => {
              setAllMockCompleted(true);
              setWorkFilter("completed");
              toast.success("Inventario completato nella demo");
            }}
          />
        )}
      </TabsContent>

      <TabsContent value="fabbisogno">
        <section className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-3">Prodotto</th><th className="px-3 py-3">Disponibile</th><th className="px-3 py-3">Scorta minima</th><th className="px-3 py-3">Necessario</th><th className="px-4 py-3 text-right">Fabbisogno</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MOCK_PRODUCTS.slice(0, 5).map((product, index) => (
                <tr key={product.id}><td className="px-4 py-3 font-medium">{product.name}</td><td className="px-3 py-3">{formatQuantity(product.calculated, product.unit)} {product.unit}</td><td className="px-3 py-3">{[25, 15, 10, 20, 12][index]} {product.unit}</td><td className="px-3 py-3">{[130, 70, 36, 72, 40][index]} {product.unit}</td><td className="px-4 py-3 text-right font-semibold">{[35, 0, 6, 32, 17][index]} {product.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </TabsContent>

      <TabsContent value="zone">
        <section className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Nome</th><th className="px-3 py-3">Codice</th><th className="px-3 py-3">Predefinita</th><th className="px-4 py-3">Stato</th></tr></thead>
            <tbody className="divide-y divide-border">{locations.map((location) => <tr key={location.id}><td className="px-4 py-3 font-medium">{location.name}</td><td className="px-3 py-3 font-mono text-muted-foreground">{location.code}</td><td className="px-3 py-3">{location.isDefault ? "Sì" : "—"}</td><td className="px-4 py-3">{location.active ? "Attiva" : "Disattivata"}</td></tr>)}</tbody>
          </table>
        </section>
      </TabsContent>
    </Tabs>
  );
}

function LocationSelection({ locations, selectedId, onSelected, onCancel, onContinue }: { locations: MockLocation[]; selectedId: string; onSelected: (id: string) => void; onCancel: () => void; onContinue: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-md border border-border bg-card">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">Nuovo conteggio fisico</h2>
        <p className="mt-1 text-sm text-muted-foreground">Seleziona la zona da conteggiare.</p>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
        {locations.map((location) => <Button key={location.id} type="button" variant={selectedId === location.id ? "default" : "outline"} className="h-auto min-h-16 justify-start py-3 text-left" onClick={() => onSelected(location.id)}><MapPin className="size-5 shrink-0" /><span>{location.name}<small className="block font-normal opacity-75">{location.code}{location.isDefault ? " · Predefinita" : ""}</small></span></Button>)}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-4 sm:px-5">
        <Button variant="outline" onClick={onCancel}>Annulla</Button>
        <Button disabled={!selectedId} onClick={onContinue}>Inizia conteggio</Button>
      </div>
    </section>
  );
}

function PhysicalCount({ location, products, productView, search, drafts, confirmed, generalCompleted, generalDifferences, allMockCompleted, navigationMode, category, subcategory, workFilter, onViewChange, onWorkFilterChange, onNavigationModeChange, onLocationChange, onCategoryChange, onSubcategoryChange, onSearchChange, onDraftChange, onConfirm, onConfirmAll, onCompleteMock }: { location: MockLocation | undefined; products: MockProduct[]; productView: ProductView; search: string; drafts: Record<string, string>; confirmed: Record<string, number>; generalCompleted: number; generalDifferences: number; allMockCompleted: boolean; navigationMode: NavigationMode; category: string | null; subcategory: string | null; workFilter: WorkFilter; onViewChange: (value: ProductView) => void; onWorkFilterChange: (value: WorkFilter) => void; onNavigationModeChange: (value: NavigationMode) => void; onLocationChange: (id: string) => void; onCategoryChange: (value: string) => void; onSubcategoryChange: (value: string) => void; onSearchChange: (value: string) => void; onDraftChange: (id: string, value: string) => void; onConfirm: (product: MockProduct) => void; onConfirmAll: () => void; onCompleteMock: () => void }) {
  const locations = useMockLocations().filter((item) => item.active);
  const completedWithoutDifferences = generalCompleted - generalDifferences;
  const percentage = Math.round((generalCompleted / INVENTORY_TOTAL) * 100);
  const scope = subcategory ?? category ?? location?.name ?? "Tutto l'inventario";
  const scopeProgress = subcategory ? SUBCATEGORY_PROGRESS[subcategory] : category ? CATEGORY_PROGRESS[category] : location ? ZONE_PROGRESS[location.id] : { completed: generalCompleted, total: INVENTORY_TOTAL };
  const categoryNames = Object.keys(CATEGORY_PROGRESS);
  const subcategoryNames = Array.from(new Set(MOCK_PRODUCTS.filter((product) => !category || product.category === category).map((product) => product.subcategory)));

  return (
    <section className="space-y-2">
      <div className={cn("sticky top-0 z-20 rounded-md border px-3 py-2 shadow-sm", allMockCompleted ? "border-success/40 bg-success/10" : "border-primary/20 bg-card")}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">Inventario generale</p><h2 className="truncate font-display text-sm font-bold uppercase leading-tight sm:text-base">Inventario Magazzino Mandrione</h2></div>
          <div className="flex shrink-0 items-baseline gap-1.5"><p className="text-lg font-bold leading-none sm:text-xl">{generalCompleted} / {INVENTORY_TOTAL}</p><p className="text-[10px] font-semibold text-muted-foreground">{percentage}%</p></div>
        </div>
        <Progress value={percentage} className="mt-1.5 h-2" />
        <div className="mt-1.5 grid grid-cols-3 divide-x divide-border text-center text-[10px] leading-tight sm:text-xs"><p><strong className="mr-1 text-sm sm:text-base">{completedWithoutDifferences}</strong>confermati</p><p><strong className="mr-1 text-sm text-destructive sm:text-base">{generalDifferences}</strong>differenze</p><p><strong className="mr-1 text-sm text-primary sm:text-base">{INVENTORY_TOTAL - generalCompleted}</strong>mancanti</p></div>
      </div>

      <div className="rounded-md border border-border bg-card p-1">
        <div className="grid grid-cols-5 gap-1">
          {([
            ["zones", MapPin, "Zone"], ["categories", LayoutGrid, "Categorie"], ["subcategories", Tags, "Sottocategorie"], ["products", Boxes, "Prodotti"], ["search", Search, "Cerca"],
          ] as const).map(([mode, Icon, label]) => <Button key={mode} variant={navigationMode === mode ? "default" : "ghost"} className="h-11 min-w-0 flex-col gap-0 px-1 text-[9px] sm:h-10 sm:flex-row sm:gap-1.5 sm:text-xs" onClick={() => onNavigationModeChange(mode)}><Icon className="size-4 shrink-0" /><span className="truncate">{label}</span></Button>)}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-card px-2 py-1 text-xs">
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => { onNavigationModeChange("zones"); }}>Tutte le zone</Button>
        {location ? <><ChevronRight className="size-3 shrink-0 text-muted-foreground" /><Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("categories")}>{location.name}</Button></> : null}
        {category ? <><ChevronRight className="size-3 shrink-0 text-muted-foreground" /><Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("subcategories")}>{category}</Button></> : null}
        {subcategory ? <><ChevronRight className="size-3 shrink-0 text-muted-foreground" /><Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-xs" onClick={() => onNavigationModeChange("products")}>{subcategory}</Button></> : null}
      </div>

      {navigationMode === "zones" ? <VisualGrid title="Scegli una zona" items={[{ id: "all", name: "Tutte", progress: { completed: generalCompleted, total: INVENTORY_TOTAL } }, ...locations.map((item) => ({ id: item.id, name: item.name, progress: ZONE_PROGRESS[item.id] }))]} onSelect={(id) => { if (id === "all") { onNavigationModeChange("categories"); } else { onLocationChange(id); } }} /> : null}
      {navigationMode === "categories" ? <VisualGrid title={location ? `Categorie · ${location.name}` : "Categorie"} items={categoryNames.map((name) => ({ id: name, name, progress: CATEGORY_PROGRESS[name] }))} onSelect={onCategoryChange} /> : null}
      {navigationMode === "subcategories" ? <VisualGrid title={category ? `Sottocategorie · ${category}` : "Sottocategorie"} items={subcategoryNames.map((name) => ({ id: name, name, progress: SUBCATEGORY_PROGRESS[name] }))} onSelect={onSubcategoryChange} /> : null}

      {navigationMode === "search" ? <div className="relative rounded-md border border-border bg-card p-2"><Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus className="h-10 pl-9 text-sm" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Cerca prodotto o codice" aria-label="Ricerca prodotto" /></div> : null}

      {(navigationMode === "products" || (navigationMode === "search" && search.trim())) ? <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="grid gap-1.5 border-b border-border p-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div className="min-w-0"><p className="font-display font-semibold">{scope}</p><p className="text-xs text-muted-foreground">Selezione corrente: <strong>{scopeProgress?.completed ?? 0} / {scopeProgress?.total ?? products.length}</strong> completati</p></div>
          <div className="grid grid-cols-2 rounded-md border border-border p-0.5"><Button size="sm" className="h-8 text-xs" variant={productView === "favorites" ? "default" : "ghost"} onClick={() => onViewChange("favorites")}><Star className="size-3.5" /> Preferiti</Button><Button size="sm" className="h-8 text-xs" variant={productView === "all" ? "default" : "ghost"} onClick={() => onViewChange("all")}>Tutti</Button></div>
          <div className="grid grid-cols-3 rounded-md border border-border p-0.5"><Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "pending" ? "default" : "ghost"} onClick={() => onWorkFilterChange("pending")}>Da controllare</Button><Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "completed" ? "default" : "ghost"} onClick={() => onWorkFilterChange("completed")}>Completati</Button><Button size="sm" className="h-8 px-2 text-[11px]" variant={workFilter === "differences" ? "default" : "ghost"} onClick={() => onWorkFilterChange("differences")}>Differenze</Button></div>
        </div>

        <div className="grid gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => <ProductCard key={product.id} product={product} value={drafts[product.id] ?? ""} confirmed={confirmed[product.id]} onChange={(value) => onDraftChange(product.id, value)} onConfirm={() => onConfirm(product)} />)}</div>
        {!products.length ? <div className="p-8 text-center"><PackageSearch className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Nessun prodotto in questa vista</p><p className="text-xs text-muted-foreground">Cambia filtro o selezione per continuare.</p></div> : null}

        <div className="grid gap-2 border-t border-border p-2 sm:flex sm:justify-end"><Button size="sm" variant="outline" onClick={onConfirmAll}><CheckCheck /> Conferma visibili invariati</Button><Button size="sm" onClick={onCompleteMock}><ClipboardCheck /> Simula completamento inventario</Button></div>
      </div> : null}

      {allMockCompleted ? <CompletionSummary completedWithoutDifferences={INVENTORY_TOTAL - generalDifferences} differences={generalDifferences} onShowDifferences={() => { onNavigationModeChange("products"); onWorkFilterChange("differences"); }} /> : null}
    </section>
  );
}

function VisualGrid({ title, items, onSelect }: { title: string; items: { id: string; name: string; progress: { completed: number; total: number } | undefined }[]; onSelect: (id: string) => void }) {
  return (
    <section className="rounded-md border border-border bg-card p-2 sm:p-3"><h3 className="mb-2 font-display text-sm font-semibold">{title}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{items.map((item) => { const percentage = item.progress ? Math.round((item.progress.completed / item.progress.total) * 100) : 0; return <Button key={item.id} variant="outline" className="h-auto min-h-16 flex-col items-stretch justify-between gap-1.5 p-2 text-left" onClick={() => onSelect(item.id)}><span className="line-clamp-1 text-xs font-semibold sm:text-sm">{item.name}</span>{item.progress ? <span><span className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>{item.progress.completed} / {item.progress.total}</span><span>{percentage}%</span></span><Progress value={percentage} className="h-1.5" /></span> : null}</Button> })}</div></section>
  );
}

function ProductCard({ product, value, confirmed, onChange, onConfirm }: { product: MockProduct; value: string; confirmed: number | undefined; onChange: (value: string) => void; onConfirm: () => void }) {
  const counted = parseQuantity(value);
  const difference = counted === null ? null : counted - product.calculated;
  const hasDifference = confirmed !== undefined && confirmed !== product.calculated;
  return (
    <article className={cn("rounded-md border-2 bg-card p-2", confirmed === undefined && "border-border", confirmed !== undefined && !hasDifference && "border-success/50 bg-success/5", hasDifference && "border-destructive/50 bg-destructive/5")}>
      <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2">
        <img src={product.image} alt="" loading="lazy" width={512} height={512} className="size-12 rounded-sm border border-border object-cover" />
        <div className="min-w-0"><p className="truncate font-display text-sm font-bold uppercase leading-tight">{product.name}</p><p className="text-[11px] leading-tight text-muted-foreground">Cod. {product.code} · {product.unit}</p></div>
        <span className={cn("shrink-0 rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none", confirmed === undefined && "bg-muted text-muted-foreground", confirmed !== undefined && !hasDifference && "bg-success/15 text-success", hasDifference && "bg-destructive/10 text-destructive")}>{confirmed === undefined ? "Da controllare" : hasDifference ? "Differenza" : "Confermato"}</span>
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(110px,1fr)_auto_auto] items-start gap-1.5">
        <div><p className="text-[9px] leading-none text-muted-foreground">Calcolata</p><p className="mt-1 text-sm font-bold leading-none">{formatQuantity(product.calculated, product.unit)}</p></div>
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
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); onConfirm(); } }}
            aria-label={`Quantità fisica ${product.name}`}
          />
        </div>
      <div className="mt-1.5 grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2">
        {[1, 3, 5, 10].map((increment) => (
          <Button key={increment} type="button" variant="outline" size="sm" className="h-8 justify-center px-0 text-xs font-bold leading-none" tabIndex={-1} aria-label={`Aggiungi ${increment} a ${product.name}`} onClick={() => onChange(addToQuantity(value, increment))}>+{increment}</Button>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-8 w-11 shrink-0 justify-center px-0" tabIndex={-1} aria-label={`Azzera quantità ${product.name}`} title="Azzera" onClick={() => onChange("")}><Delete className="size-4" /></Button>
      </div>
      <div className="text-right"><p className="text-[9px] leading-none text-muted-foreground">Differenza</p><p className={cn("mt-1 text-sm font-bold leading-none", difference !== null && difference < 0 && "text-destructive", difference !== null && difference > 0 && "text-success")}>{difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference, product.unit)}`}</p></div>
        <Button className="h-10 px-2 text-[11px] sm:px-3" variant={confirmed !== undefined ? "secondary" : "default"} onClick={onConfirm}><Check className="size-4" /><span className="hidden min-[360px]:inline">Conferma</span></Button>
      </div>
    </article>

  );
}

function CompletionSummary({ completedWithoutDifferences, differences, onShowDifferences }: { completedWithoutDifferences: number; differences: number; onShowDifferences: () => void }) {
  return <section className="rounded-md border-2 border-success/50 bg-success/10 p-5 text-center sm:p-8"><CheckCheck className="mx-auto size-10 text-success" /><p className="mt-3 text-xs font-bold uppercase text-success">Inventario completato</p><h3 className="mt-1 font-display text-2xl font-bold">200 prodotti controllati</h3><div className="mx-auto mt-5 grid max-w-lg grid-cols-2 divide-x divide-border"><p><strong className="block text-2xl">{completedWithoutDifferences}</strong><span className="text-sm text-muted-foreground">senza differenze</span></p><p><strong className="block text-2xl text-destructive">{differences}</strong><span className="text-sm text-muted-foreground">con differenze</span></p></div><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button variant="outline" onClick={onShowDifferences}><CircleAlert /> Vedi solo differenze</Button><Button onClick={() => toast.success("Conferma finale simulata: nessun dato reale salvato")}><CheckCheck /> Conferma finale simulata</Button></div></section>;
}