import { quantityHasDraft } from "./shopping-quantity-state";

export type CatalogReviewProduct = { key: string; code: string; name: string; nonPurchase: boolean };

/** Fuori dalla Lista richiedono quantità solo i prodotti propri già preferiti. */
export function catalogProductRequiresQuantity(
  product: { ownProductId: string | null },
  favoriteProductIds: ReadonlySet<string>,
): boolean {
  return Boolean(product.ownProductId && favoriteProductIds.has(product.ownProductId));
}

/** Senza sessione si contano solo i preferiti; nella sessione scelta servono tutte le sue righe. */
export function inventoryProductRequiresQuantity(sessionActive: boolean, isFavorite: boolean): boolean {
  return sessionActive || isFavorite;
}

/** Presentation only: full favorite catalog, not filtered/paginated cards or bulk inputs. */
export function catalogQuantityReview(
  products: readonly { key: string; code: string; description: string | null; ownProductId: string | null }[],
  drafts: Readonly<Record<string, { raw: string }>>,
  notBuying: ReadonlySet<string>,
  favoriteProductIds: ReadonlySet<string>,
): CatalogReviewProduct[] {
  return products.filter((product) => catalogProductRequiresQuantity(product, favoriteProductIds))
    .filter((product) => notBuying.has(product.key) || !(drafts[product.key]?.raw ?? "").trim())
    .map((product) => ({ key: product.key, code: product.code, name: product.description ?? product.code, nonPurchase: notBuying.has(product.key) }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export type QuantityCompletionFacts = {
  id: string;
  quantity: number | null;
  locked: boolean;
  excluded?: boolean | undefined;
  nonPurchase?: boolean | undefined;
  draft?: string | undefined;
  unitChanged?: boolean | undefined;
};

/** Only a visibly empty field is eligible; 0, positive and invalid text need explicit row confirmation. */
export function hasEmptyCompletionQuantity(row: QuantityCompletionFacts): boolean {
  return row.draft === undefined ? row.quantity === null : row.draft.trim() === "";
}

/** Uses the entire list, never the visible/filter subset. No writes or conversions. */
export function missingQuantities<T extends QuantityCompletionFacts>(rows: T[]): T[] {
  return rows.filter((row) => {
    if (row.excluded || (row.nonPurchase && row.draft === undefined)) return false;
    return row.quantity === null || row.quantity <= 0 || !row.locked || row.unitChanged || quantityHasDraft(row.draft, row.quantity);
  });
}