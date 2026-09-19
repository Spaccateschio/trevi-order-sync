/** Tipi e formattazioni condivise dell'inventario. Un solo punto di verità sui numeri mostrati. */

export type LocationRow = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
  status: "attivo" | "disattivato" | "revocato";
  notes: string | null;
};

export type SessionScope = "generale" | "ubicazione";
export type SessionStatus = "in_corso" | "completata" | "annullata";

export type SessionRow = {
  id: string;
  name: string;
  scope: SessionScope;
  location_id: string | null;
  status: SessionStatus;
  archive_id: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
};

export type CountRow = {
  id: string;
  product_id: string;
  location_id: string;
  counted_quantity: number;
  previous_quantity: number;
  difference: number;
  unit_code: string | null;
  counted_at: string;
  notes: string | null;
};

export type LocationStock = {
  location_id: string;
  location_name: string;
  is_default: boolean;
  has_count: boolean;
  quantity: number;
  counted_at: string | null;
};

export type StockStatus = "mai_contato" | "parziale" | "completo";

export type StockOverview = {
  locations: LocationStock[];
  total: number;
  counted_locations: number;
  total_locations: number;
  status: StockStatus;
  min_stock: number | null;
  order_multiple: number | null;
  stock_unit_id: string | null;
  coverage_days: number | null;
};

export type RequirementRow = {
  product_id: string;
  code: string;
  description: string | null;
  danea_um: string | null;
  available: number;
  counted_locations: number;
  total_locations: number;
  count_status: StockStatus;
  min_stock: number | null;
  order_multiple: number | null;
  needed: number;
  raw_need: number;
  suggested: number;
  rounded: boolean;
};

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  mai_contato: "Mai contato",
  parziale: "Parzialmente contato",
  completo: "Contato",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  in_corso: "In corso",
  completata: "Completata",
  annullata: "Annullata",
};

/** Numeri sempre leggibili: niente zeri decimali inutili. */
export function qty(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(value);
}

export function dateTimeShort(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Converte il testo digitato in numero, accettando la virgola italiana. */
export function parseQuantity(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Stessa formula del server, solo per l'anteprima immediata a schermo. */
export function purchaseNeed(needed: number, minStock: number | null, available: number, orderMultiple: number | null) {
  const rawNeed = Math.max(0, needed + (minStock ?? 0) - available);
  if (rawNeed === 0) return { rawNeed: 0, suggested: 0, rounded: false };
  if (!orderMultiple || orderMultiple <= 0) return { rawNeed, suggested: rawNeed, rounded: false };
  const suggested = Math.ceil(rawNeed / orderMultiple) * orderMultiple;
  return { rawNeed, suggested, rounded: suggested !== rawNeed };
}
