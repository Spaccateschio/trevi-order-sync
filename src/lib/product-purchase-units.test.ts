import { describe, expect, it } from "vitest";
import { sharedPurchaseUnitChoices, addProductPurchaseUnit, allowedPurchaseUnits, validatePurchaseSelection, productPurchaseDefault, mergeManualPurchaseUnits, type ProductPurchaseUnitCode } from "./product-purchase-units";
const units = [
  { id: "kg", company_id: "a", status: "attivo", usage: "acquisto" },
  { id: "cs", company_id: "a", status: "attivo", usage: "entrambi" },
  { id: "sale", company_id: "a", status: "attivo", usage: "vendita" },
  { id: "off", company_id: "a", status: "disattivato", usage: "acquisto" },
  { id: "other", company_id: "b", status: "attivo", usage: "acquisto" },
];
describe("U.M. proprie del prodotto", () => {
  const own: ProductPurchaseUnitCode[] = [{ product_id: "1847", unit_id: "cs", is_default: true, units_of_measure: { code: "cassa", status: "attivo", usage: "acquisto" } }];
  const linked = [{ unitId: "mazzo", code: "mazzo", conversionFactor: 1, conversionType: "esatta" }];
  it("due fornitori manuali già collegati ricevono cassa senza configurarla nuovamente", () => {
    const a = [{ unit_id: "mazzo", code: "mazzo", is_active: true, is_default: false }];
    const b = [{ unit_id: "kg", code: "kg", is_active: true, is_default: false }];
    expect(sharedPurchaseUnitChoices(a, own, "1847", false).map(u => u.code)).toEqual(["mazzo", "cassa"]);
    expect(sharedPurchaseUnitChoices(b, own, "1847", false).map(u => u.code)).toEqual(["kg", "cassa"]);
  });
  it("le U.M. condivise non entrano nella referenza B2B", () => expect(sharedPurchaseUnitChoices([], own, "1847", true)).toEqual([]));
  it("una U.M. già configurata conserva stella e conversione", () => {
    const a = [{ unit_id: "cs", code: "cassa", is_active: true, is_default: false, factor: 10 }];
    expect(sharedPurchaseUnitChoices(a, own, "1847", false)).toEqual(a);
  });
  it("esclude le U.M. inattive o di altri prodotti", () => expect(sharedPurchaseUnitChoices([], [...own.map(u => ({...u, units_of_measure: {...u.units_of_measure, code: "cassa", usage: "acquisto", status: "disattivato"}}))], "1847", false)).toEqual([]));
  it("BASILICO 1847 propone la cassa preferita anziché mazzo", () => expect(productPurchaseDefault(own, "1847")).toEqual({ unitId: "cs", code: "cassa" }));
  it("non prende la preferita di un altro prodotto", () => expect(productPurchaseDefault(own, "altro")).toBeNull());
  it("fornitore manuale usa solo le U.M. della tab Acquisto (mazzo della referenza escluso)", () => expect(mergeManualPurchaseUnits(linked, own, "1847", false)).toEqual([{ unitId: "cs", code: "cassa", conversionFactor: null, conversionType: null, isDefault: true }]));
  it("senza U.M. del prodotto restano quelle della referenza", () => expect(mergeManualPurchaseUnits(linked, [], "1847", false)).toEqual(linked));
  it("B2B mantiene solo le unità del venditore", () => expect(mergeManualPurchaseUnits(linked, own, "1847", true)).toEqual(linked));
  it("non duplica né altera la conversione della referenza", () => {
    const existing = [{ unitId: "cs", code: "cassa", conversionFactor: 10, conversionType: "esatta" }];
    expect(mergeManualPurchaseUnits(existing, own, "1847", false)).toEqual([{ ...existing[0], isDefault: true }]);
  });
  it("la prima U.M. acquisto cassa diventa automaticamente preferita", () => expect(addProductPurchaseUnit({ ids: [], defaultId: null }, "cs")).toEqual({ ids: ["cs"], defaultId: "cs" }));
  it("aggiungere un'altra U.M. mantiene la preferita scelta", () => expect(addProductPurchaseUnit({ ids: ["cs"], defaultId: "cs" }, "kg")).toEqual({ ids: ["cs", "kg"], defaultId: "cs" }));
  it("non sostituisce una stella tolta esplicitamente", () => expect(addProductPurchaseUnit({ ids: ["cs"], defaultId: null }, "kg")).toEqual({ ids: ["cs", "kg"], defaultId: null }));
  it("ammette solo U.M. aziendali attive acquisto o entrambi", () => expect(allowedPurchaseUnits(units, "a").map((u) => u.id)).toEqual(["kg", "cs"]));
  it("la predefinita deve essere tra quelle scelte", () => expect(() => validatePurchaseSelection(units, "a", ["kg"], "cs")).toThrow("predefinita"));
  it("salva senza richiedere alcun fornitore", () => expect(validatePurchaseSelection(units, "a", ["kg", "cs"], "cs")).toEqual(["kg", "cs"]));
  it("rifiuta U.M. esterne o inventate", () => expect(() => validatePurchaseSelection(units, "a", ["inventata"], null)).toThrow());
  it("consente rimozione della configurazione senza unità sostitutive", () => expect(validatePurchaseSelection(units, "a", [], null)).toEqual([]));
});