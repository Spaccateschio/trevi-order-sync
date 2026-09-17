import { Check, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { euro, priceForList, type ProductRow } from "@/lib/product-grid";
import { cn } from "@/lib/utils";

export function ProductMobileList({
  products,
  selectedIds,
  imageUrls,
  onSelect,
  onOpen,
}: {
  products: ProductRow[];
  selectedIds: Set<string>;
  imageUrls?: Map<string, string>;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (product: ProductRow) => void;
}) {
  return (
    <div className="divide-y divide-border border-y border-border md:hidden">
      <div className="flex items-center justify-between gap-3 px-1 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="min-w-0 truncate">Codice / Descrizione</span>
        <span className="shrink-0">Listino 1</span>
      </div>
      {products.map((product) => {
        const checked = selectedIds.has(product.id);
        const url = imageUrls?.get(product.id);
        return (
          <div key={product.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-1 py-3", checked && "bg-accent/10")}>
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => onSelect(product.id, value === true)}
              aria-label={`Seleziona ${product.code}`}
              className="mt-1 h-5 w-5"
            />
            <button type="button" className="min-w-0 text-left" onClick={() => onOpen(product)}>
              <div className="flex min-w-0 items-start gap-2.5">
                {url ? (
                  <img src={url} alt={`Immagine di ${product.description ?? product.code}`} loading="lazy" className="h-11 w-11 shrink-0 rounded border border-border object-cover" />
                ) : (
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded border border-dashed border-border text-muted-foreground" aria-hidden="true"><ImageIcon className="h-4 w-4" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-semibold">{product.code}</p>
                  <p className="line-clamp-2 text-sm font-medium">{product.description ?? "—"}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{euro(priceForList(product, 1))}</span>
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate"><span className="font-medium">Categoria:</span> {product.category ?? "—"}</span>
                <span aria-hidden="true">·</span>
                <span className="shrink-0"><span className="font-medium">U.M.:</span> {product.danea_um ?? "—"}</span>
                {checked ? <Check className="ml-auto h-3.5 w-3.5 text-primary" /> : null}
              </div>
              {product.publish_status !== "pubblicato" ? (
                <Badge variant="secondary" className="mt-2">Non pubblicato</Badge>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}