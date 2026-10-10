// Stampa inventario: rapida (preferiti, articolo + quantità), dettagliata (preferiti, tabella),
// completa (tutti i prodotti, tabella). Solo lettura: i dati mancanti restano vuoti, mai 0.
export type InventoryPrintMode = "rapida" | "dettagliata" | "completa";

export type InventoryPrintRow = {
  code: string;
  name: string;
  zone: string;
  /** Card (Modello 2): nome del fornitore o «Senza fornitore»; null = riga del prodotto senza card. */
  card?: string | null;
  favorite: boolean;
  /** U.M. di magazzino; null = da impostare. */
  stockUnit: string | null;
  calculated: number | null;
  counted: number | null;
  /** U.M. con cui è stato registrato il conteggio (se diversa dalla magazzino). */
  countedUnit: string | null;
  difference: number | null;
  note: string;
};

export function selectPrintRows(rows: InventoryPrintRow[], mode: InventoryPrintMode): InventoryPrintRow[] {
  return rows
    .filter((row) => mode === "completa" || row.favorite)
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.code.localeCompare(b.code, "it") || a.zone.localeCompare(b.zone, "it")
      || cardOrder(a.card) - cardOrder(b.card) || (a.card ?? "").localeCompare(b.card ?? "", "it"));
}

const NO_SUPPLIER = "Senza fornitore";
const cardOrder = (card: string | null | undefined) => (card === NO_SUPPLIER ? 1 : 0);

export function printName(row: InventoryPrintRow): string {
  return row.card ? `${row.name} — ${row.card}` : row.name;
}

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (value: number | null) =>
  value === null ? "" : value.toLocaleString("it-IT", { maximumFractionDigits: 3 });
const fmtDiff = (value: number | null) => (value === null ? "—" : `${value > 0 ? "+" : ""}${fmt(value)}`);

export function countedLabel(row: InventoryPrintRow): string {
  if (row.counted === null) return "";
  const unit = row.countedUnit ?? row.stockUnit ?? "";
  return `${fmt(row.counted)}${unit ? ` ${unit}` : ""}`;
}

