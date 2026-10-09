import { describe, expect, it } from "vitest";
import { orderPriceNote } from "./purchase";

describe("orderPriceNote", () => {
  it("B2B senza prezzo = Prezzo su richiesta", () => {
    expect(orderPriceNote({ unitCost: null, priceUnitCode: "pz", purchaseUnitCode: "pz", isB2b: true })?.price).toBe("Prezzo su richiesta");
  });
  it("prezzo al kg ordinato in cassa = Da pesare al carico", () => {
    expect(orderPriceNote({ unitCost: 2.5, priceUnitCode: "kg", purchaseUnitCode: "cs", isB2b: true })?.weigh).toBe(true);
  });
  it("prezzo in pz ordinato in mz: nessun Da pesare", () => {
    expect(orderPriceNote({ unitCost: 0.9, priceUnitCode: "pz", purchaseUnitCode: "mz", isB2b: true })?.weigh).toBe(false);
  });
  it("fornitore esterno senza prezzo: nessuna scritta", () => {
    expect(orderPriceNote({ unitCost: null, priceUnitCode: null, purchaseUnitCode: "pz", isB2b: false })).toBeNull();
  });
});
