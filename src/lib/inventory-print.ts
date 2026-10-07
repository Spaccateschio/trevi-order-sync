// Stampa inventario: rapida (preferiti, articolo + quantità), dettagliata (preferiti, tabella),
// completa (tutti i prodotti, tabella). Solo lettura: i dati mancanti restano vuoti, mai 0.
export type InventoryPrintMode = "rapida" | "dettagliata" | "completa";

export type InventoryPrintRow = {
  code: string;
  name: string;
  zone: string;
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
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.code.localeCompare(b.code, "it") || a.zone.localeCompare(b.zone, "it"));
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
      .map((r) => `<tr><td>${esc(r.name)}</td><td class="qty">${esc(countedLabel(r))}</td></tr>`)
      .join("")}</tbody></table>`;
  } else {
    table = `<table><thead><tr><th>Codice</th><th>Articolo</th><th>Zona</th><th>U.M. mag.</th><th>Calcolata</th><th>Quantità fisica</th><th>Differenza</th><th>Note/stato</th></tr></thead><tbody>${selected
      .map(
        (r) =>
          `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.zone)}</td><td>${r.stockUnit ? esc(r.stockUnit) : "<em>U.M. da impostare</em>"}</td><td class="qty">${r.calculated === null ? "—" : fmt(r.calculated)}</td><td class="qty">${esc(countedLabel(r))}</td><td class="qty">${fmtDiff(r.difference)}</td><td>${esc(r.note)}</td></tr>`,
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
