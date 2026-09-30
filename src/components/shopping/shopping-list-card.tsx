import { Check, Lock, MoreVertical, Package, Plus, Star, Trash2, Truck } from "lucide-react";
import type { ReactNode } from "react";

import { CardSuppliers } from "./card-suppliers";
import type { RowExtras } from "./use-shopping-list-extras";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dateTimeShort, qty } from "@/lib/inventory";
import { ITEM_STATUS_LABEL, type OverviewRow } from "@/lib/shopping-list";
import { cn } from "@/lib/utils";

export type StockInfo = {
  lastQuantity: number | null;
  lastUnit: string | null;
  lastAt: string | null;
  stock: number | null;
};

const QUICK_STEPS = [1, 3, 5, 10] as const;

/**
 * Card / Riga della Lista della Spesa: stessi dati e stessi comandi, cambia solo la disposizione.
 * Quantità da acquistare = obiettivo in U.M. di magazzino; le ripartizioni sono quantità + U.M. d'acquisto per fornitore
 * e non vengono mai modificate dai tasti rapidi.
 */
export function ShoppingListCard({
  companyId,
  row,
  extra,
  stock,
  editable,
  layout = "card",
  quantityInput,
  onQuickAdd,
  onToggleFavorite,
  favoritePending,
  onOpenSuppliers,
  onRemove,
  onToggleLock,
  lockPending = false,
  pending = false,
  pendingQuantity,
}: {
  /** Prodotto dell'inventario non ancora in Lista: stessa card, comandi della Lista non ancora attivi. */
  pending?: boolean;
  /** Quantità scritta su un prodotto «Da valutare» (serve solo ad abilitare Conferma). */
  pendingQuantity?: number | null;
  companyId: string;
  row: OverviewRow;
  extra: RowExtras | undefined;
  stock: StockInfo | undefined;
  editable: boolean;
  layout?: "card" | "row";
  quantityInput: ReactNode;
  onQuickAdd: (step: number) => void;
  onToggleFavorite: () => void;
  favoritePending: boolean;
  onOpenSuppliers: () => void;
  onRemove: () => void;
  onToggleLock: () => void;
  lockPending?: boolean;
}) {
  const name = row.description ?? row.code;
  const unit = row.unit_code ?? "";
  const unitLabel = unit.trim().toLowerCase();
  const suppliers = extra?.suppliers ?? [];
  const suggested = row.current_suggested ?? row.suggested_quantity;
  const isFavorite = Boolean(extra?.isFavorite);
  const isRow = layout === "row";
  // Quantità confermata: bloccata finché non si sblocca (fornitori restano modificabili).
  const locked = Boolean(extra?.lockedAt);

  // Senza conversione l'equivalente non esiste: non si somma e non si inventa.
  const assigned = suppliers.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const target = row.decided_quantity === null ? null : Number(row.decided_quantity);
  const gap = target === null ? null : Math.round((target - assigned) * 1000) / 1000;

  const image = (cls: string) =>
    extra?.imageUrl ? (
      <img src={extra.imageUrl} alt="" loading="lazy" className={cn("shrink-0 rounded-sm border border-border object-cover", cls)} />
    ) : (
      <span className={cn("flex shrink-0 items-center justify-center rounded-sm border border-border bg-muted", cls)}>
        <Package className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    );

  const statusBadge = pending ? (
    <span className="rounded-sm bg-primary/20 px-1.5 py-1 text-[9px] font-bold uppercase leading-none text-foreground">Da valutare</span>
  ) : (
    <span className="flex items-center gap-1">
    <span className="rounded-sm border border-border px-1.5 py-1 text-[9px] font-bold uppercase leading-none">In lista</span>
    <span
      className={cn(
        "rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none",
        row.status === "assegnata" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {ITEM_STATUS_LABEL[row.status]}
    </span>
    </span>
  );

  const actions = (
    <>
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
      {pending ? null : (
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
          {editable && (row.suppliers_available > 0 || suppliers.length) ? (
            <DropdownMenuItem onClick={onOpenSuppliers}>
              <Plus aria-hidden="true" />
              Aggiungi fornitore
            </DropdownMenuItem>
          ) : null}
          {editable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                <Trash2 aria-hidden="true" />
                Rimuovi dalla Lista
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      )}
    </>
  );

  const confirmTarget = pending ? (pendingQuantity ?? null) : target;
  const lockButton = editable ? (
    <Button
      type="button"
      size="sm"
      variant={locked ? "secondary" : "default"}
      className="h-9 shrink-0 gap-1 px-2 text-xs"
      disabled={lockPending || (!locked && (confirmTarget === null || confirmTarget <= 0))}
      aria-label={locked ? `Sblocca quantità di ${name}` : `Conferma quantità di ${name}`}
      title={locked ? "Sblocca per modificare" : confirmTarget === null ? "Inserisci una quantità" : "Conferma e blocca"}
      onClick={onToggleLock}
    >
      {locked ? <Lock className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
      <span className="hidden min-[360px]:inline">{locked ? "Sblocca" : "Conferma"}</span>
    </Button>
  ) : null;

  const quantityBlock = (
    <div className="flex min-w-0 items-center gap-1.5">
      {editable ? quantityInput : <span className="text-sm font-semibold">{target === null ? "—" : qty(target)}</span>}
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{unit || "—"}</span>
      {lockButton}
    </div>
  );

  const quickButtons = (cls: string) =>
    editable ? (
      <div className="grid grid-cols-4 gap-1">
        {QUICK_STEPS.map((step) => (
          <Button
            key={step}
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-w-0 gap-0.5 overflow-hidden px-0 text-xs font-bold", cls)}
            aria-label={`Aggiungi ${step} ${unitLabel} alla quantità da acquistare di ${name}`}
            disabled={locked}
            onClick={() => onQuickAdd(step)}
          >
            +{step}
            {unitLabel ? <span className="font-semibold">{unitLabel}</span> : null}
          </Button>
        ))}
      </div>
    ) : null;

  const lockNote = locked && extra?.lockedAt ? (
    <p className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
      <Lock className="size-3" aria-hidden="true" /> Confermata {dateTimeShort(extra.lockedAt)}
    </p>
  ) : null;

  const totals =
    suppliers.length && target !== null ? (
      <p
        className={cn(
          "text-[11px] font-semibold leading-tight",
          gap !== null && gap < 0 && "text-destructive",
          gap === 0 && "text-success",
          gap !== null && gap > 0 && "text-primary",
        )}
      >
        Assegnato {qty(assigned)} / {qty(target)} {unit}
        {gap === null || gap === 0 ? " · completo" : gap > 0 ? ` · Mancano ${qty(gap)} ${unit}` : ` · Eccedenza +${qty(-gap)} ${unit}`}
      </p>
    ) : suppliers.length ? (
      <p className="text-[11px] leading-tight text-muted-foreground">Assegnato {qty(assigned)} {unit} · obiettivo non indicato</p>
    ) : null;

  const splitSummary = (
    <CardSuppliers companyId={companyId} row={row} pending={pending} editable={editable} assignments={suppliers} />
  );

  const orderState =
    extra?.orderState === "ordinato" ? (
      <p className="text-[11px] font-semibold text-success">In ordine</p>
    ) : extra?.orderState === "in_parte" ? (
      <p className="text-[11px] font-semibold text-muted-foreground">In parte in ordine</p>
    ) : null;

  if (isRow) {
    return (
      <article className={cn("@container min-w-0 rounded-md border-2 border-border bg-card px-2 py-1.5", locked && "border-primary/60 bg-primary/15")}>
        <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 @min-[860px]:grid-cols-[36px_minmax(0,1.2fr)_minmax(250px,1fr)_minmax(0,1.2fr)_auto]">
          {image("size-9")}
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold uppercase leading-tight" title={name}>
              <span className="text-muted-foreground">{row.code}</span> · {name}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {extra?.category ?? "—"} · Suggerita {suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}
            </p>
          </div>
          <div className="flex items-center justify-end gap-0.5 @min-[860px]:order-2">
            {statusBadge}
            {actions}
          </div>
          <div className="col-span-3 grid min-w-0 gap-1 @min-[860px]:col-span-1">
            {quantityBlock}
            {quickButtons("h-8")}
            {lockNote}
          </div>
          <div className="col-span-3 min-w-0 space-y-0.5 @min-[860px]:order-1 @min-[860px]:col-span-1">
            {splitSummary}
            {totals}
            {orderState}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("@container flex h-full min-w-0 flex-col gap-1.5 rounded-md border-2 border-border bg-card p-2 @max-[260px]:p-1.5", locked && "border-primary/60 bg-primary/15")}>
      <div className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-2 @max-[260px]:grid-cols-[32px_minmax(0,1fr)] @max-[260px]:gap-1.5">
        {image("size-11 @max-[260px]:size-8")}
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight @max-[260px]:text-xs" title={name}>
            {name}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground @max-[260px]:text-[10px]">
            Cod. {row.code}
            {extra?.category ? ` · ${extra.category}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1">
        {statusBadge}
        <div className="flex items-center">{actions}</div>
      </div>

      <dl className="grid grid-cols-3 gap-1 rounded-sm bg-muted/40 px-1.5 py-1 text-[10px] leading-tight">
        <div className="min-w-0">
          <dt className="truncate text-muted-foreground">Ult. conteggio</dt>
          <dd className="truncate font-semibold">
            {stock?.lastQuantity !== null && stock?.lastQuantity !== undefined ? `${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}` : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-muted-foreground">Giacenza</dt>
          <dd className="truncate font-semibold">{stock?.stock !== null && stock?.stock !== undefined ? `${qty(stock.stock)} ${unit}` : "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-muted-foreground">Suggerita</dt>
          <dd className="truncate font-semibold">{suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}</dd>
        </div>
      </dl>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Da acquistare</p>
        {quantityBlock}
        {quickButtons("h-8 @max-[260px]:h-7 @max-[260px]:text-[11px]")}
        {lockNote}
      </div>

      <div className="mt-auto space-y-1 border-t border-border pt-1.5">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Fornitori</p>
        {splitSummary}
        {totals}
        {orderState}
      </div>
    </article>
  );
}
