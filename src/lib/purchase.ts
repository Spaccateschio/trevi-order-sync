/** Tipi e etichette degli acquisti: ordinato, dichiarato, verificato e caricato restano valori distinti. */

export type PurchaseOrderStatus =
  | "bozza"
  | "inviato"
  | "parzialmente_consegnato"
  | "consegnato"
  | "chiuso"
  | "annullato";

export type DeliveryStatus =
  | "bozza"
  | "dichiarata"
  | "in_contestazione"
  | "accettata"
  | "chiusa_con_rifiuti";

export type DeliveryOrigin = "fornitore_b2b" | "fornitore_link_esterno" | "operatore_interno";

export type DeliveryLineType = "ordinata" | "aggiunta_fornitore" | "sostituzione";

export type DeliveryLineStatus =
  | "dichiarata"
  | "accettata"
  | "contestata"
  | "rettificata"
  | "rifiutata";

export type DisputeReason =
  | "quantita_inferiore"
  | "quantita_superiore"
  | "non_consegnato"
  | "non_ordinato"
  | "qualita"
  | "pezzatura"
  | "altro";

export type ComparisonOutcome =
  | "corretta"
  | "inferiore"
  | "superiore"
  | "non_consegnata"
  | "aggiunta_fornitore"
  | "sostituzione"
  | "da_verificare";

export const ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  parzialmente_consegnato: "Parzialmente consegnato",
  consegnato: "Consegnato",
  chiuso: "Chiuso",
  annullato: "Annullato",
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  bozza: "In compilazione",
  dichiarata: "Dichiarata dal fornitore",
  in_contestazione: "In contestazione",
  accettata: "Accettata",
  chiusa_con_rifiuti: "Chiusa con righe rifiutate",
};

export const DELIVERY_ORIGIN_LABEL: Record<DeliveryOrigin, string> = {
  fornitore_b2b: "Dichiarata dal fornitore collegato",
  fornitore_link_esterno: "Dichiarata dal fornitore con link",
  operatore_interno: "Compilata dal nostro operatore",
};

export const LINE_TYPE_LABEL: Record<DeliveryLineType, string> = {
  ordinata: "Riga dell'ordine",
  aggiunta_fornitore: "AGGIUNTO DAL FORNITORE — NON PRESENTE NELL'ORDINE ORIGINALE",
  sostituzione: "SOSTITUZIONE PROPOSTA DAL FORNITORE",
};

export const LINE_STATUS_LABEL: Record<DeliveryLineStatus, string> = {
  dichiarata: "Dichiarata",
  accettata: "Accettata",
  contestata: "Contestata",
  rettificata: "Rettificata",
  rifiutata: "Rifiutata",
};

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  quantita_inferiore: "Quantità inferiore",
  quantita_superiore: "Quantità superiore",
  non_consegnato: "Non consegnato",
  non_ordinato: "Non ordinato",
  qualita: "Qualità",
  pezzatura: "Pezzatura",
  altro: "Altro",
};

export const OUTCOME_LABEL: Record<ComparisonOutcome, string> = {
  corretta: "Quantità corretta",
  inferiore: "Quantità inferiore",
  superiore: "Quantità superiore",
  non_consegnata: "Non consegnata",
  aggiunta_fornitore: "Aggiunto dal fornitore",
  sostituzione: "Sostituzione",
  da_verificare: "Da verificare al Carico Merce",
};

export type OrderOverviewRow = {
  order_id: string;
  number: string;
  status: PurchaseOrderStatus;
  supplier_record_id: string;
  supplier_name: string;
  destination_location_id: string;
  destination_name: string;
  archive_id: string;
  lines: number;
  ordered_total: number;
  declared_total: number;
  received_total: number;
  deliveries: number;
  open_disputes: number;
  sent_at: string | null;
  created_at: string;
  notes: string | null;
  lines_without_equivalent: number;
  /** Stato di invio, separato dallo stato operativo. */
  send_status: SendStatus;
  delivery_date: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  delivery_address_id: string | null;
  delivery_address_text: string | null;
  supplier_notes: string | null;
  shopping_list_number: string | null;
};

export type SendStatus = "da_inviare" | "inviato" | "errore_invio";

export const SEND_STATUS_LABEL: Record<SendStatus, string> = {
  da_inviare: "DA INVIARE",
  inviato: "INVIATO",
  errore_invio: "ERRORE INVIO",
};

