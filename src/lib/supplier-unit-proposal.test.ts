import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { supplierUnitProposal } from "./supplier-unit-proposal";

const trevi = { link_id: "t", purchasable: true, units: [{ unit_id: "mz", code: "mz", is_default: true, conversion_factor: null }, { unit_id: "cs", code: "cs", is_default: false, conversion_factor: null }] };
const base = { links: [trevi], preferredLinkIds: new Set<string>(), deselectedLinkIds: [], assignedLinkIds: [], currentCode: "pz", productUnitCode: "pz" };

describe("U.M. di acquisto del fornitore", () => {
  it("basilico a mazzi: Trevi unico, propone mz e segnala pz incompatibile", () => {
    const p = supplierUnitProposal(base)!;
    assert.equal(p.defaultUnit.code, "mz");
    assert.equal(p.compatible, false);
    assert.deepEqual(p.units.map((u) => u.code), ["mz", "cs"]);
  });
  it("U.M. venduta dal fornitore: compatibile", () => {
    assert.equal(supplierUnitProposal({ ...base, currentCode: "MZ" })!.compatible, true);
  });
  it("U.M. del prodotto con conversione valida: compatibile, nulla cambia", () => {
    const conv = { ...trevi, units: [{ unit_id: "cs", code: "cs", is_default: true, conversion_factor: 6 }] };
    assert.equal(supplierUnitProposal({ ...base, links: [conv] })!.compatible, true);
  });
  it("U.M. diversa senza conversione non diventa compatibile", () => {
    const conv = { ...trevi, units: [{ unit_id: "cs", code: "cs", is_default: true, conversion_factor: 6 }] };
    assert.equal(supplierUnitProposal({ ...base, links: [conv], currentCode: "nr" })!.compatible, false);
  });
  it("più fornitori con quota: nessuna proposta unica", () => {
    assert.equal(supplierUnitProposal({ ...base, assignedLinkIds: ["t", "x"] }), null);
  });
  it("due fornitori senza stella: nessuna scelta arbitraria; con una stella sola sì", () => {
    const other = { ...trevi, link_id: "x" };
    assert.equal(supplierUnitProposal({ ...base, links: [trevi, other] }), null);
    assert.equal(supplierUnitProposal({ ...base, links: [trevi, other], preferredLinkIds: new Set(["x"]) })!.linkId, "x");
  });
  it("fornitore tolto volontariamente o non acquistabile: non proposto", () => {
    assert.equal(supplierUnitProposal({ ...base, deselectedLinkIds: ["t"] }), null);
    assert.equal(supplierUnitProposal({ ...base, links: [{ ...trevi, purchasable: false }] }), null);
  });
});
