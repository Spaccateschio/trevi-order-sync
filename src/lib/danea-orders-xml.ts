/**
 * Scarico ordini B2B verso Danea Easyfatt («Scarica ordini da e-commerce»).
 * Modulo puro: validazione e generazione del tracciato Easyfatt-XML
 * (EasyfattDocuments, DocumentType «C» = ordine cliente), nessun accesso al DB.
 *
 * Regole:
 * - CustomerCode = codice cliente Danea dell'anagrafica collegata, mai inventato.
 * - Code riga = codice articolo Danea del VENDITORE (collegamento B2B).
 * - Quantità e U.M. come ordinate: nessuna conversione.
 * - Price solo se U.M. della riga = U.M. del prezzo e prezzo valido (> 0);
 *   altrimenti il campo viene omesso (mai 0) e il prezzo indicativo va in nota.
 * - Number = parte numerica del numero Trevi Fruit (ORD-2026-00004 → 4):
 *   Danea lo richiede per elencare l'ordine e ricordare l'ultimo importato;
 *   il numero completo resta in InternalComment.
 * - Filtri di Danea (firstdate/lastdate/firstnum/lastnum) applicati.
 */

export type DaneaOrderCustomer = {
  code: string | null;
  name: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  fiscal_code: string | null;
  vat_code: string | null;
  email: string | null;
  phone: string | null;
  sdi_code: string | null;
  pec: string | null;
  archive_ok: boolean;
};

export type DaneaOrderLine = {
  item_id: string;
  seller_code: string | null;
  description: string | null;
  quantity: number | string | null;
  unit: string | null;
  price: number | string | null;
  price_unit: string | null;
  vat_code: string | null;
  vat_perc: number | string | null;
  notes: string | null;
};

export type DaneaOrderCandidate = {
  order_id: string;
  number: string | null;
  /** Già scaricato in precedenza dalla stessa postazione (riscarico richiesto da Danea). */
  already_exported?: boolean;
  sent_at: string | null;
  order_date: string | null;
  delivery_date: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  delivery_address_text: string | null;
  notes: string | null;
  buyer_name: string | null;
  customer: DaneaOrderCustomer | null;
  lines: DaneaOrderLine[];
};

