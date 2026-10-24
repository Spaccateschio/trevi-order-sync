import { describe, expect, it } from "vitest";

import { manualLinksForPurchaseUnits, planPurchaseUnitApply } from "./purchase-unit-apply";

const unit = (unitId: string, opts: { isActive?: boolean; isDefault?: boolean } = {}) => ({
  unit_id: unitId,
  is_active: opts.isActive ?? true,
  is_default: opts.isDefault ?? false,
});

describe("manualLinksForPurchaseUnits", () => {
  it("esclude le referenze B2B e le disattivate", () => {
    const links = [
      { link_id: "b2b", is_active: true, b2b_relation_status: "attivo", purchase_units: [] },
      { link_id: "off", is_active: false, b2b_relation_status: null, purchase_units: [] },
      { link_id: "manuale", is_active: true, b2b_relation_status: null, purchase_units: [] },
    ];
    expect(manualLinksForPurchaseUnits(links).map((link) => link.link_id)).toEqual(["manuale"]);
  });
});

describe("planPurchaseUnitApply", () => {
  it("aggiunge solo le U.M. mancanti su ogni referenza manuale", () => {
    const links = [
      { link_id: "a", is_active: true, b2b_relation_status: null, purchase_units: [unit("kg")] },
      { link_id: "b", is_active: true, b2b_relation_status: null, purchase_units: [] },
    ];
    const ops = planPurchaseUnitApply(links, ["kg", "cs"], null, {});
    expect(ops).toEqual([
      { linkId: "a", unitId: "cs", action: "add", conversionFactor: null, conversionType: null },
      { linkId: "b", unitId: "kg", action: "add", conversionFactor: null, conversionType: null },
      { linkId: "b", unitId: "cs", action: "add", conversionFactor: null, conversionType: null },
    ]);
  });

  it("salta le referenze B2B e disattivate", () => {
    const links = [
      { link_id: "b2b", is_active: true, b2b_relation_status: "attivo", purchase_units: [] },
      { link_id: "off", is_active: false, b2b_relation_status: null, purchase_units: [] },
    ];
    expect(planPurchaseUnitApply(links, ["kg"], null, {})).toEqual([]);
  });

  it("scrive la conversione solo quando il fattore è un numero positivo", () => {
    const links = [{ link_id: "a", is_active: true, b2b_relation_status: null, purchase_units: [unit("kg")] }];
    const ops = planPurchaseUnitApply(links, ["cs"], null, {
      cs: { factor: 10, type: "esatta" },
      kg: { factor: -2, type: "esatta" },
    });
    expect(ops).toEqual([{ linkId: "a", unitId: "cs", action: "set_conversion", conversionFactor: 10, conversionType: "esatta" }]);
  });

  it("imposta la predefinita quando la referenza ha un'altra o nessuna", () => {
    const links = [
      { link_id: "a", is_active: true, b2b_relation_status: null, purchase_units: [unit("kg"), unit("cs", { isDefault: true })] },
      { link_id: "b", is_active: true, b2b_relation_status: null, purchase_units: [unit("cs", { isActive: false })] },
    ];
    const ops = planPurchaseUnitApply(links, ["kg", "cs"], "kg", {});
    expect(ops).toEqual([{ linkId: "a", unitId: "kg", action: "set_default", conversionFactor: null, conversionType: null }]);
  });
});
