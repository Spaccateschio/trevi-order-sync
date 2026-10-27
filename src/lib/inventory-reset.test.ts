import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { inventoryResetAction, inventoryReopenQueryKeys } from "./inventory-reset";

describe("Inventory reset boundaries", () => {
  it("an open inventory clears only drafts, never confirmed counts", () => {
    assert.equal(inventoryResetAction(true, false), "drafts");
    assert.equal(inventoryResetAction(true, true), "drafts");
  });
  it("a completed locked cycle uses the authorized reopening flow", () => {
    assert.equal(inventoryResetAction(false, true), "reopen");
  });
  it("without a locked cycle clearing does not reopen a past inventory", () => {
    assert.equal(inventoryResetAction(false, false), "drafts");
  });
  it("reopening refreshes confirmed card data and drafts for the reopened session", () => {
    assert.deepEqual(inventoryReopenQueryKeys("company", "archive", "session"), [
      ["inventory-general-session", "company", "archive"],
      ["inventory-last-closed", "company", "archive"],
      ["inventory-rows", "session"],
      ["inventory-progress", "session"],
      ["inventory-count-drafts", "session"],
    ]);
  });
});