export type DaneaOrderIssue = { order_id: string; number: string | null; reasons: string[] };

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const sameUnit = (a: string | null, b: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Numero d'ordine per Danea: solo cifre (ORD-2026-00004 → 4). */
export function daneaOrderNumber(number: string | null): number | null {
  const m = number?.match(/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export type DaneaRequestFilter = {
  firstDate: string | null;
  lastDate: string | null;
  firstNum: number | null;
  lastNum: number | null;
};

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const posInt = (v: string | null) => {
  if (!v || !/^\d{1,9}$/.test(v.trim())) return null;
  return Number(v.trim());
};

/** Parametri che Danea accoda all'URL; valori non validi vengono ignorati. */
export function parseDaneaRequestFilter(params: URLSearchParams): DaneaRequestFilter {
  return {
    firstDate: isoDate(params.get("firstdate")),
    lastDate: isoDate(params.get("lastdate")),
    firstNum: posInt(params.get("firstnum")),
    lastNum: posInt(params.get("lastnum")),
  };
}

/** Danea ha chiesto esplicitamente un intervallo di numeri. */
export const filterHasNumberRange = (f: DaneaRequestFilter) => f.firstNum !== null || f.lastNum !== null;

export function matchesDaneaFilter(order: DaneaOrderCandidate, f: DaneaRequestFilter): boolean {
  const d = order.order_date;
  if (f.firstDate && (!d || d < f.firstDate)) return false;
  if (f.lastDate && (!d || d > f.lastDate)) return false;
  if (filterHasNumberRange(f)) {
    const n = daneaOrderNumber(order.number);
    if (n === null) return false;
    if (f.firstNum !== null && n < f.firstNum) return false;
    if (f.lastNum !== null && n > f.lastNum) return false;
  }
  return true;
}

/** Messaggi diagnostici comprensibili: l'ordine NON esce se ce n'è almeno uno. */
export function validateDaneaOrder(order: DaneaOrderCandidate): string[] {
  const reasons: string[] = [];
  if (!order.customer) {
    reasons.push("Cliente non collegato a un'anagrafica cliente: collegare il cliente prima dello scarico");
  } else {
    if (!order.customer.code) reasons.push("Codice cliente Danea mancante nell'anagrafica cliente");
    if (!order.customer.archive_ok) {
      reasons.push("L'anagrafica cliente appartiene a un archivio Danea diverso da quello della postazione");
    }
  }
  if (daneaOrderNumber(order.number) === null) reasons.push("Numero ordine non valido per Danea");
  if (!order.lines.length) reasons.push("Ordine senza righe");
  for (const line of order.lines) {
    const label = line.description ?? "riga senza descrizione";
    if (!line.seller_code) reasons.push(`Codice articolo Danea mancante: ${label}`);
    const q = toNum(line.quantity);
    if (q === null || q <= 0) reasons.push(`Quantità non valida: ${label}`);
    if (!line.unit) reasons.push(`U.M. mancante: ${label}`);
  }
  return reasons;
}

export type LinePriceDecision = { price: number | null; note: string | null };

const euro = (n: number) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Prezzo da inviare a Danea: mai convertito, mai trasformato in zero. */
export function daneaLinePrice(line: Pick<DaneaOrderLine, "price" | "price_unit" | "unit">): LinePriceDecision {
  const p = toNum(line.price);
  if (p === null || p <= 0) return { price: null, note: "Prezzo su richiesta" };
  if (sameUnit(line.unit, line.price_unit)) return { price: p, note: null };
  const pu = line.price_unit ? `/${line.price_unit}` : "";
  return { price: null, note: `Prezzo indicativo ${euro(p)} €${pu} – da pesare` };
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const el = (tag: string, value: string | number | null | undefined, indent: string) =>
  value === null || value === undefined || value === "" ? "" : `${indent}<${tag}>${escapeXml(String(value))}</${tag}>\n`;

const fmtNum = (n: number) => String(Number(n.toFixed(6)));

function footNotes(order: DaneaOrderCandidate): string | null {
  const parts: string[] = [];
  if (order.delivery_date) {
    const [y, m, d] = order.delivery_date.split("-");
    const time =
      order.delivery_time_from || order.delivery_time_to
        ? ` ${(order.delivery_time_from ?? "").slice(0, 5)}–${(order.delivery_time_to ?? "").slice(0, 5)}`
        : "";
    parts.push(`Consegna richiesta: ${d}/${m}/${y}${time}`);
  }
  if (order.delivery_address_text) parts.push(`Luogo di consegna: ${order.delivery_address_text}`);
  if (order.notes) parts.push(`Note cliente: ${order.notes}`);
  return parts.length ? parts.join(" — ") : null;
}

function documentXml(order: DaneaOrderCandidate): string {
  const c = order.customer!;
  const i = "      ";
  let x = "    <Document>\n";
  x += el("CustomerCode", c.code, i);
  x += el("CustomerName", c.name ?? order.buyer_name, i);
  x += el("CustomerAddress", c.address, i);
  x += el("CustomerPostcode", c.postcode, i);
  x += el("CustomerCity", c.city, i);
  x += el("CustomerProvince", c.province, i);
  x += el("CustomerCountry", c.country, i);
  x += el("CustomerFiscalCode", c.fiscal_code, i);
  x += el("CustomerVatCode", c.vat_code, i);
  x += el("CustomerTel", c.phone, i);
  x += el("CustomerEmail", c.email, i);
  x += el("CustomerPec", c.pec, i);
  x += el("CustomerEInvoiceDestCode", c.sdi_code, i);
  x += el("DocumentType", "C", i);
  x += el("Date", order.order_date, i);
  x += el("Number", daneaOrderNumber(order.number), i);
  x += el("InternalComment", `Ordine Trevi Fruit ${order.number ?? order.order_id}`, i);
  x += el("FootNotes", footNotes(order), i);
  x += `${i}<Rows>\n`;
  const r = "          ";
  for (const line of order.lines) {
    const decision = daneaLinePrice(line);
    const notes = [line.notes, decision.note].filter(Boolean).join(" – ");
    x += "        <Row>\n";
    x += el("Code", line.seller_code, r);
    x += el("Description", line.description, r);
    x += el("Qty", fmtNum(toNum(line.quantity)!), r);
    x += el("Um", line.unit, r);
    if (decision.price !== null) x += el("Price", fmtNum(decision.price), r);
    x += el("VatCode", line.vat_code, r);
    x += el("Notes", notes || null, r);
    x += "        </Row>\n";
  }
  x += `${i}</Rows>\n`;
  x += "    </Document>\n";
  return x;
}

export type DaneaOrdersBuild = {
  xml: string;
  exportedIds: string[];
  excluded: DaneaOrderIssue[];
};

/** Validazione + XML. Gli ordini con errori restano fuori e in diagnostica. */
export function buildDaneaOrdersXml(
  companyName: string | null,
  candidates: DaneaOrderCandidate[],
): DaneaOrdersBuild {
  const excluded: DaneaOrderIssue[] = [];
  const valid: DaneaOrderCandidate[] = [];
  for (const order of candidates) {
    const reasons = validateDaneaOrder(order);
    if (reasons.length) excluded.push({ order_id: order.order_id, number: order.number, reasons });
    else valid.push(order);
  }
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<EasyfattDocuments AppVersion="2" Creator="Trevi Fruit">\n';
  if (companyName) xml += `  <Company>\n${el("Name", companyName, "    ")}  </Company>\n`;
  xml += "  <Documents>\n";
  for (const order of valid) xml += documentXml(order);
  xml += "  </Documents>\n</EasyfattDocuments>\n";
  return { xml, exportedIds: valid.map((o) => o.order_id), excluded };
}
