import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickFromCardReads, supplierBriefText } from "./supplier-brief";

const overview = (linkId: string, name: string, p: Record<string, unknown> = {}) => ({
  link_id: linkId, supplier_name: name, is_active: true, is_preferred: false, ...p,
});

describe("Riga riassuntiva fornitori in card", () => {
  it("AGLIO SPAGNA: due quote salvate in una riga sola", () => {
    assert.equal(
      supplierBriefText([
        { name: "CATARINACCI", quantity: 3, unitCode: "cs" },
        { name: "GARBAGLIA FRUIT SRL", quantity: 2, unitCode: "cs" },
      ]),
      "CATARINACCI 3 cs · GARBAGLIA FRUIT SRL 2 cs",
    );
  });

  it("ALLORO IT A MAZZI: fornitore scelto senza quota resta visibile con il motivo", () => {
    assert.equal(supplierBriefText([{ name: "GERMANO", quantity: null, note: "proposto" }]), "GERMANO (proposto)");
  });

  it("zero contato: la quota 0 cs si scrive, non sparisce dalla riga", () => {
    assert.equal(supplierBriefText([{ name: "GERMANO", quantity: 0, unitCode: "cs" }]), "GERMANO 0 cs");
  });

  it("nessun fornitore: riga vuota, la card resta aperta per scegliere", () => {
    assert.equal(supplierBriefText([]), "");
  });

  it("proposta da lettura card: solo il collegamento attivo con la stella", () => {
    const pool = pickFromCardReads(
      [overview("l-germano", "GERMANO", { is_preferred: true }), overview("l-barone", "AGRICOLA BARONE"), overview("l-off", "FUSCO", { is_active: false })],
      [],
      [],
    );
    assert.deepEqual(pool.map((s) => [s.linkId, s.isPreferred]), [["l-germano", true], ["l-barone", false]]);
  });

  it("B2B pubblicato dal venditore: idoneo; B2B senza articolo sorgente: no", () => {
    const pool = pickFromCardReads(
      [overview("l-ok", "FRUTTITAL"), overview("l-no", "FORNITORE SENZA CATALOGO")],
      [
        { link_id: "l-ok", is_b2b: true, source_product_id: "p-sorgente", purchasable: true },
        { link_id: "l-no", is_b2b: true, source_product_id: null, purchasable: false },
      ],
      [],
    );
    assert.deepEqual(pool.map((s) => [s.linkId, s.sourceLinked, s.purchasable]), [
      ["l-ok", true, true],
      ["l-no", false, false],
    ]);
  });

  it("U.M. del collegamento (shopping_item_supplier_units) hanno la precedenza sulle opzioni B2B", () => {
    const pool = pickFromCardReads(
      [overview("l-1", "GARBAGLIA FRUIT SRL")],
      [{ link_id: "l-1", is_b2b: true, source_product_id: "p-sorg", purchasable: true }],
      [{ link_id: "l-1", is_b2b: false, source_linked: false, allow_manual: true, purchasable: true }],
    );
    assert.deepEqual(pool.map((s) => [s.isB2B, s.allowManual]), [[false, true]]);
  });
});
