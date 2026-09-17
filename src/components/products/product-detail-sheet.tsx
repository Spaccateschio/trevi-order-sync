import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dateTime, euro, type ProductRow } from "@/lib/product-grid";

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>;
}

export function ProductDetailSheet({
  product,
  archiveName,
  listName,
  isAdmin,
  cost,
  onClose,
}: {
  product: ProductRow | null;
  archiveName: string;
  listName: (number: number) => string;
  isAdmin: boolean;
  cost?: { supplier_name: string | null; supplier_code: string | null; supplier_product_code: string | null; supplier_net_price: number | null } | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto p-4 sm:w-[560px] sm:max-w-[560px] sm:p-6">
        {product ? <>
          <SheetHeader className="pr-8 text-left">
            <div className="flex items-center gap-2"><Badge variant="outline">Dati Danea</Badge><span className="font-mono text-xs text-muted-foreground">{product.code}</span></div>
            <SheetTitle>{product.description ?? product.code}</SheetTitle>
            <SheetDescription>Sola lettura. L’anagrafica si modifica in Danea Easyfatt.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
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
          </div>
        </> : null}
      </SheetContent>
    </Sheet>
  );
}