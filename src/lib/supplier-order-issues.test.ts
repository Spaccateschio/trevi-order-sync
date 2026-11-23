import { describe, expect, it } from "vitest";
import { supplierOrderIssueReason } from "./supplier-order-issues";

describe("motivi dei prodotti esclusi dagli ordini pronti", () => {
  it("spiega una quantità salvata senza fornitore o quota", () => {
    expect(supplierOrderIssueReason({ status: "da_assegnare" })).toBe("Quantità salvata, ma fornitore o quota da assegnare sulla card.");
  });

  it("spiega una ripartizione solo parziale", () => {
    expect(supplierOrderIssueReason({ status: "parziale" })).toBe("Una parte della quantità non è ancora assegnata a un fornitore.");
  });

  it("spiega una U.M. da verificare", () => {
    expect(supplierOrderIssueReason({ status: "da_verificare" })).toBe("U.M. di acquisto o conversione da verificare sulla card.");
  });

  it("non confonde una quantità vuota con un fornitore mancante", () => {
    expect(supplierOrderIssueReason({ status: "assegnata" })).toBe("Quantità mancante: inseriscila e confermala dalla card.");
  });
});
