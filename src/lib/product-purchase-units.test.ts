import { describe, expect, it } from "vitest";
import { addProductPurchaseUnit, allowedPurchaseUnits, validatePurchaseSelection } from "./product-purchase-units";
const units = [
  { id: "kg", company_id: "a", status: "attivo", usage: "acquisto" },
  { id: "cs", company_id: "a", status: "attivo", usage: "entrambi" },
  { id: "sale", company_id: "a", status: "attivo", usage: "vendita" },
  { id: "off", company_id: "a", status: "disattivato", usage: "acquisto" },
  { id: "other", company_id: "b", status: "attivo", usage: "acquisto" },
];
describe("U.M. proprie del prodotto", () => {
  it("la prima U.M. acquisto cassa diventa automaticamente preferita", () => expect(addProductPurchaseUnit({ ids: [], defaultId: null }, "cs")).toEqual({ ids: ["cs"], defaultId: "cs" }));
  it("aggiungere un'altra U.M. mantiene la preferita scelta", () => expect(addProductPurchaseUnit({ ids: ["cs"], defaultId: "cs" }, "kg")).toEqual({ ids: ["cs", "kg"], defaultId: "cs" }));
  it("non sostituisce una stella tolta esplicitamente", () => expect(addProductPurchaseUnit({ ids: ["cs"], defaultId: null }, "kg")).toEqual({ ids: ["cs", "kg"], defaultId: null }));
  it("ammette solo U.M. aziendali attive acquisto o entrambi", () => expect(allowedPurchaseUnits(units, "a").map((u) => u.id)).toEqual(["kg", "cs"]));
  it("la predefinita deve essere tra quelle scelte", () => expect(() => validatePurchaseSelection(units, "a", ["kg"], "cs")).toThrow("predefinita"));
  it("salva senza richiedere alcun fornitore", () => expect(validatePurchaseSelection(units, "a", ["kg", "cs"], "cs")).toEqual(["kg", "cs"]));
  it("rifiuta U.M. esterne o inventate", () => expect(() => validatePurchaseSelection(units, "a", ["inventata"], null)).toThrow());
  it("consente rimozione della configurazione senza unità sostitutive", () => expect(validatePurchaseSelection(units, "a", [], null)).toEqual([]));
});