export type OrderItemRow = {
  id: string;
  product_id: string;
  /** Equivalente in U.M. di magazzino; vuoto se manca la conversione. */
  ordered_quantity: number | null;
  unit_code: string | null;
  purchase_quantity: number | null;
  purchase_unit_code: string | null;
  unit_cost: number | null;
  /** Fotografia della U.M. del prezzo: vuota = non indicata. */
  price_unit_code: string | null;
  supplier_product_code: string | null;
  products: { code: string; description: string | null } | null;
};

export type DeliveryRow = {
  id: string;
  sequence: number;
  origin: DeliveryOrigin;
  status: DeliveryStatus;
  notes: string | null;
  declared_by_name: string | null;
  declared_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type ComparisonRow = {
  delivery_item_id: string;
  order_item_id: string | null;
  product_id: string;
  code: string;
  description: string | null;
  line_type: DeliveryLineType;
  ordered: number | null;
  previously_declared: number | null;
  declared: number | null;
  difference: number | null;
  unit_code: string | null;
  declared_weight: number | null;
  declared_producer: string | null;
  declared_producer_lot: string | null;
  declared_expiry: string | null;
  line_notes: string | null;
  missing_reason: string | null;
  status: DeliveryLineStatus;
  accepted_quantity: number | null;
  outcome: ComparisonOutcome;
  dispute_id: string | null;
  dispute_reason: DisputeReason | null;
  dispute_status: string | null;
  dispute_notes: string | null;
  ordered_purchase_quantity: number | null;
  previously_declared_purchase: number | null;
  declared_purchase_quantity: number | null;
  accepted_purchase_quantity: number | null;
  purchase_unit_code: string | null;
  comparison_basis: "magazzino" | "acquisto" | "da_verificare";
};

export type ReceiptRow = {
  id: string;
  number: string;
  status: "bozza" | "confermato";
  location_id: string;
  received_at: string;
  confirmed_at: string | null;
  delivery_id: string | null;
};

export type ReceiptItemRow = {
  id: string;
  product_id: string;
  delivery_item_id: string | null;
  verified_quantity: number;
  unit_code: string | null;
  /** Prezzo del fornitore nella U.M. del prezzo del carico. */
  unit_cost: number | null;
  price_unit_id: string | null;
  price_unit_code: string | null;
  /** Quantità nella U.M. del prezzo, su cui si calcola il valore. */
  price_quantity: number | null;
  producer_name: string | null;
  producer_lot_code: string | null;
  expiry_date: string | null;
  notes: string | null;
  products: { code: string; description: string | null } | null;
};

export type LotRow = {
  lot_id: string;
  internal_code: string;
  location_id: string;
  location_name: string;
  supplier_record_id: string | null;
  supplier_name: string | null;
  producer_name: string | null;
  producer_lot_code: string | null;
  unit_code: string | null;
  unit_cost: number | null;
  initial_quantity: number;
  remaining_quantity: number;
  entered_at: string;
  expiry_date: string | null;
  status: "disponibile" | "esaurito" | "bloccato";
};

export type LotReconciliationRow = {
  location_id: string;
  location_name: string;
  physical: number;
  lots_theoretical: number;
  difference: number;
  has_count: boolean;
};

/** Il colore dell'esito è solo una lettura: non modifica mai l'ordine originale. */
export function outcomeTone(outcome: ComparisonOutcome) {
  if (outcome === "corretta") return "text-emerald-700 dark:text-emerald-400";
  if (outcome === "inferiore" || outcome === "non_consegnata") return "text-destructive";
  return "text-amber-700 dark:text-amber-400";
}

/** "€ 2,00 / kg" oppure "€ 2,00 · U.M. prezzo non indicata". */
export function priceLabel(value: number | null, unitCode: string | null) {
  if (value === null || value === undefined) return "—";
  const amount = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 6 }).format(value);
  return unitCode ? `${amount} / ${unitCode}` : `${amount} · U.M. prezzo non indicata`;
}

/**
 * Valore merce e costo per U.M. di magazzino: solo con prezzo, U.M. del prezzo e quantità del prezzo.
 * Nessuna conversione media: senza dati resta vuoto, mai zero.
 */
export function receiptValue(input: {
  unitCost: number | null;
  priceUnitCode: string | null;
  priceQuantity: number | null;
  stockQuantity: number | null;
}) {
  const { unitCost, priceUnitCode, priceQuantity, stockQuantity } = input;
  if (unitCost === null || !priceUnitCode || priceQuantity === null || priceQuantity <= 0) return null;
  const value = priceQuantity * unitCost;
  const stockUnitCost = stockQuantity && stockQuantity > 0 ? value / stockQuantity : null;
  return { value, stockUnitCost };
}
