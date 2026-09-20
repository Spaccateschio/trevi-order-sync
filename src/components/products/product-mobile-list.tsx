import { Check, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  columnLabel,
  formatGridValue,
  type ProductColumn,
  type ProductRow,
} from "@/lib/product-grid";
import { cn } from "@/lib/utils";

const CORE_FIELDS = new Set(["code", "description", "image"]);

/**
 * Elenco prodotti per smartphone: i campi mostrati derivano dalle stesse
 * preferenze "Colonne" (salvate per dispositivo in user_grid_preferences),
 * mantenendo comunque foto, selezione, nome prodotto e prezzo in evidenza.
 */
export function ProductMobileList({
  products,
  selectedIds,
  imageUrls,
  columns,
  archives,
  listName,
  onSelect,
  onOpen,
}: {
  products: ProductRow[];
  selectedIds: Set<string>;
  imageUrls?: Map<string, string>;
  columns: ProductColumn[];
  archives: Map<string, string>;
  listName?: (number: number) => string;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (product: ProductRow) => void;
}) {
  const priceColumn = columns.find((column) => column.id.startsWith("price_"));
  const extraColumns = columns.filter(
    (column) => !CORE_FIELDS.has(column.id) && column.id !== priceColumn?.id,
  );
  const showCode = columns.some((column) => column.id === "code");
  const showDescription = columns.some((column) => column.id === "description");

  return (
    <div className="divide-y divide-border border-y border-border md:hidden">
      <div className="flex items-center justify-between gap-3 px-1 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="min-w-0 truncate">Codice / Descrizione</span>
        {priceColumn ? (
          <span className="shrink-0">{columnLabel(priceColumn, listName)}</span>
        ) : null}
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
                  {showCode ? <p className="truncate font-mono text-xs font-semibold">{product.code}</p> : null}
                  {showDescription || !showCode ? (
                    <p className="line-clamp-2 text-sm font-medium">{product.description ?? "—"}</p>
                  ) : null}
                </div>
                {priceColumn ? (
                  <span className="shrink-0 text-sm font-semibold">
                    {formatGridValue(priceColumn, priceColumn.value(product, archives))}
                  </span>
                ) : null}
              </div>
              {extraColumns.length ? (
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {extraColumns.map((column) => (
                    <span key={column.id} className="min-w-0 max-w-full truncate">
                      <span className="font-medium">{columnLabel(column, listName)}:</span>{" "}
                      {formatGridValue(column, column.value(product, archives))}
                    </span>
                  ))}
                  {checked ? <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                </div>
              ) : checked ? (
                <div className="mt-1.5 flex justify-end"><Check className="h-3.5 w-3.5 text-primary" /></div>
              ) : null}
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