export function buildInventoryPrintHtml(
  rows: InventoryPrintRow[],
  mode: InventoryPrintMode,
  meta: { title: string; subtitle: string },
): string {
  const selected = selectPrintRows(rows, mode);
  const label = mode === "rapida" ? "Rapida" : mode === "dettagliata" ? "Dettagliata" : "Completa";
  let table: string;
  if (mode === "rapida") {
    table = `<table class="quick"><thead><tr><th>Articolo</th><th>Quantità</th></tr></thead><tbody>${selected
      .map((r) => `<tr><td>${esc(printName(r))}</td><td class="qty">${esc(countedLabel(r))}</td></tr>`)
      .join("")}</tbody></table>`;
  } else {
    table = `<table><thead><tr><th>Codice</th><th>Articolo</th><th>Card / fornitore</th><th>Zona</th><th>U.M. mag.</th><th>Calcolata</th><th>Quantità fisica</th><th>Differenza</th><th>Note/stato</th></tr></thead><tbody>${selected
      .map(
        (r) =>
          `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.card ?? "")}</td><td>${esc(r.zone)}</td><td>${r.stockUnit ? esc(r.stockUnit) : "<em>U.M. da impostare</em>"}</td><td class="qty">${r.calculated === null ? "—" : fmt(r.calculated)}</td><td class="qty">${esc(countedLabel(r))}</td><td class="qty">${fmtDiff(r.difference)}</td><td>${esc(r.note)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  }
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(meta.title)} – ${label}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;color:#111;margin:16px;}
h1{font-size:16px;margin:0 0 2px;}
p.meta{font-size:11px;color:#444;margin:0 0 10px;}
table{width:100%;border-collapse:collapse;font-size:11px;}
th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top;}
th{background:#f0ead6;}
td.qty{text-align:right;font-weight:600;white-space:nowrap;}
table.quick{font-size:11px;}
table.quick td,table.quick th{padding:2px 6px;}
table.quick td.qty{min-width:90px;}
thead{display:table-header-group;}
tr{break-inside:avoid;}
@page{margin:10mm;}
</style></head><body>
<h1>${esc(meta.title)} — Stampa ${label}</h1>
<p class="meta">${esc(meta.subtitle)} · ${selected.length} prodotti</p>
${table}
</body></html>`;
}

// ── Selezione unica delle card (elenco, riepilogo filtrato, stampa della vista attuale) ──

export type InventoryWorkFilter = "all" | "pending" | "completed" | "differences" | "not_comparable" | "recount" | "missing_unit";

export type InventoryCardFilters = {
  view: "favorites" | "all";
  work: InventoryWorkFilter;
  search: string;
  locationId: string | null;
  category: string | null;
  subcategory: string | null;
  supplier: string | null;
};

export type FilterableCard = {
  product_id: string;
  location_id: string;
  location_name: string;
  code: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  is_favorite: boolean;
  card_favorite: boolean;
  counted: number | null;
  difference: number | null;
  recount_requested_at: string | null;
  stock_unit_missing: boolean;
  units_comparable: boolean | null;
};

export const NO_CATEGORY_LABEL = "Senza categoria";
export const NO_SUBCATEGORY_LABEL = "Senza sottocategoria";

export type CardFilterKey = "view" | "work" | "search" | "location" | "category" | "subcategory" | "supplier";

/** Preferiti (Tappa B): stella del prodotto oppure stella della singola card. */
export const isFavoriteCard = (row: FilterableCard) => row.is_favorite || row.card_favorite;

export const hasDifference = (row: FilterableCard) =>
  row.counted !== null && row.units_comparable !== false && row.difference !== null && Number(row.difference) !== 0;

function matchesWork(row: FilterableCard, work: InventoryWorkFilter): boolean {
  if (work === "all") return true;
  if (work === "pending") return row.counted === null;
  if (work === "recount") return row.recount_requested_at !== null;
  if (work === "completed") return row.counted !== null;
  if (work === "missing_unit") return row.stock_unit_missing;
  if (work === "not_comparable") return row.counted !== null && row.units_comparable === false;
  return hasDifference(row);
}

/** Filtri che escludono la card (vuoto = card visibile). Stessa ricerca del database: codice o descrizione. */
export function failedFilters<T extends FilterableCard>(
  row: T,
  filters: InventoryCardFilters,
  supplierOf?: (row: T) => string | null | undefined,
): CardFilterKey[] {
  const failed: CardFilterKey[] = [];
  const term = filters.search.trim().toLocaleLowerCase("it");
  if (filters.view === "favorites" && !isFavoriteCard(row)) failed.push("view");
  if (!matchesWork(row, filters.work)) failed.push("work");
  if (term && !(row.code ?? "").toLocaleLowerCase("it").includes(term)
    && !(row.description ?? "").toLocaleLowerCase("it").includes(term)) failed.push("search");
  if (filters.locationId && row.location_id !== filters.locationId) failed.push("location");
  if (filters.category && (row.category?.trim() || NO_CATEGORY_LABEL) !== filters.category) failed.push("category");
  if (filters.subcategory && (row.subcategory?.trim() || NO_SUBCATEGORY_LABEL) !== filters.subcategory) failed.push("subcategory");
  if (filters.supplier && (supplierOf?.(row) ?? null) !== filters.supplier) failed.push("supplier");
  return failed;
}

export function selectInventoryCards<T extends FilterableCard>(
  rows: T[],
  filters: InventoryCardFilters,
  supplierOf?: (row: T) => string | null | undefined,
): T[] {
  return rows.filter((row) => failedFilters(row, filters, supplierOf).length === 0);
}

export type CardSummary = { cards: number; products: number; confirmed: number; pending: number; differences: number };

/** Riepilogo delle card date: card e prodotti distinti sono contati separatamente. */
export function summarizeCards(rows: FilterableCard[]): CardSummary {
  return {
    cards: rows.length,
    products: new Set(rows.map((row) => row.product_id)).size,
    confirmed: rows.filter((row) => row.counted !== null).length,
    pending: rows.filter((row) => row.counted === null).length,
    differences: rows.filter(hasDifference).length,
  };
}

export type SearchElsewhere = { reasons: CardFilterKey[]; locations: { id: string; name: string }[] };

/**
 * Ricerca senza risultati nei filtri attuali: cerca le stesse card della sessione (già limitate
 * all'azienda e ai permessi dell'utente) escluse da altri filtri e indica quali filtri togliere.
 * null = nessuna corrispondenza nella sessione.
 */
export function findSearchElsewhere<T extends FilterableCard>(
  rows: T[],
  filters: InventoryCardFilters,
  supplierOf?: (row: T) => string | null | undefined,
): SearchElsewhere | null {
  if (!filters.search.trim()) return null;
  const matches = rows
    .map((row) => ({ row, failed: failedFilters(row, filters, supplierOf) }))
    .filter((entry) => !entry.failed.includes("search"));
  if (!matches.length) return null;
  // La correzione più piccola: le card che richiedono meno filtri da togliere.
  const min = Math.min(...matches.map((entry) => entry.failed.length));
  const best = matches.filter((entry) => entry.failed.length === min);
  const reasons = [...new Set(best.flatMap((entry) => entry.failed))];
  const locations = new Map<string, string>();
  for (const { row } of best) locations.set(row.location_id, row.location_name);
  return {
    reasons,
    locations: [...locations].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it")),
  };
}
