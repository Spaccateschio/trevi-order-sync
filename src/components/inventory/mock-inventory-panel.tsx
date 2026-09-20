import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ClipboardCheck,
  Grid2X2,
  List,
  MapPin,
  Search,
  Star,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MOCK_PRODUCTS, useMockLocations, type MockLocation, type MockProduct } from "@/lib/inventory-mock";

type Screen = "home" | "select-location" | "count" | "summary";
type ProductView = "favorites" | "all";

function parseLocalQuantity(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

export function MockInventoryPanel() {
  const locations = useMockLocations();
  const activeLocations = locations.filter((location) => location.active);
  const defaultLocation = activeLocations.find((location) => location.isDefault) ?? activeLocations[0];
  const [screen, setScreen] = useState<Screen>("home");
  const [tab, setTab] = useState("conteggio");
  const [selectedLocationId, setSelectedLocationId] = useState(defaultLocation?.id ?? "");
  const [productView, setProductView] = useState<ProductView>("favorites");
  const [zoneView, setZoneView] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});

  const selectedLocation =
    activeLocations.find((location) => location.id === selectedLocationId) ?? defaultLocation;

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return MOCK_PRODUCTS.filter((product) => productView === "all" || product.favorite).filter(
      (product) =>
        !term || product.name.toLowerCase().includes(term) || product.code.includes(term),
    );
  }, [productView, search]);

  const startCount = () => {
    setSelectedLocationId(defaultLocation?.id ?? "");
    setDrafts({});
    setConfirmed({});
    setProductView("favorites");
    setSearch("");
    setScreen(activeLocations.length <= 1 ? "count" : "select-location");
  };

  const confirmProduct = (product: MockProduct) => {
    const raw = drafts[product.id];
    const quantity = raw === undefined || raw === "" ? product.calculated : parseLocalQuantity(raw);
    if (quantity === null) {
      toast.error("Inserisci una quantità valida");
      return;
    }
    setConfirmed((current) => ({ ...current, [product.id]: quantity }));
    setDrafts((current) => ({ ...current, [product.id]: String(quantity).replace(".", ",") }));
  };

  const confirmAllUnchanged = () => {
    const nextDrafts = { ...drafts };
    const nextConfirmed = { ...confirmed };
    for (const product of products) {
      if (nextConfirmed[product.id] === undefined && !nextDrafts[product.id]) {
        nextDrafts[product.id] = String(product.calculated).replace(".", ",");
        nextConfirmed[product.id] = product.calculated;
      }
    }
    setDrafts(nextDrafts);
    setConfirmed(nextConfirmed);
    toast.success("Quantità invariate confermate nella demo");
  };

  const confirmedCount = Object.keys(confirmed).length;

  if (screen === "select-location") {
    return (
      <LocationSelection
        locations={activeLocations}
        selectedId={selectedLocationId}
        onSelected={setSelectedLocationId}
        onCancel={() => setScreen("home")}
        onContinue={() => setScreen("count")}
      />
    );
  }

  if (screen === "count") {
    return (
      <QuickCount
        location={selectedLocation}
        products={products}
        productView={productView}
        search={search}
        drafts={drafts}
        confirmed={confirmed}
        onBack={() => setScreen(activeLocations.length <= 1 ? "home" : "select-location")}
        onViewChange={setProductView}
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
        onComplete={() => setScreen("summary")}
      />
    );
  }

  if (screen === "summary") {
    return (
      <CountSummary
        location={selectedLocation}
        confirmed={confirmed}
        onBack={() => setScreen("count")}
        onFinish={() => {
          toast.success("Demo completata: nessun dato reale modificato");
          setScreen("home");
        }}
      />
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="conteggio">Conteggio</TabsTrigger>
          <TabsTrigger value="fabbisogno">Fabbisogno</TabsTrigger>
          <TabsTrigger value="zone">Zone</TabsTrigger>
        </TabsList>
        <Button size="sm" onClick={startCount} disabled={!activeLocations.length}>
          <ClipboardCheck aria-hidden="true" />
          <span className="hidden sm:inline">Nuovo conteggio</span>
          <span className="sm:hidden">Nuovo</span>
        </Button>
      </div>

      <TabsContent value="conteggio" className="space-y-4">
        <section className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground">
                <ClipboardCheck className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold">Conteggio rapido</h2>
                <p className="text-sm text-muted-foreground">
                  Conferma la giacenza calcolata oppure inserisci solo ciò che trovi diverso.
                </p>
              </div>
            </div>
            <Button className="mt-5 w-full sm:w-auto" onClick={startCount} disabled={!activeLocations.length}>
              Inizia dal magazzino
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-muted-foreground">Zona proposta</p>
            <div className="mt-3 flex items-center gap-3">
              <Warehouse className="size-6 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{defaultLocation?.name ?? "Nessuna zona attiva"}</p>
                {defaultLocation ? <p className="text-sm text-muted-foreground">Codice {defaultLocation.code} · Predefinita</p> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="font-display font-semibold">Attività recente della demo</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["Inventario mattina", "Magazzino Mandrione", "124 prodotti"],
              ["Controllo frigo", "Frigo", "56 prodotti"],
              ["Verifica banco", "Banco", "37 prodotti"],
            ].map(([name, zone, count], index) => (
              <div key={name} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <Badge variant={index === 0 ? "secondary" : "outline"}>{index === 0 ? "Oggi" : "Concluso"}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{zone} · {count}</p>
              </div>
            ))}
          </div>
        </section>
      </TabsContent>

      <TabsContent value="fabbisogno">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="p-4 sm:p-5">
            <h2 className="font-display font-semibold">Fabbisogno</h2>
            <p className="mt-1 text-sm text-muted-foreground">Anteprima dimostrativa. La formula e i dati reali non vengono utilizzati né modificati.</p>
          </div>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Prodotto</th><th className="px-3 py-3">Disponibile</th><th className="px-3 py-3">Scorta minima</th><th className="px-3 py-3">Necessario</th><th className="px-4 py-3 text-right">Fabbisogno</th></tr></thead>
              <tbody className="divide-y divide-border">
                {MOCK_PRODUCTS.slice(0, 5).map((product, index) => <tr key={product.id}><td className="px-4 py-3 font-medium">{product.name}</td><td className="px-3 py-3">{formatQuantity(product.calculated)} {product.unit}</td><td className="px-3 py-3">{[25, 15, 10, 20, 12][index]} {product.unit}</td><td className="px-3 py-3">{[130, 70, 36, 72, 40][index]} {product.unit}</td><td className="px-4 py-3 text-right font-semibold">{[35, 0, 6, 32, 17][index]} {product.unit}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="zone" className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" placeholder="Cerca zona…" aria-label="Cerca zona" /></div>
          <div className="flex rounded-md border border-border p-0.5">
            <Button size="icon" variant={zoneView === "cards" ? "secondary" : "ghost"} onClick={() => setZoneView("cards")} aria-label="Vista schede"><Grid2X2 /></Button>
            <Button size="icon" variant={zoneView === "table" ? "secondary" : "ghost"} onClick={() => setZoneView("table")} aria-label="Vista tabella"><List /></Button>
          </div>
        </div>
        {zoneView === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeLocations.map((location) => <LocationCard key={location.id} location={location} onStart={() => { setSelectedLocationId(location.id); setScreen("count"); }} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Zona</th><th className="px-3 py-3">Codice</th><th className="px-3 py-3 text-right">Prodotti</th><th className="px-4 py-3 text-right">Valore giacenza</th></tr></thead><tbody className="divide-y divide-border">{activeLocations.map((location) => <tr key={location.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setSelectedLocationId(location.id); setScreen("count"); }}><td className="px-4 py-3 font-medium">{location.name}{location.isDefault ? <Star className="ml-2 inline size-4 fill-current text-accent" /> : null}</td><td className="px-3 py-3 font-mono text-muted-foreground">{location.code}</td><td className="px-3 py-3 text-right">{location.products}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(location.stockValue)}</td></tr>)}</tbody></table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function LocationCard({ location, onStart }: { location: MockLocation; onStart: () => void }) {
  return (
    <button type="button" onClick={onStart} className={cn("grid min-h-36 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow", location.isDefault && "border-primary ring-1 ring-primary")}>
      <span className="grid size-10 place-items-center rounded-md bg-secondary text-secondary-foreground"><Warehouse className="size-6" aria-hidden="true" /></span>
      <span className="min-w-0"><span className="flex items-center gap-2 font-semibold"><span className="truncate">{location.name}</span>{location.isDefault ? <Star className="size-4 shrink-0 fill-current text-accent" aria-label="Predefinita" /> : null}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{location.code}</span><span className="mt-2 block text-xs text-muted-foreground">{location.products} prodotti</span><span className="block text-xs text-muted-foreground">Valore giacenza</span><span className="block text-sm font-semibold">{formatCurrency(location.stockValue)}</span></span>
      <ArrowRight className="mt-1 size-5 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function LocationSelection({ locations, selectedId, onSelected, onCancel, onContinue }: { locations: MockLocation[]; selectedId: string; onSelected: (id: string) => void; onCancel: () => void; onContinue: () => void }) {
  const selected = locations.find((location) => location.id === selectedId);
  return (
    <section className="mx-auto max-w-2xl rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4 sm:p-6"><h2 className="font-display text-xl font-semibold">Nuovo conteggio fisico</h2><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="font-semibold text-primary"><span className="mx-auto mb-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">1</span>Zona</div><div className="text-muted-foreground"><span className="mx-auto mb-1 grid size-7 place-items-center rounded-full bg-muted">2</span>Prodotti</div><div className="text-muted-foreground"><span className="mx-auto mb-1 grid size-7 place-items-center rounded-full bg-muted">3</span>Riepilogo</div></div></div>
      <div className="space-y-4 p-4 sm:p-6"><div><h3 className="font-semibold">Seleziona la zona da conteggiare</h3><p className="mt-1 text-sm text-muted-foreground">La zona predefinita è già proposta. Puoi cambiarla prima di iniziare.</p></div><label className="block text-sm font-medium">Zona di magazzino<Select value={selectedId} onValueChange={onSelected}><SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="Scegli una zona" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} ({location.code}){location.isDefault ? " · Predefinita" : ""}</SelectItem>)}</SelectContent></Select></label>{selected?.isDefault ? <div className="flex gap-3 rounded-md bg-secondary p-3 text-sm text-secondary-foreground"><MapPin className="size-5 shrink-0" aria-hidden="true" /><p>Questa è la zona predefinita dell’azienda.</p></div> : null}</div>
      <div className="flex justify-between gap-3 border-t border-border p-4 sm:px-6"><Button variant="outline" onClick={onCancel}>Annulla</Button><Button disabled={!selectedId} onClick={onContinue}>Avanti <ArrowRight /></Button></div>
    </section>
  );
}

function QuickCount({ location, products, productView, search, drafts, confirmed, onBack, onViewChange, onSearchChange, onDraftChange, onConfirm, onConfirmAll, onComplete }: { location: MockLocation | undefined; products: MockProduct[]; productView: ProductView; search: string; drafts: Record<string, string>; confirmed: Record<string, number>; onBack: () => void; onViewChange: (value: ProductView) => void; onSearchChange: (value: string) => void; onDraftChange: (id: string, value: string) => void; onConfirm: (product: MockProduct) => void; onConfirmAll: () => void; onComplete: () => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onBack}><ArrowLeft /> Indietro</Button><h2 className="truncate font-display text-xl font-semibold">Conteggio — {location?.name ?? "Zona"}</h2><p className="text-xs text-muted-foreground">Codice {location?.code ?? "—"} · Le modifiche restano solo in questa demo</p></div>
        <Badge variant="secondary" className="mt-1">{Object.keys(confirmed).length}/{MOCK_PRODUCTS.length}</Badge>
      </div>

      <div className="sticky top-[60px] z-10 space-y-2 border-y border-border bg-background py-2 lg:top-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input className="h-10 pl-9" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Cerca prodotto…" /></div>
          <div className="flex rounded-md border border-border p-0.5"><Button size="sm" variant={productView === "favorites" ? "default" : "ghost"} onClick={() => onViewChange("favorites")}><Star className="size-4" /> <span className="hidden sm:inline">Preferiti</span></Button><Button size="sm" variant={productView === "all" ? "default" : "ghost"} onClick={() => onViewChange("all")}>Tutti</Button></div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">Tocca la spunta per confermare il valore calcolato.</p>
          <Button size="sm" variant="outline" onClick={onConfirmAll}><CheckCheck /> <span className="hidden sm:inline">Conferma tutti invariati</span><span className="sm:hidden">Tutti uguali</span></Button>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <table className="w-full table-fixed text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Prodotto</th><th className="w-16 px-2 py-3">U.M.</th><th className="w-32 px-2 py-3 text-right">Giacenza calcolata</th><th className="w-36 px-2 py-3">Quantità contata</th><th className="w-24 px-2 py-3 text-right">Differenza</th><th className="w-16 px-3 py-3"><span className="sr-only">Conferma</span></th></tr></thead><tbody className="divide-y divide-border">{products.map((product) => <ProductTableRow key={product.id} product={product} value={drafts[product.id] ?? ""} confirmed={confirmed[product.id]} onChange={(value) => onDraftChange(product.id, value)} onConfirm={() => onConfirm(product)} />)}</tbody></table>
      </div>

      <ul className="space-y-2 md:hidden">{products.map((product) => <ProductMobileRow key={product.id} product={product} value={drafts[product.id] ?? ""} confirmed={confirmed[product.id]} onChange={(value) => onDraftChange(product.id, value)} onConfirm={() => onConfirm(product)} />)}</ul>
      {!products.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nessun prodotto trovato.</p> : null}

      <div className="sticky bottom-[68px] z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg lg:bottom-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{Object.keys(confirmed).length} prodotti confermati</p><p className="truncate text-xs text-muted-foreground">Puoi continuare anche con un conteggio parziale.</p></div><Button onClick={onComplete}>Riepilogo <ArrowRight /></Button></div>
    </div>
  );
}

