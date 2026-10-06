import { Check, Lock, MoreVertical, Package, Plus, Star, Trash2, TriangleAlert, Truck, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ALL_VISIBLE, type DisplayPrefs } from "./card-display";
import { CardSuppliers } from "./card-suppliers";
import type { RowExtras } from "./use-shopping-list-extras";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
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
const PRODUCT_UNIT = "__prodotto__";

type UnitOption = { key: string; unitId: string | null; code: string; factor: number | null };

/**
 * U.M. per «Da acquistare»: U.M. del prodotto + U.M. già configurate sui fornitori collegati (anche manuali), senza doppioni.
 * L'equivalente si mostra solo se TUTTI i fornitori che offrono quella U.M. hanno la stessa conversione: mai applicare
 * la conversione di un fornitore agli altri.
 */
function useDecidedUnitOptions(itemId: string, enabled: boolean, manualCodes: string[]) {
  const query = useQuery({
    queryKey: ["shopping-item-supplier-units", itemId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shopping_item_supplier_units", { _item_id: itemId });
      if (error) throw new Error(error.message);
      return Object.fromEntries(
        ((data ?? []) as unknown as { link_id: string; units: { unit_id: string; code: string; conversion_factor: number | null }[] }[]).map((r) => [r.link_id, r]),
      );
    },
  });
  const byUnit = new Map<string, { code: string; factors: (number | null)[] }>();
  for (const link of Object.values(query.data ?? {})) {
    for (const u of link.units ?? []) {
      const entry = byUnit.get(u.unit_id) ?? { code: u.code, factors: [] };
      entry.factors.push(u.conversion_factor === null || u.conversion_factor === undefined ? null : Number(u.conversion_factor));
      byUnit.set(u.unit_id, entry);
    }
  }
  const options: UnitOption[] = [];
  const seen = new Set<string>();
  for (const [unitId, { code, factors }] of byUnit) {
    const first = factors[0];
    const certain = first !== null && factors.every((f) => f === first);
    options.push({ key: unitId, unitId, code, factor: certain ? (first ?? null) : null });
    seen.add(code.trim().toUpperCase());
  }
  for (const raw of manualCodes) {
    const code = raw.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    options.push({ key: `m:${code}`, unitId: null, code, factor: null });
  }
  return options;
}

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
  onUnitChange,
  onClearQuantity,
  pending = false,
  pendingQuantity,
  show = ALL_VISIBLE,
}: {
  /** Prodotto dell'inventario non ancora in Lista: stessa card, comandi della Lista non ancora attivi. */
  pending?: boolean;
  /** Quantità scritta su un prodotto «Da valutare» (serve solo ad abilitare Conferma). */
  pendingQuantity?: number | null;
  /** «Visualizza dati»: nasconde solo informazioni, non cambia dati né comandi salvati. */
  show?: DisplayPrefs;
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
  /** Cambio U.M. di «Da acquistare»: (null, null) = U.M. del prodotto. */
  onUnitChange?: (unitId: string | null, unitCode: string | null) => void;
  /** Svuota la quantità «Da acquistare» (obiettivo non indicato, mai 0). */
  onClearQuantity?: () => void;
}) {
  const name = row.description ?? row.code;
  const unit = row.unit_code ?? "";
  const suppliers = extra?.suppliers ?? [];
  const unitOptions = useDecidedUnitOptions(
    row.item_id,
    !pending && Boolean(onUnitChange),
    suppliers.filter((s) => !s.purchaseUnitId && s.purchaseUnitCode).map((s) => s.purchaseUnitCode as string),
  ).filter((o) => o.code.trim().toLowerCase() !== unit.trim().toLowerCase());
  const decidedKey = extra?.decidedUnitId
    ? extra.decidedUnitId
    : extra?.decidedUnitCode
      ? `m:${extra.decidedUnitCode.trim().toUpperCase()}`
      : PRODUCT_UNIT;
  const decidedOption = unitOptions.find((o) => o.key === decidedKey) ?? null;
  const otherUnit = decidedKey !== PRODUCT_UNIT;
  const decidedCode = otherUnit ? (decidedOption?.code ?? extra?.decidedUnitCode ?? "") : unit;
  const unitLabel = decidedCode.trim().toLowerCase();
  const suggested = row.current_suggested ?? row.suggested_quantity;
  const isFavorite = Boolean(extra?.isFavorite);
  const isRow = layout === "row";
  // Quantità confermata: bloccata finché non si sblocca (fornitori restano modificabili).
  const locked = Boolean(extra?.lockedAt);
  // Inventario modificato dopo la conferma: card da ricontrollare (mai se la riga è già in un ordine).
  const recheck = Boolean(extra?.inventoryChangedAt) && extra?.orderState !== "ordinato";

  // Senza conversione l'equivalente non esiste: non si somma e non si inventa.
  const assigned = suppliers.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const target = row.decided_quantity === null ? null : Number(row.decided_quantity);
  // Quantità in altra U.M.: nessun confronto in U.M. prodotto (mai 3 casse → 3 kg).
  const gap = target === null || otherUnit ? null : Math.round((target - assigned) * 1000) / 1000;
  const equivalent = otherUnit && target !== null && decidedOption?.factor ? target * decidedOption.factor : null;

  const image = (cls: string) =>
    extra?.imageUrl ? (
      <img src={extra.imageUrl} alt="" loading="lazy" className={cn("shrink-0 rounded-sm border border-border object-cover", cls)} />
    ) : (
      <span className={cn("flex shrink-0 items-center justify-center rounded-sm border border-border bg-muted", cls)}>
        <Package className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    );

  const statusBadge = !show.status && !show.assignStatus ? null : pending ? (
    show.status ? (
      <span className="rounded-sm bg-primary/20 px-1.5 py-1 text-[9px] font-bold uppercase leading-none text-foreground">Da valutare</span>
    ) : null
  ) : (
    <span className="flex items-center gap-1">
      {show.status ? (
        <span className="rounded-sm border border-border px-1.5 py-1 text-[9px] font-bold uppercase leading-none">In lista</span>
      ) : null}
      {show.assignStatus ? (
        <span
          className={cn(
            "rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none",
            row.status === "assegnata" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {ITEM_STATUS_LABEL[row.status]}
        </span>
      ) : null}
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
      {editable && onClearQuantity && target !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-7 shrink-0 px-0 text-muted-foreground"
          aria-label={`Cancella la quantità da acquistare di ${name}`}
          title="Cancella la quantità"
          disabled={locked || lockPending}
          onClick={onClearQuantity}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
      {editable && !pending && onUnitChange ? (
        <Select
          value={decidedKey}
          disabled={locked || lockPending}
          onValueChange={(key) => {
            if (key === PRODUCT_UNIT) return onUnitChange(null, null);
            const option = unitOptions.find((o) => o.key === key);
            if (option) onUnitChange(option.unitId, option.code);
          }}
        >
          <SelectTrigger className="h-9 w-auto min-w-16 max-w-28 shrink-0 px-2 text-xs font-semibold" aria-label={`U.M. da acquistare ${name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value={PRODUCT_UNIT}>{unit || "U.M. prodotto"}</SelectItem>
            {unitOptions.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.code}
              </SelectItem>
            ))}
            {otherUnit && !decidedOption && extra?.decidedUnitCode ? (
              <SelectItem value={decidedKey}>{extra.decidedUnitCode}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      ) : (
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{decidedCode || "—"}</span>
      )}
      {lockButton}
    </div>
  );
  const equivalentNote =
    otherUnit && target !== null ? (
      <p className="text-[11px] leading-tight text-muted-foreground">
        {equivalent !== null ? `≈ ${qty(equivalent)} ${unit}` : "Non convertibile"}
      </p>
    ) : null;

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

  const recheckNote = recheck ? (
    <p className="flex items-center gap-1 text-[10px] font-semibold text-warning-foreground">
      <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
      Inventario cambiato: prima {extra?.inventoryPreviousQuantity !== null && extra?.inventoryPreviousQuantity !== undefined ? qty(extra.inventoryPreviousQuantity) : "—"}
      {stock?.lastQuantity !== null && stock?.lastQuantity !== undefined ? `, ora ${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}` : ""}
    </p>
  ) : null;

  const totals =
    suppliers.length && target !== null ? (
      <p
        className={cn(
          "text-[11px] font-semibold leading-tight",
          gap !== null && gap < 0 && "text-destructive",
          gap === 0 && "text-success",
        )}
      >
        {otherUnit
          ? `Da acquistare ${qty(target)} ${decidedCode}`
          : `Assegnato ${qty(assigned)} / ${qty(target)} ${unit}`}
        {otherUnit ? "" : gap === null || gap === 0 ? " · completo" : gap > 0 ? "" : ` · Eccedenza +${qty(-gap)} ${unit}`}
      </p>
    ) : suppliers.length ? (
      <p className="text-[11px] leading-tight text-muted-foreground">Assegnato {qty(assigned)} {unit} · obiettivo non indicato</p>
    ) : null;

  const splitSummary = (
    <CardSuppliers
      companyId={companyId}
      row={row}
      pending={pending}
      editable={editable}
      assignments={suppliers}
      show={show}
      target={locked ? target : null}
      decidedUnitId={otherUnit ? (extra?.decidedUnitId ?? null) : null}
      decidedCode={decidedCode}
      lockedAt={extra?.lockedAt ?? null}
    />
  );

  const orderState =
    extra?.orderState === "ordinato" ? (
      <p className="text-[11px] font-semibold text-success">In ordine</p>
    ) : extra?.orderState === "in_parte" ? (
      <p className="text-[11px] font-semibold text-muted-foreground">In parte in ordine</p>
    ) : null;

  if (isRow) {
    const rowMeta = [
      show.category ? extra?.category ?? "—" : null,
      show.suggested ? `Suggerita ${suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}` : null,
      show.stock && stock?.stock !== null && stock?.stock !== undefined ? `Giacenza ${qty(stock.stock)} ${unit}` : null,
      show.lastCount && stock?.lastQuantity !== null && stock?.lastQuantity !== undefined
        ? `Ult. conteggio ${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}`
        : null,
    ].filter(Boolean);
    return (
      <article id={`item-${row.item_id}`} className={cn("@container min-w-0 rounded-md border-2 border-border bg-card px-2 py-1.5", locked && "border-primary/60 bg-primary/15", recheck && "border-warning bg-warning/10")}>
        <div
          className={cn(
            "grid items-center gap-x-2 gap-y-1.5",
            show.photo
              ? "grid-cols-[36px_minmax(0,1fr)_auto] @min-[860px]:grid-cols-[36px_minmax(0,1.2fr)_minmax(250px,1fr)_minmax(0,1.2fr)_auto]"
              : "grid-cols-[minmax(0,1fr)_auto] @min-[860px]:grid-cols-[minmax(0,1.2fr)_minmax(250px,1fr)_minmax(0,1.2fr)_auto]",
          )}
        >
          {show.photo ? image("size-9") : null}
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold uppercase leading-tight" title={name}>
              {show.code ? <span className="text-muted-foreground">{row.code} · </span> : null}
              {name}
            </p>
            {rowMeta.length ? <p className="truncate text-[11px] leading-tight text-muted-foreground">{rowMeta.join(" · ")}</p> : null}
          </div>
          <div className="flex items-center justify-end gap-0.5 @min-[860px]:order-2">
            {statusBadge}
            {actions}
          </div>
          <div className={cn("grid min-w-0 gap-1 @min-[860px]:col-span-1", show.photo ? "col-span-3" : "col-span-2")}>
            {show.toBuy ? quantityBlock : null}
            {show.toBuy ? equivalentNote : null}
            {show.quick ? quickButtons("h-8") : null}
            {show.lockDate ? lockNote : null}
            {recheckNote}
          </div>
          <div className={cn("min-w-0 space-y-0.5 @min-[860px]:order-1 @min-[860px]:col-span-1", show.photo ? "col-span-3" : "col-span-2")}>
            {show.suppliers ? (
              <>
                {splitSummary}
                {show.splits ? totals : null}
                {orderState}
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  const anyStat = show.lastCount || show.stock || show.suggested;
  return (
    <article id={`item-${row.item_id}`} className={cn("@container flex h-full min-w-0 flex-col gap-1.5 rounded-md border-2 border-border bg-card p-2 @max-[260px]:p-1.5", locked && "border-primary/60 bg-primary/15", recheck && "border-warning bg-warning/10")}>
      <div className={cn("grid items-start gap-2 @max-[260px]:gap-1.5", show.photo ? "grid-cols-[44px_minmax(0,1fr)] @max-[260px]:grid-cols-[32px_minmax(0,1fr)]" : "grid-cols-1")}>
        {show.photo ? image("size-11 @max-[260px]:size-8") : null}
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight @max-[260px]:text-xs" title={name}>
            {name}
          </p>
          {show.code || (show.category && extra?.category) ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground @max-[260px]:text-[10px]">
              {[show.code ? `Cod. ${row.code}` : null, show.category ? extra?.category : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1">
        {statusBadge ?? <span />}
        <div className="flex items-center">{actions}</div>
      </div>

      {anyStat ? (
        <dl className="grid grid-flow-col auto-cols-fr gap-1 rounded-sm bg-muted/40 px-1.5 py-1 text-[10px] leading-tight">
          {show.lastCount ? (
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">Ult. conteggio</dt>
              <dd className="truncate font-semibold">
                {stock?.lastQuantity !== null && stock?.lastQuantity !== undefined ? `${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}` : "—"}
              </dd>
            </div>
          ) : null}
          {show.stock ? (
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">Giacenza</dt>
              <dd className="truncate font-semibold">{stock?.stock !== null && stock?.stock !== undefined ? `${qty(stock.stock)} ${unit}` : "—"}</dd>
            </div>
          ) : null}
          {show.suggested ? (
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">Suggerita</dt>
              <dd className="truncate font-semibold">{suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {show.toBuy || show.quick || (show.lockDate && lockNote) ? (
        <div className="space-y-1">
          {show.toBuy ? (
            <>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Da acquistare</p>
              {quantityBlock}
              {equivalentNote}
            </>
          ) : null}
          {show.quick ? quickButtons("h-8 @max-[260px]:h-7 @max-[260px]:text-[11px]") : null}
          {show.lockDate ? lockNote : null}
          {recheckNote}
        </div>
      ) : null}

      {show.suppliers ? (
        <div className="mt-auto space-y-1 border-t border-border pt-1.5">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Fornitori</p>
          {splitSummary}
          {show.splits ? totals : null}
          {orderState}
        </div>
      ) : null}
    </article>
  );
}
