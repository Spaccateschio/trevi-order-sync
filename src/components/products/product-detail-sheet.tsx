import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Quattro contesti della stessa scheda prodotto. */
export type ProductDetailTab = "prodotto" | "vendita" | "acquisto" | "inventario";
import { ChevronDown, Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AVAILABILITY_LABELS, dateTime, euro, type ProductRow } from "@/lib/product-grid";
import { PurchaseUnitsOverview, SalesUnitManager, type CompanyUnit, type ProductSaleUnit } from "./sales-unit-manager";
import { ProductImageManager } from "./product-image-manager";
import { ProductSuppliersManager } from "./product-suppliers-manager";
import { ProductProvenancePanel } from "./product-provenance-panel";
import { ProductStockPanel } from "./product-stock-panel";

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>;
}

/** Piccola icona ⓘ con spiegazione: nessun testo permanente in pagina. */
function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={text} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Riga di impostazione: etichetta a sinistra, controllo a destra; su smartphone due righe touch-comode. */
function SettingRow({ title, info, children }: { title: string; info: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
        <span>{title}</span>
        <InfoHint text={info} />
      </p>
      <div className="min-w-0 sm:flex sm:justify-end">{children}</div>
    </div>
  );
}

function ShowcaseToggle({ product, companyId, editable }: { product: ProductRow; companyId: string; editable: boolean }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (visible: boolean) => {
      const { error } = await supabase.rpc("set_product_b2b_visibility", {
        _company_id: companyId,
        _product_ids: [product.id],
        _visible: visible,
      });
      if (error) throw new Error(error.message);
      return visible;
    },
    onSuccess: (visible) => {
      toast.success(visible ? "Prodotto in vetrina B2B" : "Prodotto nascosto dalla vetrina");
      void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SettingRow title="In vetrina B2B" info="Se attivo, i clienti collegati vedono questo prodotto nel tuo catalogo. Non cambia nulla in Danea.">
      <Switch
        checked={product.b2b_visible}
        disabled={!editable || mutation.isPending}
        onCheckedChange={(value) => mutation.mutate(value)}
        aria-label="In vetrina B2B"
      />
    </SettingRow>
  );
}

