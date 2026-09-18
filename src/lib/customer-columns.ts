import type { CustomerRecord } from "@/components/companies/customer-records-panel";

/**
 * Colonne dell'elenco clienti: solo presentazione.
 * L'ordine qui è l'ordine in tabella e nel menu "Colonne".
 */
export type CustomerColumnKey =
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
  | "price_list"
  | "link"
  | "status";

export type CustomerColumn = {
  key: CustomerColumnKey;
  label: string;
  /** Valore testuale usato per ordinamento e ricerca. */
  value: (record: CustomerRecord) => string;
  /** Colonne strette, allineate a sinistra come nel gestionale. */
  className?: string;
};

const text = (value: string | null | undefined) => (value ?? "").trim();

export const CUSTOMER_COLUMNS: CustomerColumn[] = [
  { key: "internal_reference", label: "Cod.", value: (r) => text(r.internal_reference), className: "w-16" },
  { key: "legal_name", label: "Denominazione", value: (r) => text(r.legal_name), className: "min-w-52" },
  { key: "city", label: "Città", value: (r) => text(r.city), className: "w-32" },
  { key: "province", label: "Prov.", value: (r) => text(r.province), className: "w-14" },
  { key: "vat_number", label: "Partita IVA", value: (r) => text(r.vat_number), className: "w-28" },
  { key: "tax_code", label: "Codice fiscale", value: (r) => text(r.tax_code), className: "w-32" },
  { key: "address_line", label: "Indirizzo", value: (r) => text(r.address_line), className: "min-w-40" },
  { key: "postal_code", label: "CAP", value: (r) => text(r.postal_code), className: "w-16" },
  { key: "region", label: "Regione", value: (r) => text(r.region), className: "w-28" },
  { key: "country", label: "Nazione", value: (r) => text(r.country), className: "w-24" },
  { key: "sdi_code", label: "Cod. destinatario", value: (r) => text(r.sdi_code), className: "w-28" },
  {
    key: "sdi_admin_reference",
    label: "Rif. ammin.",
    value: (r) => text(r.sdi_admin_reference),
    className: "w-28",
  },
  { key: "contact_name", label: "Referente", value: (r) => text(r.contact_name), className: "w-32" },
  { key: "phone", label: "Telefono", value: (r) => text(r.phone), className: "w-32" },
  { key: "email", label: "e-mail", value: (r) => text(r.email), className: "min-w-40" },
  { key: "fax", label: "Fax", value: (r) => text(r.fax), className: "w-28" },
  { key: "pec", label: "Pec", value: (r) => text(r.pec), className: "min-w-40" },
  { key: "discounts", label: "Sconti", value: (r) => text(r.discounts), className: "w-24" },
  { key: "credit_limit", label: "Fido", value: (r) => text(r.credit_limit), className: "w-24" },
  { key: "agent", label: "Agente", value: (r) => text(r.agent), className: "w-28" },
  { key: "payment_terms", label: "Pagamento", value: (r) => text(r.payment_terms), className: "min-w-36" },
  { key: "bank", label: "Coord. bancarie", value: (r) => text(r.bank), className: "min-w-36" },
  { key: "our_bank", label: "Ns. banca", value: (r) => text(r.our_bank), className: "w-32" },
  { key: "price_list", label: "Listino", value: () => "", className: "w-56" },
  { key: "link", label: "Collegamento", value: () => "", className: "w-36" },
  {
    key: "status",
    label: "Stato",
    value: (r) => (r.status === "attivo" ? "Attivo" : r.status === "disattivato" ? "Disattivato" : "Revocato"),
    className: "w-24",
  },
];

export const DEFAULT_CUSTOMER_COLUMNS: CustomerColumnKey[] = [
  "internal_reference",
  "legal_name",
  "city",
  "province",
  "vat_number",
  "phone",
  "email",
  "price_list",
  "link",
];

/** La denominazione resta sempre visibile: è l'ancora della riga. */
export const LOCKED_CUSTOMER_COLUMN: CustomerColumnKey = "legal_name";

const STORAGE_KEY = "trevi:clienti:colonne";

export function loadCustomerColumns(): CustomerColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_CUSTOMER_COLUMNS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOMER_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_CUSTOMER_COLUMNS;
    const valid = CUSTOMER_COLUMNS.map((c) => c.key);
    const keys = parsed.filter((k): k is CustomerColumnKey =>
      valid.includes(k as CustomerColumnKey),
    );
    if (!keys.includes(LOCKED_CUSTOMER_COLUMN)) keys.push(LOCKED_CUSTOMER_COLUMN);
    return keys.length ? keys : DEFAULT_CUSTOMER_COLUMNS;
  } catch {
    return DEFAULT_CUSTOMER_COLUMNS;
  }
}

export function saveCustomerColumns(keys: CustomerColumnKey[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* preferenza non salvata: l'elenco resta comunque usabile */
  }
}

/** Ricerca rapida: denominazione, P.IVA, codice fiscale, città e codice Danea. */
export function customerMatchesQuery(record: CustomerRecord, query: string) {
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
