/** Tipi e calcoli condivisi della Lista della Spesa. Nessun arrotondamento automatico: solo proposte. */

export type ShoppingListStatus = "aperta" | "confermata" | "chiusa" | "annullata";
export type ItemStatus = "da_assegnare" | "parziale" | "assegnata";

export type ShoppingListRow = {
  id: string;
  name: string;
  status: ShoppingListStatus;
  archive_id: string;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  closed_at: string | null;
};

export type OverviewRow = {
  item_id: string;
  product_id: string;
  code: string;
  description: string | null;
  unit_code: string | null;
  suggested_quantity: number | null;
  decided_quantity: number;
  change_reason: string | null;
  origin: "manuale" | "fabbisogno";
  snapshot_available: number | null;
  snapshot_needed: number | null;
  snapshot_min_stock: number | null;
  snapshot_raw_need: number | null;
  snapshot_order_multiple: number | null;
  current_available: number | null;
  current_min_stock: number | null;
  current_order_multiple: number | null;
  current_suggested: number | null;
  assigned: number;
  remaining: number;
  status: ItemStatus;
  untranslatable: number;
  under_minimum: number;
  suppliers_available: number;
  created_at: string;
};

export type AssignmentRow = {
  id: string;
  item_id: string;
  product_supplier_link_id: string;
  supplier_record_id: string;
  assigned_quantity: number;
  purchase_quantity: number | null;
  purchase_unit_code: string | null;
  conversion_factor: number | null;
  min_warning_accepted: boolean;
  notes: string | null;
};

export const LIST_STATUS_LABEL: Record<ShoppingListStatus, string> = {
  aperta: "Aperta",
  confermata: "Confermata",
  chiusa: "Chiusa",
  annullata: "Annullata",
};

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  da_assegnare: "Da assegnare",
  parziale: "Parziale",
  assegnata: "Assegnata",
};

/** Percentuali solo di lettura: nascono dalle quantità e non vengono salvate. */
export function sharePercent(quantity: number, total: number) {
  if (!total) return 0;
  return Math.round((quantity / total) * 100);
}

/**
 * Lettura in confezioni del fornitore: quante confezioni servirebbero, quante sono intere
 * e quanto si compra in più. Nessun valore viene applicato da solo: è una proposta.
 */
export function packProposal(assignedQuantity: number, conversionFactor: number | null) {
  if (!conversionFactor || conversionFactor <= 0) return null;
  const rawPacks = assignedQuantity / conversionFactor;
  const wholePacks = Math.ceil(rawPacks - 1e-9);
  const equivalent = wholePacks * conversionFactor;
  return {
    rawPacks,
    wholePacks,
    equivalent,
    surplus: equivalent - assignedQuantity,
    exact: Math.abs(equivalent - assignedQuantity) < 1e-9,
  };
}

/** L'assegnazione è traducibile se l'U.M. coincide o se esiste una conversione esplicita. */
export function isTranslatable(
  itemUnitCode: string | null,
  purchaseUnitCode: string | null,
  conversionFactor: number | null,
) {
  const purchase = (purchaseUnitCode ?? "").trim().toLowerCase();
  if (!purchase) return true;
  if (purchase === (itemUnitCode ?? "").trim().toLowerCase()) return true;
  return conversionFactor !== null && conversionFactor > 0;
}
