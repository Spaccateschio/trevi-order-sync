import { describe, expect, it } from "vitest";
import { loadInventoryUnitMemory, saveInventoryUnitMemory } from "./inventory-unit-memory";

function mem() {
  const s = new Map<string, string>();
  return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v) };
}

describe("memoria U.M. card inventario", () => {
  it("la scelta salvata si ritrova al nuovo inventario", () => {
    const st = mem();
    saveInventoryUnitMemory(st, "c1", { card1: "cassa" });
    expect(loadInventoryUnitMemory(st, "c1")).toEqual({ card1: "cassa" });
  });
  it("aziende diverse non si mescolano", () => {
    const st = mem();
    saveInventoryUnitMemory(st, "c1", { card1: "cassa" });
    expect(loadInventoryUnitMemory(st, "c2")).toEqual({});
  });
  it("memoria rotta non blocca", () => {
    expect(loadInventoryUnitMemory({ getItem: () => "{x" }, "c1")).toEqual({});
  });
});
