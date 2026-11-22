import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { inventoryAcceptsDrafts, inventoryResetAction, inventoryReopenQueryKeys } from "./inventory-reset";

describe("Inventory reset boundaries", () => {
  it("an open inventory clears drafts and confirmed counts of the session", () => {
    assert.equal(inventoryResetAction(true, false), "clear_open");
    assert.equal(inventoryResetAction(true, true), "clear_open");
  });
  it("a completed locked cycle uses the authorized reopening flow", () => {
    assert.equal(inventoryResetAction(false, true), "reopen");
  });
  it("without a locked cycle clearing does not reopen a past inventory", () => {
    assert.equal(inventoryResetAction(false, false), "clear_open");
  });
  it("a closed red cycle has no active cart draft, while a new inventory keeps it", () => {
    assert.equal(inventoryAcceptsDrafts(false, true), false);
    assert.equal(inventoryAcceptsDrafts(false, false), true);
    assert.equal(inventoryAcceptsDrafts(true, true), true);
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