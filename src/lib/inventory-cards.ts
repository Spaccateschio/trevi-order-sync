// Modello 2: una card = prodotto + ubicazione + collegamento fornitore (null = «Senza fornitore»).
// Regole solo di presentazione: chi è visibile lo decide il database (inventory_cards_for).

export type InventoryCardLike = {
  product_id: string;
  location_id: string;
  product_supplier_link_id?: string | null;
  supplier_name?: string | null;
  link_active?: boolean | null;
  card_favorite?: boolean | null;
  counted?: number | null;
  counted_unit_code?: string | null;
  stock_unit_code?: string | null;
};

const NO_LINK = "-";

/** Chiave unica della card, usata da tutte le schermate. null ≠ qualsiasi collegamento. */
export function cardKey(productId: string, locationId: string, linkId: string | null | undefined) {
  return `${productId}:${locationId}:${linkId ?? NO_LINK}`;
}

export function rowCardKey(row: InventoryCardLike) {
  return cardKey(row.product_id, row.location_id, row.product_supplier_link_id ?? null);
}

export function parseCardKey(key: string): { productId: string; locationId: string; linkId: string | null } | null {
  const [productId, locationId, link] = key.split(":");
  if (!productId || !locationId || !link) return null;
  return { productId, locationId, linkId: link === NO_LINK ? null : link };
}

/** Gruppo = stesso prodotto nella stessa ubicazione. */
export function groupKey(row: InventoryCardLike) {
  return `${row.product_id}:${row.location_id}`;
}

function cardRank(row: InventoryCardLike) {
  if (!row.product_supplier_link_id) return 3; // «Senza fornitore» per ultima
  if (row.card_favorite) return 0;
  if (row.link_active === false) return 2; // fornitore scollegato
  return 1;
}

/** Stella, fornitori attivi A→Z, fornitori scollegati, «Senza fornitore». */
export function compareCards(left: InventoryCardLike, right: InventoryCardLike) {
  const rank = cardRank(left) - cardRank(right);
  if (rank) return rank;
  return (left.supplier_name ?? "").localeCompare(right.supplier_name ?? "", "it", { sensitivity: "base" })
    || (left.product_supplier_link_id ?? "").localeCompare(right.product_supplier_link_id ?? "");
}

export function cardTitle(row: InventoryCardLike) {
  return row.product_supplier_link_id ? (row.supplier_name?.trim() || "Fornitore") : "Senza fornitore";
}

/**
 * Totale del prodotto: somma delle quantità contate solo se tutte le card contate
 * usano la stessa U.M. Nessuna conversione: U.M. diverse → null.
 */
export function productCardTotal(cards: InventoryCardLike[]): { total: number; unit: string; counted: number } | { total: null; reason: "nessun_conteggio" | "um_diverse" } {
  const counted = cards.filter((card) => card.counted !== null && card.counted !== undefined);
  if (!counted.length) return { total: null, reason: "nessun_conteggio" };
  const units = new Set(counted.map((card) => (card.counted_unit_code?.trim() || card.stock_unit_code?.trim() || "").toLowerCase()));
  if (units.size !== 1 || units.has("")) return { total: null, reason: "um_diverse" };
  const first = counted[0]!;
  const unit = first.counted_unit_code?.trim() || first.stock_unit_code?.trim() || "";
  return { total: counted.reduce((sum, card) => sum + Number(card.counted), 0), unit, counted: counted.length };
}
