import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AVAILABILITY_LABELS, dateTime, euro, type ProductRow } from "@/lib/product-grid";
import { SalesUnitManager, type CompanyUnit, type ProductSaleUnit } from "./sales-unit-manager";
import { ProductImageManager } from "./product-image-manager";
import { ProductSuppliersManager } from "./product-suppliers-manager";
import { ProductProvenancePanel } from "./product-provenance-panel";
import { ProductStockPanel } from "./product-stock-panel";

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>;
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
    <section className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-semibold">In vetrina B2B</p>
        <p className="text-xs text-muted-foreground">
          Se attivo, i clienti collegati vedono questo prodotto nel tuo catalogo. Non cambia nulla in Danea.
        </p>
      </div>
      <Switch
        checked={product.b2b_visible}
        disabled={!editable || mutation.isPending}
        onCheckedChange={(value) => mutation.mutate(value)}
        aria-label="In vetrina B2B"
      />
    </section>
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
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-semibold">Disponibilità commerciale</p>
        <p className="text-xs text-muted-foreground">
          Decide se e come il cliente può ordinare. Scelta manuale: non cambia in base a giacenza, fabbisogno o fornitori.
        </p>
      </div>
      <Select
        value={product.commercial_availability}
        disabled={!editable || mutation.isPending}
        onValueChange={(value) => mutation.mutate(value as ProductRow["commercial_availability"])}
      >
        <SelectTrigger aria-label="Disponibilità commerciale"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(AVAILABILITY_LABELS) as ProductRow["commercial_availability"][]).map((key) => (
            <SelectItem key={key} value={key}>{AVAILABILITY_LABELS[key]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}

function ProductDetailContent({ product, archiveName, listName, isAdmin, cost, companyId, companyUnits, saleUnits }: {
  product: ProductRow;
  archiveName: string;
  listName: (number: number) => string;
  isAdmin: boolean;
  cost: { supplier_name: string | null; supplier_code: string | null; supplier_product_code: string | null; supplier_net_price: number | null } | null | undefined;
  companyId: string | null;
  companyUnits: CompanyUnit[];
  saleUnits: ProductSaleUnit[];
}) {
  const [daneaOpen, setDaneaOpen] = useState(false);
  return <>
    <SheetHeader className="pr-8 text-left">
      <div className="flex items-center gap-2"><Badge variant="outline">Prodotto</Badge><span className="font-mono text-xs text-muted-foreground">{product.code}</span></div>
      <SheetTitle>{product.description ?? product.code}</SheetTitle>
      <SheetDescription>Configura le U.M. di vendita o consulta i dati originali Danea.</SheetDescription>
    </SheetHeader>
    <div className="mt-6 space-y-6">
      {companyId ? <ShowcaseToggle product={product} companyId={companyId} editable={isAdmin} /> : null}
      {companyId ? <AvailabilitySelector product={product} companyId={companyId} editable={isAdmin} /> : null}
      {companyId ? <SalesUnitManager companyId={companyId} productId={product.id} daneaUm={product.danea_um} units={companyUnits} assignments={saleUnits} editable={isAdmin} /> : null}
      {companyId ? <ProductSuppliersManager companyId={companyId} productId={product.id} productArchiveId={product.archive_id} daneaUm={product.danea_um} units={companyUnits} editable={isAdmin} /> : null}
      {companyId ? <ProductStockPanel companyId={companyId} productId={product.id} daneaUm={product.danea_um} units={companyUnits} editable={isAdmin} /> : null}
      {companyId ? <ProductProvenancePanel productId={product.id} editable={isAdmin} /> : null}
      <ProductImageManager productId={product.id} image={product.product_images ?? null} editable={isAdmin} />
      <Collapsible open={daneaOpen} onOpenChange={setDaneaOpen} className="border-t border-border pt-2">
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="w-full justify-between px-0 text-sm font-semibold" aria-label={`${daneaOpen ? "Chiudi" : "Apri"} dati Danea`}>Dati Danea <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">Sola lettura<ChevronDown className={`transition-transform ${daneaOpen ? "rotate-180" : ""}`} /></span></Button></CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Archivio" value={archiveName} />
            <Field label="InternalID" value={product.danea_internal_id ?? "—"} />
            <Field label="Categoria" value={product.category ?? "—"} />
            <Field label="Sottocategoria" value={product.subcategory ?? "—"} />
            <Field label="U.M. Danea" value={product.danea_um ?? "—"} />
            <Field label="IVA" value={product.vat_perc !== null ? `${product.vat_perc}% ${product.vat_description ?? ""}`.trim() : product.vat_code ?? "—"} />
            <Field label="Stato" value={product.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato"} />
            <Field label="Ultimo aggiornamento" value={dateTime(product.last_received_at)} />
          </dl>
          <section className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Listini ricevuti</h3>
            {product.product_prices.length ? <div className="mt-2 divide-y divide-border">
              {[...product.product_prices].sort((a, b) => a.list_number - b.list_number).map((price) => (
                <div key={price.list_number} className="flex justify-between gap-4 py-2 text-sm"><span className="text-muted-foreground">{listName(price.list_number)}</span><span>{euro(price.net_price)}{price.gross_price !== null ? ` · ivato ${euro(price.gross_price)}` : ""}</span></div>
              ))}
            </div> : <p className="mt-2 text-sm text-muted-foreground">Nessun prezzo ricevuto.</p>}
          </section>
          {isAdmin ? <section className="border-t border-border pt-4"><h3 className="text-sm font-semibold">Fornitore e costo</h3><dl className="mt-2 grid grid-cols-2 gap-3"><Field label="Fornitore" value={cost?.supplier_name ?? product.supplier_name ?? "—"} /><Field label="Codice fornitore" value={cost?.supplier_code ?? product.supplier_code ?? "—"} /><Field label="Codice prodotto" value={cost?.supplier_product_code ?? product.supplier_product_code ?? "—"} /><Field label="Costo netto" value={euro(cost?.supplier_net_price)} /></dl></section> : null}
          <section className="border-t border-border pt-4"><h3 className="text-sm font-semibold">Altri dati Danea</h3><dl className="mt-2 grid grid-cols-2 gap-3"><Field label="Note" value={product.notes ?? "—"} /><Field label="Nome immagine" value={product.image_file_name ?? "—"} /><Field label="Cartella immagine" value={product.image_folder ?? "—"} /><Field label="Barcode" value={product.barcode ?? "—"} /><Field label="Produttore" value={product.producer_name ?? "—"} /><Field label="Tipo prodotto" value={product.product_type ?? "—"} /></dl></section>
        </CollapsibleContent>
      </Collapsible>
    </div>
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
}) {
  return (
    <Sheet open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto p-4 sm:w-[560px] sm:max-w-[560px] sm:p-6">
        {product ? <ProductDetailContent key={product.id} product={product} archiveName={archiveName} listName={listName} isAdmin={isAdmin} cost={cost} companyId={companyId} companyUnits={companyUnits} saleUnits={saleUnits} /> : null}
      </SheetContent>
    </Sheet>
  );
}