import { describe, expect, it } from "vitest";
import { inventorySnapshotQuantity, type InventoryQuantitySnapshot } from "./inventory-snapshot";

const observation: InventoryQuantitySnapshot = { counted_quantity: 1.5, unit_code: "cs", stock_unit_id: null, stock_quantity: null, snapshot_version: 1 };
describe("optional inventory configuration snapshots", () => {
  it("new unconverted counts never acquire stock from later matching unit setup", () => {
    expect(inventorySnapshotQuantity(observation, "case-id", "cs")).toBeNull();
  });
  it("raw 1.5 cases never become kilograms or zero", () => {
    expect(inventorySnapshotQuantity({ ...observation, stock_unit_id: "kg-id" }, "kg-id", "kg")).toBeNull();
  });
  it("verified equivalents preserve the stored value", () => {
    expect(inventorySnapshotQuantity({ ...observation, stock_unit_id: "kg-id", stock_quantity: 15 }, "kg-id", "kg")).toBe(15);
  });
  it("legacy same-unit observations keep their previous meaning", () => {
    expect(inventorySnapshotQuantity({ ...observation, snapshot_version: null }, "case-id", "cs")).toBe(1.5);
  });
});