function AvailabilitySelector({ product, companyId, editable }: { product: ProductRow; companyId: string; editable: boolean }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (value: ProductRow["commercial_availability"]) => {
      const { error } = await supabase.rpc("set_product_commercial_availability", {
        _company_id: companyId,
        _product_id: product.id,
        _availability: value,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Disponibilità commerciale aggiornata");
      void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SettingRow title="Disponibilità commerciale" info="Decide se e come il cliente può ordinare. Scelta manuale: non cambia in base a giacenza, fabbisogno o fornitori.">
      <Select
        value={product.commercial_availability}
        disabled={!editable || mutation.isPending}
        onValueChange={(value) => mutation.mutate(value as ProductRow["commercial_availability"])}
      >
        <SelectTrigger aria-label="Disponibilità commerciale" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(AVAILABILITY_LABELS) as ProductRow["commercial_availability"][]).map((key) => (
            <SelectItem key={key} value={key}>{AVAILABILITY_LABELS[key]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}

function PriceUnitSelector({ product, companyId, companyUnits, editable }: { product: ProductRow; companyId: string; companyUnits: CompanyUnit[]; editable: boolean }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const args: Record<string, string> = { _company_id: companyId, _product_id: product.id };
      if (value !== "base") args["_price_unit_id"] = value;
      const { error } = await supabase.rpc(
        "set_product_price_unit",
        args as unknown as { _company_id: string; _product_id: string; _price_unit_id: string },
      );
      if (error) throw new Error(error.message);
    },

    onSuccess: () => {
      toast.success("U.M. del prezzo aggiornata");
      void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Sui prodotti che arrivano da Danea la U.M. del prezzo è quella ricevuta con articoli e listini.
  const fromDanea = Boolean(product.danea_internal_id);
  const manualUnit = product.price_unit_id ? companyUnits.find((unit) => unit.id === product.price_unit_id) ?? null : null;

  if (fromDanea) {
    return (
      <SettingRow title="U.M. del prezzo" info="Arriva da Danea insieme ad articoli e listini: non si imposta qui.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">{product.danea_um ?? "—"}</Badge>
          {manualUnit ? <>
            <Badge variant="secondary">{manualUnit.code} · impostata manualmente</Badge>
            {editable ? <Button type="button" size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("base")}>Usa quella di Danea</Button> : null}
          </> : null}
        </div>
      </SettingRow>
    );
  }

  return (
    <SettingRow title="U.M. del prezzo" info="Tutti i listini del prodotto si leggono su questa U.M. Il prezzo resta lo stesso qualunque formato il cliente ordini; peso e totale definitivi nascono dalla pesatura.">
      <Select
        value={product.price_unit_id ?? "base"}
        disabled={!editable || mutation.isPending}
        onValueChange={(value) => mutation.mutate(value)}
      >
        <SelectTrigger aria-label="U.M. del prezzo" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="base">Come U.M. base{product.danea_um ? ` (${product.danea_um})` : ""}</SelectItem>
          {companyUnits.filter((unit) => unit.status === "attivo").map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>{unit.code}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}

function ProductDetailContent({ product, archiveName, listName, isAdmin, cost, companyId, companyUnits, saleUnits, initialTab }: {
  product: ProductRow;
  archiveName: string;
  listName: (number: number) => string;
  isAdmin: boolean;
  cost: { supplier_name: string | null; supplier_code: string | null; supplier_product_code: string | null; supplier_net_price: number | null } | null | undefined;
  companyId: string | null;
  companyUnits: CompanyUnit[];
  saleUnits: ProductSaleUnit[];
  initialTab: ProductDetailTab;
}) {
  const [daneaOpen, setDaneaOpen] = useState(false);
  return <>
    <SheetHeader className="pr-8 text-left">
      <div className="flex items-center gap-2"><Badge variant="outline">{product.danea_internal_id ? "Danea" : "Interno"}</Badge><span className="font-mono text-xs text-muted-foreground">{product.code}</span></div>
      <SheetTitle>{product.description ?? product.code}</SheetTitle>
    </SheetHeader>
    <TooltipProvider delayDuration={150}>
      <Tabs defaultValue={initialTab} className="mt-3 gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="prodotto">Prodotto</TabsTrigger>
          <TabsTrigger value="vendita">Vendita</TabsTrigger>
          <TabsTrigger value="acquisto">Acquisto</TabsTrigger>
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
        </TabsList>

        {/* Prodotto: anagrafica generale e dati originali Danea. */}
        <TabsContent value="prodotto" className="space-y-3">
          <ProductImageManager productId={product.id} image={product.product_images ?? null} editable={isAdmin} top />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Codice" value={product.code} />
            <Field label="U.M. base" value={product.danea_um ?? "—"} />
            <Field label="Descrizione" value={product.description ?? "—"} />
            <Field label="Categoria" value={product.category ?? "—"} />
            <Field label="Sottocategoria" value={product.subcategory ?? "—"} />
            <Field label="Archivio" value={archiveName} />
            <Field label="Origine" value={product.danea_internal_id ? "Danea" : "Creato in Trevi Fruit"} />
            <Field label="Stato" value={product.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato"} />
          </dl>
          <Collapsible open={daneaOpen} onOpenChange={setDaneaOpen} className="border-t border-border pt-2">
            <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="w-full justify-between px-0 text-sm font-semibold" aria-label={`${daneaOpen ? "Chiudi" : "Apri"} dati Danea`}>Dati Danea <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">Sola lettura<ChevronDown className={`transition-transform ${daneaOpen ? "rotate-180" : ""}`} /></span></Button></CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="InternalID" value={product.danea_internal_id ?? "—"} />
                <Field label="IVA" value={product.vat_perc !== null ? `${product.vat_perc}% ${product.vat_description ?? ""}`.trim() : product.vat_code ?? "—"} />
                <Field label="Ultimo aggiornamento" value={dateTime(product.last_received_at)} />
                <Field label="Barcode" value={product.barcode ?? "—"} />
                <Field label="Produttore" value={product.producer_name ?? "—"} />
                <Field label="Tipo prodotto" value={product.product_type ?? "—"} />
                <Field label="Note" value={product.notes ?? "—"} />
                <Field label="Nome immagine" value={product.image_file_name ?? "—"} />
              </dl>
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>

        {/* Vendita: vetrina, disponibilità, U.M. del prezzo, U.M. ordinabili, listini. */}
        <TabsContent value="vendita" className="space-y-3">
          {companyId ? (
            <div className="divide-y divide-border/60 rounded-lg border border-border px-3">
              <ShowcaseToggle product={product} companyId={companyId} editable={isAdmin} />
              <AvailabilitySelector product={product} companyId={companyId} editable={isAdmin} />
              <PriceUnitSelector product={product} companyId={companyId} companyUnits={companyUnits} editable={isAdmin} />
            </div>
          ) : null}
          <section className="border-t border-border pt-2">
            <h3 className="text-sm font-semibold">Listini</h3>
            {product.product_prices.length ? <div className="mt-1 divide-y divide-border">
              {[...product.product_prices].sort((a, b) => a.list_number - b.list_number).map((price) => (
                <div key={price.list_number} className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-muted-foreground">{listName(price.list_number)}</span><span>{euro(price.net_price)}{price.gross_price !== null ? ` · ivato ${euro(price.gross_price)}` : ""}</span></div>
              ))}
            </div> : <p className="mt-1 text-sm text-muted-foreground">Nessun prezzo ricevuto.</p>}
          </section>
        </TabsContent>

        {/* Acquisto: fornitori, referenze, priorità, U.M. acquistabili, costi. */}
        <TabsContent value="acquisto" className="space-y-3">
          <section aria-labelledby="purchase-units-title">
            <h3 id="purchase-units-title" className="text-sm font-semibold">U.M. di acquisto</h3>
            <PurchaseUnitsOverview productId={product.id} />
          </section>
          {/* U.M. ordinabili: gestite qui, nel contesto d'acquisto. */}
          {companyId ? <SalesUnitManager companyId={companyId} productId={product.id} daneaUm={product.danea_um} units={companyUnits} assignments={saleUnits} editable={isAdmin} showPurchase={false} /> : null}

          {companyId ? <ProductSuppliersManager companyId={companyId} productId={product.id} productArchiveId={product.archive_id} daneaUm={product.danea_um} units={companyUnits} editable={isAdmin} /> : null}

          {isAdmin ? <section className="border-t border-border pt-2"><h3 className="text-sm font-semibold">Costo ricevuto da Danea</h3><dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2"><Field label="Fornitore" value={cost?.supplier_name ?? product.supplier_name ?? "—"} /><Field label="Codice fornitore" value={cost?.supplier_code ?? product.supplier_code ?? "—"} /><Field label="Codice prodotto" value={cost?.supplier_product_code ?? product.supplier_product_code ?? "—"} /><Field label="Costo netto" value={euro(cost?.supplier_net_price)} /></dl></section> : null}
        </TabsContent>

        {/* Inventario: giacenza, zone, scorta minima, fabbisogno, conteggi e provenienze dei carichi. */}
        <TabsContent value="inventario" className="space-y-3">
          {companyId ? <ProductStockPanel companyId={companyId} productId={product.id} daneaUm={product.danea_um} units={companyUnits} editable={isAdmin} /> : null}
          {companyId ? <ProductProvenancePanel productId={product.id} editable={isAdmin} /> : null}
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  </>;
}

export function ProductDetailSheet({
  product,
  archiveName,
  listName,
  isAdmin,
  cost,
  onClose,
  companyId,
  companyUnits,
  saleUnits,
  initialTab = "prodotto",
}: {
  product: ProductRow | null;
  archiveName: string;
  listName: (number: number) => string;
  isAdmin: boolean;
  cost?: { supplier_name: string | null; supplier_code: string | null; supplier_product_code: string | null; supplier_net_price: number | null } | null;
  onClose: () => void;
  companyId: string | null;
  companyUnits: CompanyUnit[];
  saleUnits: ProductSaleUnit[];
  /** Tab iniziale: Vendite → Prodotti apre "vendita", Acquisti → Prodotti apre "acquisto". */
  initialTab?: ProductDetailTab;
}) {
  return (
    <Sheet open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto p-4 sm:w-[560px] sm:max-w-[560px] sm:p-6">
        {product ? <ProductDetailContent key={product.id} product={product} archiveName={archiveName} listName={listName} isAdmin={isAdmin} cost={cost} companyId={companyId} companyUnits={companyUnits} saleUnits={saleUnits} initialTab={initialTab} /> : null}
      </SheetContent>
    </Sheet>
  );
}
