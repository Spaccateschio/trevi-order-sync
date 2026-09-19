import type { SupplierRecord } from "@/components/companies/supplier-records-panel";

/**
 * Colonne dell'elenco fornitori: solo presentazione.
 * Stessa impostazione dell'elenco clienti, senza il listino (che riguarda
 * i prezzi di vendita ai clienti, non gli acquisti).
 */
export type SupplierColumnKey =
  | "internal_reference"
  | "legal_name"
  | "city"
  | "province"
  | "vat_number"
  | "tax_code"
  | "address_line"
  | "postal_code"
  | "region"
  | "country"
  | "sdi_code"
  | "sdi_admin_reference"
  | "contact_name"
  | "phone"
  | "email"
  | "fax"
  | "pec"
  | "discounts"
  | "credit_limit"
  | "agent"
  | "payment_terms"
  | "bank"
  | "our_bank"
  | "link"
  | "status";

export type SupplierColumn = {
  key: SupplierColumnKey;
  label: string;
  value: (record: SupplierRecord) => string;
  weight: number;
};

const text = (value: string | null | undefined) => (value ?? "").trim();

export const SUPPLIER_COLUMNS: SupplierColumn[] = [
  { key: "internal_reference", label: "Cod.", value: (r) => text(r.internal_reference), weight: 7 },
  { key: "legal_name", label: "Denominazione", value: (r) => text(r.legal_name), weight: 20 },
  { key: "city", label: "Città", value: (r) => text(r.city), weight: 12 },
  { key: "province", label: "Prov.", value: (r) => text(r.province), weight: 6 },
  { key: "vat_number", label: "Partita IVA", value: (r) => text(r.vat_number), weight: 12 },
  { key: "tax_code", label: "Codice fiscale", value: (r) => text(r.tax_code), weight: 13 },
  { key: "address_line", label: "Indirizzo", value: (r) => text(r.address_line), weight: 18 },
  { key: "postal_code", label: "CAP", value: (r) => text(r.postal_code), weight: 7 },
  { key: "region", label: "Regione", value: (r) => text(r.region), weight: 11 },
  { key: "country", label: "Nazione", value: (r) => text(r.country), weight: 10 },
  { key: "sdi_code", label: "Cod. destinatario", value: (r) => text(r.sdi_code), weight: 12 },
  {
    key: "sdi_admin_reference",
    label: "Rif. ammin.",
    value: (r) => text(r.sdi_admin_reference),
    weight: 12,
  },
  { key: "contact_name", label: "Referente", value: (r) => text(r.contact_name), weight: 12 },
  { key: "phone", label: "Telefono", value: (r) => text(r.phone), weight: 12 },
  { key: "email", label: "e-mail", value: (r) => text(r.email), weight: 16 },
  { key: "fax", label: "Fax", value: (r) => text(r.fax), weight: 10 },
  { key: "pec", label: "Pec", value: (r) => text(r.pec), weight: 16 },
  { key: "discounts", label: "Sconti", value: (r) => text(r.discounts), weight: 9 },
  { key: "credit_limit", label: "Fido", value: (r) => text(r.credit_limit), weight: 9 },
  { key: "agent", label: "Agente", value: (r) => text(r.agent), weight: 11 },
  { key: "payment_terms", label: "Pagamento", value: (r) => text(r.payment_terms), weight: 14 },
  { key: "bank", label: "Coord. bancarie", value: (r) => text(r.bank), weight: 15 },
  { key: "our_bank", label: "Ns. banca", value: (r) => text(r.our_bank), weight: 12 },
  { key: "link", label: "Collegamento", value: () => "", weight: 13 },
  {
    key: "status",
    label: "Stato",
    value: (r) =>
      r.status === "attivo" ? "Attivo" : r.status === "disattivato" ? "Disattivato" : "Eliminato",
    weight: 9,
  },
];

export const DEFAULT_SUPPLIER_COLUMNS: SupplierColumnKey[] = [
  "internal_reference",
  "legal_name",
  "city",
  "province",
  "vat_number",
  "phone",
  "email",
  "link",
];

export const LOCKED_SUPPLIER_COLUMN: SupplierColumnKey = "legal_name";

const STORAGE_KEY = "trevi:fornitori:colonne";
const WIDTHS_STORAGE_KEY = "trevi:fornitori:larghezze";

export function loadSupplierColumns(): SupplierColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_SUPPLIER_COLUMNS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUPPLIER_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SUPPLIER_COLUMNS;
    const valid = SUPPLIER_COLUMNS.map((c) => c.key);
    const keys = parsed.filter((k): k is SupplierColumnKey =>
      valid.includes(k as SupplierColumnKey),
    );
    if (!keys.includes(LOCKED_SUPPLIER_COLUMN)) keys.push(LOCKED_SUPPLIER_COLUMN);
    return keys.length ? keys : DEFAULT_SUPPLIER_COLUMNS;
  } catch {
    return DEFAULT_SUPPLIER_COLUMNS;
  }
}

export function saveSupplierColumns(keys: SupplierColumnKey[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* preferenza non salvata: l'elenco resta comunque usabile */
  }
}

export function defaultSupplierColumnWidths() {
  return Object.fromEntries(SUPPLIER_COLUMNS.map((column) => [column.key, column.weight])) as Record<
    SupplierColumnKey,
    number
  >;
}

export function loadSupplierColumnWidths() {
  const defaults = defaultSupplierColumnWidths();
  if (typeof window === "undefined") return defaults;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WIDTHS_STORAGE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const column of SUPPLIER_COLUMNS) {
      const value = parsed[column.key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 3)
        defaults[column.key] = value;
    }
  } catch {
    return defaults;
  }
  return defaults;
}

export function saveSupplierColumnWidths(widths: Record<SupplierColumnKey, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    /* preferenza non salvata: le larghezze restano attive fino al cambio pagina */
  }
}

export function supplierMatchesQuery(record: SupplierRecord, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    record.legal_name,
    record.vat_number,
    record.tax_code,
    record.city,
    record.province,
    record.internal_reference,
    record.email,
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

export function moveSupplierColumn(
  keys: SupplierColumnKey[],
  source: SupplierColumnKey,
  target: SupplierColumnKey,
): SupplierColumnKey[] {
  if (source === target) return keys;
  const from = keys.indexOf(source);
  const to = keys.indexOf(target);
  if (from < 0 || to < 0) return keys;
  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}
