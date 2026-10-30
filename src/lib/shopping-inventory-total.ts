// Totale inventario mostrato nelle card della Lista della Spesa: sola presentazione,
// nessuna scrittura. La somma segue la stessa regola dell'intestazione dell'Inventario
// (productCardTotal): solo conteggi della stessa sessione e solo U.M. uguali, mai convertiti.

import { productCardTotal, type InventoryCardLike } from "./inventory-cards";

/** Riga di conteggio letta dalla Lista della Spesa. */
export type ShoppingCountRow = {
  product_id: string;
  session_id: string;
  location_id: string;
  counted_quantity: string | number | null;
  unit_code: string | null;
  counted_at: string | null;
};

export type ShoppingInventoryTotal = {
  /** Somma dei conteggi del prodotto nella sessione dell'ultimo conteggio. */
  total: number | null;
  unit: string | null;
  reason: "nessun_conteggio" | "um_diverse" | null;
  /** Card contate entrate nella somma. */
  countedCards: number;
};

const EMPTY: ShoppingInventoryTotal = { total: null, unit: null, reason: "nessun_conteggio", countedCards: 0 };

/**
 * Per ogni prodotto: il totale contato nella sessione del suo ultimo conteggio.
 * Una sessione alla volta (quella più recente con una quantità) così i conteggi
 * di una sessione chiusa non si sommano a quelli della sessione aperta.
 * U.M. diverse tra le card → nessun totale: mai inventare una conversione.
 */
export function shoppingInventoryTotals(rows: ShoppingCountRow[]): Map<string, ShoppingInventoryTotal> {
  const byProduct = new Map<string, ShoppingCountRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }

  const result = new Map<string, ShoppingInventoryTotal>();
  for (const [productId, list] of byProduct) {
    const newest = [...list].sort((a, b) => (b.counted_at ?? "").localeCompare(a.counted_at ?? ""));
    const lastCounted = newest.find((row) => row.counted_quantity !== null && row.counted_quantity !== undefined);
    if (!lastCounted) {
      result.set(productId, EMPTY);
      continue;
    }
    const cards: InventoryCardLike[] = list
      .filter((row) => row.session_id === lastCounted.session_id)
      .map((row) => ({
        product_id: row.product_id,
        location_id: row.location_id,
        counted: row.counted_quantity === null || row.counted_quantity === undefined ? null : Number(row.counted_quantity),
        counted_unit_code: row.unit_code,
      }));
    const total = productCardTotal(cards);
    result.set(
      productId,
      total.total === null
        ? { total: null, unit: null, reason: total.reason, countedCards: 0 }
        : { total: total.total, unit: total.unit, reason: null, countedCards: total.counted },
    );
  }
  return result;
}
