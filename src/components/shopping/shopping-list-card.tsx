import { MoreVertical, Package, Plus, Star, Trash2, Truck } from "lucide-react";
import type { ReactNode } from "react";

import type { RowExtras } from "./use-shopping-list-extras";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { qty } from "@/lib/inventory";
import { ITEM_STATUS_LABEL, type OverviewRow } from "@/lib/shopping-list";
import { cn } from "@/lib/utils";

export type StockInfo = {
  lastQuantity: number | null;
  lastUnit: string | null;
  lastAt: string | null;
  stock: number | null;
};

/**
 * Card della Lista della Spesa: stessa grafica delle card Inventario (codice separato, Inventario non toccato).
 * Il dato d'acquisto è quantità + U.M. d'acquisto per fornitore; la quantità in alto è l'obiettivo in U.M. di magazzino.
 */
export function ShoppingListCard({
  row,
  extra,
  stock,
  editable,
  quantityInput,
  onToggleFavorite,
  favoritePending,
  onOpenSuppliers,
  onRemove,
}: {
  row: OverviewRow;
  extra: RowExtras | undefined;
  stock: StockInfo | undefined;
  editable: boolean;
  quantityInput: ReactNode;
  onToggleFavorite: () => void;
  favoritePending: boolean;
  onOpenSuppliers: () => void;
  onRemove: () => void;
}) {
  const name = row.description ?? row.code;
  const unit = row.unit_code ?? "";
  const suppliers = extra?.suppliers ?? [];
  const suggested = row.current_suggested ?? row.suggested_quantity;
  const isFavorite = Boolean(extra?.isFavorite);

  return (
    <article className="flex h-full flex-col gap-2 rounded-md border-2 border-border bg-card p-2">
      <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2">
        {extra?.imageUrl ? (
          <img src={extra.imageUrl} alt="" loading="lazy" className="size-12 rounded-sm border border-border object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-sm border border-border bg-muted">
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold uppercase leading-tight" title={name}>{name}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Cod. {row.code}
            {unit ? ` · ${unit}` : ""}
          </p>
          {extra?.category ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{extra.category}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 px-0", isFavorite && "text-primary")}
            aria-label={isFavorite ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
            title={isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            disabled={favoritePending}
            onClick={onToggleFavorite}
          >
            <Star className={cn("size-3.5", isFavorite && "fill-current")} />
          </Button>
          <span
            className={cn(
              "rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none",
              row.status === "assegnata" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {ITEM_STATUS_LABEL[row.status]}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 px-0" aria-label={`Altre azioni ${row.code}`}>
                <MoreVertical aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenSuppliers}>
                <Truck aria-hidden="true" />
                Fornitori e ripartizione
              </DropdownMenuItem>
              {editable ? (
                <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                  <Trash2 aria-hidden="true" />
                  Rimuovi dalla Lista
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-1 rounded-sm bg-muted/40 px-2 py-1 text-[11px] leading-tight">
        <div>
          <dt className="text-muted-foreground">Ultimo conteggio</dt>
          <dd className="font-semibold">
            {stock?.lastQuantity !== null && stock?.lastQuantity !== undefined
              ? `${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}`
              : "—"}
            {stock?.lastAt ? (
              <span className="block font-normal text-muted-foreground">
                {new Date(stock.lastAt).toLocaleDateString("it-IT")}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Giacenza</dt>
          <dd className="font-semibold">{stock?.stock !== null && stock?.stock !== undefined ? `${qty(stock.stock)} ${unit}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Suggerita</dt>
          <dd className="font-semibold">{suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}</dd>
        </div>
      </dl>

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Quantità da acquistare</p>
        <div className="flex items-center gap-2">
          {editable ? quantityInput : <span className="text-sm font-semibold">{row.decided_quantity === null ? "—" : qty(row.decided_quantity)}</span>}
          <span className="text-xs text-muted-foreground">{unit || "—"} (obiettivo)</span>
        </div>
      </div>

      <div className="mt-auto space-y-1">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Fornitore</p>
        {suppliers.length ? (
          <ul className="space-y-0.5 text-xs">
            {suppliers.map((supplier) => (
              <li key={`${supplier.linkId}-${supplier.purchaseUnitCode ?? ""}`} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate font-medium">{supplier.name}</span>
                <span className="shrink-0 font-semibold">
                  {supplier.purchaseQuantity !== null
                    ? `${qty(supplier.purchaseQuantity)} ${supplier.purchaseUnitCode ?? ""}`
                    : `${qty(supplier.quantity)} ${unit}`}
                </span>
                {supplier.isB2B ? (
                  <span className="shrink-0 rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold leading-4">B2B</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : row.suppliers_available > 0 ? (
          <p className="text-xs text-muted-foreground">
            {row.suppliers_available} fornitor{row.suppliers_available === 1 ? "e disponibile" : "i disponibili"}, nessuno scelto
          </p>
        ) : (
          <p className="text-xs font-medium">Fornitore da definire</p>
        )}
        {extra?.orderState === "ordinato" ? (
          <p className="text-[11px] font-semibold text-success">In ordine</p>
        ) : extra?.orderState === "in_parte" ? (
          <p className="text-[11px] font-semibold text-muted-foreground">In parte in ordine</p>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {row.suppliers_available > 0 || suppliers.length ? (
            <Button type="button" size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" onClick={onOpenSuppliers}>
              <Truck aria-hidden="true" />
              {suppliers.length ? "Modifica ripartizione" : "Scegli fornitore"}
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" disabled title="Disponibile a breve">
                <Plus aria-hidden="true" />
                Associa fornitore
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8 flex-1 px-2 text-xs" disabled title="Disponibile a breve">
                Acquisto manuale
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