function ProductTableRow({ product, value, confirmed, onChange, onConfirm }: { product: MockProduct; value: string; confirmed: number | undefined; onChange: (value: string) => void; onConfirm: () => void }) {
  const parsed = value ? parseLocalQuantity(value) : null;
  const effective = confirmed ?? parsed;
  const difference = effective === null || effective === undefined ? null : effective - product.calculated;
  return <tr className={confirmed !== undefined ? "bg-success/5" : undefined}><td className="px-4 py-2"><div className="flex min-w-0 items-center gap-2"><span className="text-xl" aria-hidden="true">{product.icon}</span><div className="min-w-0"><p className="truncate font-medium">{product.name}</p><p className="font-mono text-[11px] text-muted-foreground">{product.code}</p></div></div></td><td className="px-2 py-2 text-muted-foreground">{product.unit}</td><td className="px-2 py-2 text-right font-medium">{formatQuantity(product.calculated)}</td><td className="px-2 py-2"><Input className="h-9 text-right" inputMode="decimal" value={value} placeholder={formatQuantity(product.calculated)} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onConfirm(); }} aria-label={`Quantità contata ${product.name}`} /></td><td className={cn("px-2 py-2 text-right font-semibold", difference !== null && difference < 0 && "text-destructive", difference !== null && difference > 0 && "text-success")}>{difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference)}`}</td><td className="px-3 py-2"><Button size="icon" variant={confirmed !== undefined ? "secondary" : "ghost"} onClick={onConfirm} aria-label={`Conferma ${product.name}`}><Check /></Button></td></tr>;
}

function ProductMobileRow({ product, value, confirmed, onChange, onConfirm }: { product: MockProduct; value: string; confirmed: number | undefined; onChange: (value: string) => void; onConfirm: () => void }) {
  const parsed = value ? parseLocalQuantity(value) : null;
  const effective = confirmed ?? parsed;
  const difference = effective === null || effective === undefined ? null : effective - product.calculated;
  return <li className={cn("rounded-lg border border-border bg-card p-3 shadow-sm", confirmed !== undefined && "border-success/50 bg-success/5")}><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="flex min-w-0 gap-2"><span className="text-2xl" aria-hidden="true">{product.icon}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{product.code} · {product.unit}</p></div></div><div className="text-right"><p className="text-[11px] text-muted-foreground">Calcolata</p><p className="font-semibold">{formatQuantity(product.calculated)} {product.unit}</p></div></div><div className="mt-3 grid grid-cols-[minmax(0,1fr)_48px] gap-2"><div className="relative"><Input className="h-12 pr-12 text-right text-lg font-semibold" inputMode="decimal" value={value} placeholder={formatQuantity(product.calculated)} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onConfirm(); }} aria-label={`Quantità contata ${product.name}`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{product.unit}</span></div><Button className="size-12" size="icon" variant={confirmed !== undefined ? "secondary" : "default"} onClick={onConfirm} aria-label={`Conferma ${product.name}`}><Check className="size-5" /></Button></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">{confirmed !== undefined ? "Quantità confermata" : "Vuoto = conferma invariata"}</span><span className={cn("font-semibold", difference !== null && difference < 0 && "text-destructive", difference !== null && difference > 0 && "text-success")}>{difference === null ? "Differenza —" : `Differenza ${difference > 0 ? "+" : ""}${formatQuantity(difference)}`}</span></div></li>;
}

function CountSummary({ location, confirmed, onBack, onFinish }: { location: MockLocation | undefined; confirmed: Record<string, number>; onBack: () => void; onFinish: () => void }) {
  const rows = MOCK_PRODUCTS.filter((product) => confirmed[product.id] !== undefined);
  const differences = rows.filter((product) => confirmed[product.id] !== product.calculated);
  return <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-sm"><div className="border-b border-border p-4 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-success text-success-foreground"><ClipboardCheck /></span><div><h2 className="font-display text-xl font-semibold">Riepilogo conteggio</h2><p className="text-sm text-muted-foreground">{location?.name} · Demo non salvata</p></div></div></div><div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6"><div className="rounded-md bg-muted p-4"><p className="text-xs text-muted-foreground">Confermati</p><p className="mt-1 text-2xl font-semibold">{rows.length}</p></div><div className="rounded-md bg-muted p-4"><p className="text-xs text-muted-foreground">Con differenze</p><p className="mt-1 text-2xl font-semibold">{differences.length}</p></div><div className="rounded-md bg-muted p-4"><p className="text-xs text-muted-foreground">Non controllati</p><p className="mt-1 text-2xl font-semibold">{MOCK_PRODUCTS.length - rows.length}</p></div></div><div className="border-y border-border"><ul className="divide-y divide-border">{differences.map((product) => { const counted = confirmed[product.id] ?? product.calculated; const difference = counted - product.calculated; return <li key={product.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-muted-foreground">{formatQuantity(product.calculated)} → {formatQuantity(counted)} {product.unit}</p></div><Badge variant={difference < 0 ? "destructive" : "secondary"}>{difference > 0 ? "+" : ""}{formatQuantity(difference)} {product.unit}</Badge></li>; })}{!differences.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nessuna differenza nelle quantità confermate.</li> : null}</ul></div><div className="flex justify-between gap-3 p-4 sm:px-6"><Button variant="outline" onClick={onBack}><ArrowLeft /> Torna al conteggio</Button><Button onClick={onFinish}>Termina demo <Check /></Button></div></section>;
}