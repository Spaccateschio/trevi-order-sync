import { describe, expect, it } from "vitest";
import { countedRowPatch, patchCardRow, restoreCardRow } from "./inventory-optimistic";

type R = { k: string; calculated: number | null; counted: number | null; difference: number | null; counted_at: string | null; counted_unit_code: string | null; recount_requested_at: string | null };
const base = (k: string): R => ({ k, calculated: 10, counted: null, difference: null, counted_at: null, counted_unit_code: null, recount_requested_at: null });

describe("inventory optimistic", () => {
  it("patcha solo la card confermata", () => {
    const rows = [base("a"), base("b")];
    const next = patchCardRow(rows, "a", (r) => r.k, (r) => countedRowPatch(r, { value: 12, unitCode: "kg", stockValue: 12, at: "t" }) as Partial<R>)!;
    expect(next[0]!.counted).toBe(12);
    expect(next[0]!.difference).toBe(2);
    expect(next[1]).toBe(rows[1]);
  });
  it("senza equivalente in U.M. di magazzino la differenza resta sconosciuta, mai zero", () => {
    expect(countedRowPatch(base("a"), { value: 3, unitCode: "cs", stockValue: null, at: "t" }).difference).toBeNull();
  });
  it("ripristina la card originale su errore", () => {
    const rows = [base("a"), base("b")];
    const patched = patchCardRow(rows, "a", (r) => r.k, () => ({ counted: 5 }))!;
    const restored = restoreCardRow(patched, "a", (r) => r.k, rows[0])!;
    expect(restored[0]).toBe(rows[0]);
    expect(restored[0]!.counted).toBeNull();
  });
});
