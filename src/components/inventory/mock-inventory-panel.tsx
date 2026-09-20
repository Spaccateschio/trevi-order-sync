import { Check, CheckCheck, ClipboardCheck, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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

type ProductView = "favorites" | "all";

const INITIAL_COUNTS: Record<string, string> = {
  mele: "118,50",
  pomodori: "85,00",
  lattuga: "42",
  carote: "60,00",
  zucchine: "33,50",
};

function parseQuantity(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(INITIAL_COUNTS);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});

  const selectedLocation =
    activeLocations.find((location) => location.id === selectedLocationId) ?? defaultLocation;

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return MOCK_PRODUCTS.filter((product) => productView === "all" || product.favorite).filter(
      (product) => !term || product.name.toLowerCase().includes(term) || product.code.includes(term),
    );
  }, [productView, search]);

  const beginNewCount = () => {
    setSelectedLocationId(defaultLocation?.id ?? "");
    setDrafts(INITIAL_COUNTS);
    setConfirmed({});
    setProductView("favorites");
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
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
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
      <div className="p-4 sm:p-5">
        <label className="block text-sm font-medium">Zona di magazzino
          <Select value={selectedId} onValueChange={onSelected}>
            <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="Scegli una zona" /></SelectTrigger>
            <SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} ({location.code}){location.isDefault ? " — Predefinita" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-4 sm:px-5">
        <Button variant="outline" onClick={onCancel}>Annulla</Button>
        <Button disabled={!selectedId} onClick={onContinue}>Inizia conteggio</Button>
      </div>
    </section>
  );
}

function PhysicalCount({ location, products, productView, search, drafts, confirmed, onViewChange, onSearchChange, onDraftChange, onConfirm, onConfirmAll }: { location: MockLocation | undefined; products: MockProduct[]; productView: ProductView; search: string; drafts: Record<string, string>; confirmed: Record<string, number>; onViewChange: (value: ProductView) => void; onSearchChange: (value: string) => void; onDraftChange: (id: string, value: string) => void; onConfirm: (product: MockProduct) => void; onConfirmAll: () => void }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">Conteggio fisico — {location?.name ?? "Zona"} ({location?.code ?? "—"})</h2>
      </div>

      <div className="grid gap-3 border-b border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="h-10 pl-9" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Ricerca prodotto" aria-label="Ricerca prodotto" />
        </div>
        <div className="grid grid-cols-2 rounded-md border border-border p-0.5">
          <Button size="sm" variant={productView === "favorites" ? "default" : "ghost"} onClick={() => onViewChange("favorites")}><Star className="size-4" /> Preferiti</Button>
          <Button size="sm" variant={productView === "all" ? "default" : "ghost"} onClick={() => onViewChange("all")}>Tutti</Button>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Prodotto</th><th className="w-16 px-2 py-3">U.M.</th><th className="w-36 px-2 py-3 text-right">Giacenza calcolata</th><th className="w-40 px-2 py-3">Quantità contata</th><th className="w-24 px-2 py-3 text-right">Differenza</th><th className="w-32 px-4 py-3 text-right">Azione</th></tr></thead>
          <tbody className="divide-y divide-border">{products.map((product) => <ProductTableRow key={product.id} product={product} value={drafts[product.id] ?? ""} confirmed={confirmed[product.id]} onChange={(value) => onDraftChange(product.id, value)} onConfirm={() => onConfirm(product)} />)}</tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">{products.map((product) => <ProductMobileRow key={product.id} product={product} value={drafts[product.id] ?? ""} confirmed={confirmed[product.id]} onChange={(value) => onDraftChange(product.id, value)} onConfirm={() => onConfirm(product)} />)}</ul>
      {!products.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nessun prodotto trovato.</p> : null}

      <div className="flex justify-end border-t border-border p-3 sm:p-4">
        <Button variant="outline" onClick={onConfirmAll}><CheckCheck /> Conferma tutti invariati</Button>
      </div>
    </section>
  );
}

function ProductTableRow({ product, value, confirmed, onChange, onConfirm }: { product: MockProduct; value: string; confirmed: number | undefined; onChange: (value: string) => void; onConfirm: () => void }) {
  const counted = parseQuantity(value);
  const difference = counted === null ? null : counted - product.calculated;
  return (
    <tr className={confirmed !== undefined ? "bg-success/5" : undefined}>
      <td className="px-4 py-2.5 font-medium">{product.name}</td>
      <td className="px-2 py-2.5 text-muted-foreground">{product.unit}</td>
      <td className="px-2 py-2.5 text-right">{formatQuantity(product.calculated, product.unit)}</td>
      <td className="px-2 py-2.5"><Input className="h-9 text-right" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onConfirm(); }} aria-label={`Quantità contata ${product.name}`} /></td>
      <td className={cn("px-2 py-2.5 text-right font-semibold", difference !== null && difference < 0 && "text-destructive", difference !== null && difference > 0 && "text-success")}>{difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference, product.unit)}`}</td>
      <td className="px-4 py-2.5 text-right"><Button size="sm" variant={confirmed !== undefined ? "secondary" : "outline"} onClick={onConfirm}><Check /> Conferma</Button></td>
    </tr>
  );
}

function ProductMobileRow({ product, value, confirmed, onChange, onConfirm }: { product: MockProduct; value: string; confirmed: number | undefined; onChange: (value: string) => void; onConfirm: () => void }) {
  const counted = parseQuantity(value);
  const difference = counted === null ? null : counted - product.calculated;
  return (
    <li className={cn("p-3", confirmed !== undefined && "bg-success/5")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">U.M. {product.unit}</p></div>
        <div className="text-right"><p className="text-[11px] text-muted-foreground">Giacenza calcolata</p><p className="font-semibold">{formatQuantity(product.calculated, product.unit)} {product.unit}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <Input className="h-11 text-right text-base font-semibold" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onConfirm(); }} aria-label={`Quantità contata ${product.name}`} />
        <Button className="h-11" size="sm" variant={confirmed !== undefined ? "secondary" : "outline"} onClick={onConfirm}><Check /> Conferma</Button>
      </div>
      <p className={cn("mt-2 text-right text-xs font-semibold", difference !== null && difference < 0 && "text-destructive", difference !== null && difference > 0 && "text-success")}>Differenza {difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatQuantity(difference, product.unit)}`}</p>
    </li>
  );
}