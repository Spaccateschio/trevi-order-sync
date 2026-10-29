import { describe, expect, it } from "vitest";
import { afterInventoryDraftWrites, confirmAllSummary, inventoryBulkReview, inventoryDifferenceOverHalf, inventoryDraftQuantity, type InventoryReviewCard } from "./inventory-confirm-all";

describe("confirmAllSummary", () => {
  it("senza bozze segnala che non c'è nulla da confermare", () => {
    expect(confirmAllSummary({ confirmed: 0, skipped: [] })).toEqual({
      kind: "empty",
      message: "Nessuna bozza da confermare",
    });
  });

  it("con sole conferme riporta il numero di quantità confermate", () => {
    expect(confirmAllSummary({ confirmed: 5, skipped: [] })).toEqual({
      kind: "done",
      message: "5 quantità confermate",
    });
  });

  it("con saltate elenca le prime tre e segnala il parziale", () => {
    const result = confirmAllSummary({
      confirmed: 2,
      skipped: [
        { label: "AGLIO", reason: "x" },
        { label: "BASILICO", reason: "x" },
        { label: "CARCIOFI", reason: "x" },
        { label: "DATTERI", reason: "x" },
      ],
    });
    expect(result.kind).toBe("partial");
    expect(result.message).toBe("4 non confermate: AGLIO, BASILICO, CARCIOFI…");
  });

  it("le saltate restano bozze anche se nessuna è stata confermata", () => {
    const result = confirmAllSummary({ confirmed: 0, skipped: [{ label: "AGLIO", reason: "x" }] });
    expect(result.kind).toBe("partial");
    expect(result.message).toBe("1 non confermate: AGLIO");
  });
});

const card = (overrides: Partial<InventoryReviewCard> = {}): InventoryReviewCard => ({
  key: "p:z:s", productId: "p", label: "AGLIO", detail: "Fornitore · Zona", raw: "2", alreadyCounted: false,
  calculated: 10, unit: "kg", countedUnit: "cs", factor: 10, blockedReason: null, ...overrides,
});

describe("riepilogo preventivo inventario", () => {
  it("i vuoti restano mai contati e non sono quantità zero", () => {
    expect(inventoryDraftQuantity("  ")).toBeNull();
    const result = inventoryBulkReview([card({ raw: "" })]);
    expect(result.empty).toHaveLength(1);
    expect(result.ready).toHaveLength(0);
  });
  it("zero esplicito è da confermare", () => {
    const result = inventoryBulkReview([card({ raw: "0" })]);
    expect(result.empty).toHaveLength(0);
    expect(result.ready).toHaveLength(1);
    expect(result.differences[0]?.counted).toBe(0);
  });
  it("già contato senza nuova bozza non è vuoto né da confermare", () => {
    const result = inventoryBulkReview([card({ raw: "", alreadyCounted: true })]);
    expect([result.empty.length, result.ready.length, result.blocked.length]).toEqual([0, 0, 0]);
  });
  it("blocca quantità invalide con il motivo", () => {
    expect(inventoryBulkReview([card({ raw: "abc" })]).blocked[0]?.blockedReason).toBe("Quantità non valida");
    expect(inventoryDraftQuantity("-1")).toBeNull();
  });
  it("confezione mancante non crea una falsa differenza", () => {
    const result = inventoryBulkReview([card({ factor: null })]);
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0]?.raw).toBe("2");
    expect(result.ready[0]?.countedUnit).toBe("cs");
    expect(result.blocked).toHaveLength(0);
    expect(result.differences).toHaveLength(0);
  });
  it("confezione ambigua consente il conteggio senza equivalente inventato", () => {
    const result = inventoryBulkReview([card({ factor: null })]);
    expect(result.ready[0]?.factor).toBeNull();
    expect(result.differences).toHaveLength(0);
  });
  it("senza U.M. magazzino conferma la quantità nella U.M. scelta", () => {
    const result = inventoryBulkReview([card({ unit: "", countedUnit: "cs", factor: null, raw: "1,5" })]);
    expect(result.ready).toHaveLength(1);
    expect(inventoryDraftQuantity(result.ready[0]?.raw ?? "")).toBe(1.5);
    expect(result.differences).toHaveLength(0);
  });
  it("2 casse da 10 sono 20 kg, differenza 10 kg rispetto a 10", () => {
    const row = inventoryBulkReview([card()]).differences[0];
    expect([row?.counted, row?.difference, row?.unit]).toEqual([20, 10, "kg"]);
  });
  it("due fornitori dello stesso prodotto mantengono unità indipendenti", () => {
    const result = inventoryBulkReview([card(), card({ key: "p:z:s2", raw: "3", countedUnit: "kg", factor: 1 })]);
    expect(result.products.ready).toBe(1);
    expect(result.ready).toHaveLength(2);
    expect(result.differences.map((row) => row.counted)).toEqual([20, 3]);
  });
  it("mostra solo le 10 maggiori differenze per valore assoluto", () => {
    const result = inventoryBulkReview(Array.from({ length: 12 }, (_, i) => card({ key: String(i), raw: String(i), factor: 1, calculated: 0 })));
    expect(result.differences).toHaveLength(10);
    expect(result.differences.map((row) => row.difference)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  });
  it("esattamente 50% non evidenziato", () => {
    expect(inventoryDifferenceOverHalf(100, 150)).toBe(false);
    expect(inventoryDifferenceOverHalf(100, 50)).toBe(false);
  });
  it("oltre il 50% evidenziato in entrambe le direzioni", () => {
    expect(inventoryDifferenceOverHalf(100, 150.01)).toBe(true);
    expect(inventoryDifferenceOverHalf(100, 49.99)).toBe(true);
  });
  it("calcolata zero evidenzia solo un conteggio diverso da zero", () => {
    expect(inventoryDifferenceOverHalf(0, 0)).toBe(false);
    expect(inventoryDifferenceOverHalf(0, 1)).toBe(true);
  });
  it("calcolata sconosciuta non genera differenze", () => {
    expect(inventoryBulkReview([card({ calculated: null })]).differences).toHaveLength(0);
    expect(inventoryDifferenceOverHalf(null, 20)).toBe(false);
  });
  it("nota non richiesta per confermare una differenza", () => {
    const result = inventoryBulkReview([card()]);
    expect(result.ready).toHaveLength(1);
    expect(result.blocked).toHaveLength(0);
  });
  it("attende tutte le scritture effettive prima del comando", async () => {
    let resolveWrite: (value: unknown) => void = () => {};
    const write = new Promise((resolve) => { resolveWrite = resolve; });
    let called = false;
    const result = afterInventoryDraftWrites([write], async () => { called = true; return "aperto"; });
    await Promise.resolve();
    expect(called).toBe(false);
    resolveWrite(null);
    expect(await result).toBe("aperto");
    expect(called).toBe(true);
  });
  it("errore salvataggio impedisce la conferma", async () => {
    let called = false;
    await expect(afterInventoryDraftWrites([Promise.reject(new Error("salvataggio fallito"))], async () => { called = true; })).rejects.toThrow("salvataggio fallito");
    expect(called).toBe(false);
  });
});
