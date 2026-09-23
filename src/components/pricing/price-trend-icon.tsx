import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Equal, Euro } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PRICE_SOURCE_LABEL,
  fetchPriceObservations,
  fetchSalePrices,
  priceDateShort,
  priceLabel,
  seriesCurrent,
  seriesPrevious,
  unitSuffix,
  type PriceSeriesRow,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Freccia dell'andamento: rossa in su, verde in giù, uguale giallo ocra. */
function DirectionMark({ row, className }: { row: PriceSeriesRow; className?: string }) {
  if (row.direction === "up") return <ArrowUp className={cn("text-destructive", className)} aria-hidden="true" />;
  if (row.direction === "down") return <ArrowDown className={cn("text-success", className)} aria-hidden="true" />;
  if (row.direction === "equal") return <Equal className={cn("text-warning", className)} aria-hidden="true" />;
  return null;
}

function deltaText(row: PriceSeriesRow) {
  if (!row.comparable || row.delta_amount === null) return null;
  const sign = Number(row.delta_amount) > 0 ? "+" : "";
  const percent =
    row.delta_percent === null ? null : `${sign}${Number(row.delta_percent).toFixed(1).replace(".", ",")}%`;
  return {
    amount: `${sign}${priceLabel(Number(row.delta_amount))}`,
    percent,
  };
}

/**
 * Icona € in sola lettura: nessun prezzo viene creato o modificato da qui.
 * Disponibile sugli articoli monitorati del catalogo e sui prodotti adottati.
 */
export function PriceTrendIcon({
  series,
  label = "Andamento prezzo",
  className,
  companyId,
  productId,
}: {
  series: PriceSeriesRow | null | undefined;
  label?: string;
  className?: string;
  /** Con azienda e prodotto il riquadro mostra anche i listini di vendita (sola lettura). */
  companyId?: string | null;
  productId?: string | null;
}) {
  const row = series && seriesCurrent(series) !== null ? series : null;
  const showSale = Boolean(companyId && productId);

  if (!row && !showSale) {
    return (
      <span
        className={cn("inline-grid h-7 w-7 place-items-center rounded-full text-muted-foreground/60", className)}
        title="Prezzo non disponibile — impostalo nella scheda prodotto → Acquisto"
        aria-label="Prezzo non disponibile"
      >
        <Euro className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }

  const current = row ? seriesCurrent(row) : null;
  const previous = row ? seriesPrevious(row) : null;
  const delta = row ? deltaText(row) : null;
  const summary = row
    ? `${label}: ${priceLabel(current)}${unitSuffix(row.current_price_unit_code)}${
        delta ? ` · ${delta.amount}${delta.percent ? ` · ${delta.percent}` : ""}` : ""
      }`
    : `${label}: prezzo acquisto non ancora disponibile`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 rounded-full", !row && "text-muted-foreground", className)}
          title={summary}
          aria-label={summary}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="relative inline-flex items-center">
            <Euro className="h-3.5 w-3.5" aria-hidden="true" />
            {row ? <DirectionMark row={row} className="h-3 w-3" /> : null}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 text-sm" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Acquisto</p>
          {row ? (
            <PriceTrendDetails row={row} current={current} previous={previous} delta={delta} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Prezzo acquisto non ancora disponibile — si imposta nella scheda prodotto → Acquisto.
            </p>
          )}
        </div>
        {showSale ? <SalePricesSection companyId={companyId as string} productId={productId as string} /> : null}
      </PopoverContent>
    </Popover>
  );
}

/** Listini di vendita del prodotto: sola lettura, nessuna freccia, nessuno storico. */
function SalePricesSection({ companyId, productId }: { companyId: string; productId: string }) {
  const query = useQuery({
    queryKey: ["listini-vendita-prodotto", companyId, productId],
    queryFn: () => fetchSalePrices(companyId, productId),
  });

  const rows = (query.data ?? []).filter((item) => item.net_price !== null || item.gross_price !== null);

  return (
    <div className="space-y-1 border-t border-border pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vendita</p>
      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : rows.length ? (
        <ul className="space-y-0.5 text-xs">
          {rows.map((item) => (
            <li key={item.list_number} className="flex justify-between gap-2 tabular-nums">
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span>{priceLabel(item.net_price ?? item.gross_price)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nessun listino di vendita per questo prodotto.</p>
      )}
    </div>
  );
}

function PriceTrendDetails({
  row,
  current,
  previous,
  delta,
}: {
  row: PriceSeriesRow;
  current: number | null;
  previous: number | null;
  delta: { amount: string; percent: string | null } | null;
}) {
  const history = useQuery({
    queryKey: ["storico-prezzi", row.series_key],
    queryFn: () => fetchPriceObservations(row.series_key),
  });

  const observed = (history.data ?? []).filter((item) => item.kind === "observed_price");
  const costs = (history.data ?? []).filter((item) => item.kind === "actual_purchase_cost");

  return (
    <>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Prezzo attuale</p>
        <p className="text-lg font-semibold tabular-nums">
          {priceLabel(current)}
          <span className="text-xs font-normal text-muted-foreground">
            {unitSuffix(row.current_price_unit_code)}
          </span>
        </p>
      </div>

      {previous === null ? (
        <p className="text-xs text-muted-foreground">Primo prezzo conosciuto: nessun confronto disponibile.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs uppercase text-muted-foreground">Prezzo precedente</p>
          <p className="tabular-nums">
            {priceLabel(previous)}
            <span className="text-xs text-muted-foreground">{unitSuffix(row.previous_price_unit_code)}</span>
            <span className="ml-2 text-xs text-muted-foreground">{priceDateShort(row.previous_observed_at)}</span>
          </p>
          {row.comparable && delta ? (
            <p className="flex items-center gap-1 font-medium tabular-nums">
              <DirectionMark row={row} className="h-4 w-4" />
              <span
                className={cn(
                  row.direction === "up" && "text-destructive",
                  row.direction === "down" && "text-success",
                  row.direction === "equal" && "text-warning",
                )}
              >
                {delta.amount}
                {delta.percent ? ` · ${delta.percent}` : ""}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Confronto non disponibile: unità o natura del prezzo differenti.
            </p>
          )}
        </div>
      )}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          Fonte: {row.current_source ? PRICE_SOURCE_LABEL[row.current_source] : "—"}
          {row.current_price_list_number ? ` · listino ${row.current_price_list_number}` : ""}
        </p>
        <p>Ultimo aggiornamento: {priceDateShort(row.current_observed_at)}</p>
        <p>Ultima verifica: {priceDateShort(row.last_seen_at)}</p>
      </div>

      {observed.length > 1 ? (
        <div className="space-y-1">
          <p className="text-xs uppercase text-muted-foreground">Ultime osservazioni</p>
          <ul className="space-y-0.5 text-xs">
            {observed.map((item) => (
              <li key={item.id} className="flex justify-between gap-2 tabular-nums">
                <span className="text-muted-foreground">{priceDateShort(item.observed_at)}</span>
                <span>
                  {priceLabel(item.net_price ?? item.gross_price)}
                  {unitSuffix(item.price_unit_code)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {costs.length ? (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-xs uppercase text-muted-foreground">Costo realmente pagato</p>
          <ul className="space-y-0.5 text-xs">
            {costs.map((item) => (
              <li key={item.id} className="flex justify-between gap-2 tabular-nums">
                <span className="text-muted-foreground">{priceDateShort(item.observed_at)}</span>
                <span>
                  {priceLabel(item.net_price ?? item.gross_price)}
                  {unitSuffix(item.price_unit_code)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
