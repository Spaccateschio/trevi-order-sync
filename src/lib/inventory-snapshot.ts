export type InventoryQuantitySnapshot = {
  counted_quantity: number | null;
  unit_code: string | null;
  stock_unit_id: string | null;
  stock_quantity: number | null;
  snapshot_version: number | null;
};

/** New observations never acquire an equivalent from later configuration. */
export function inventorySnapshotQuantity(count: InventoryQuantitySnapshot, stockId: string | null, stockCode: string | null): number | null {
  if (stockId && count.stock_unit_id === stockId && count.stock_quantity !== null) return Number(count.stock_quantity);
  if (count.snapshot_version === null && count.stock_unit_id === null && count.stock_quantity === null
    && stockCode && count.unit_code?.trim().toLowerCase() === stockCode.trim().toLowerCase()) return count.counted_quantity;
  return null;
}