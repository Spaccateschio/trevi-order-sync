import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { inventoryCompactBar } from "./inventory-scroll";

describe("Stable inventory scroll threshold", () => {
  it("compacts only after the marker passes the entry margin", () => {
    assert.equal(inventoryCompactBar(false, 168, 200, 56), false);
    assert.equal(inventoryCompactBar(false, 169, 200, 56), true);
  });
  it("does not oscillate when scrolling back around the entry threshold", () => {
    let compact = true;
    for (const y of [169, 167, 170, 165, 168]) compact = inventoryCompactBar(compact, y, 200, 56);
    assert.equal(compact, true);
  });
  it("expands at the separate exit threshold", () => {
    assert.equal(inventoryCompactBar(true, 149, 200, 56), true);
    assert.equal(inventoryCompactBar(true, 148, 200, 56), false);
  });
  it("desktop uses the same margins without the mobile inset", () => {
    assert.equal(inventoryCompactBar(false, 225, 200, 0), true);
    assert.equal(inventoryCompactBar(true, 204, 200, 0), false);
  });
});