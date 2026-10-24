import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { supplierCodeFor, visibleSelection } from "@/lib/catalog-link-selection";

describe("finestra collegamento catalogo", () => {
  it("il codice viene dall'articolo selezionato (patate 0255)", () => {
    assert.equal(supplierCodeFor({ code: " 0255 " }), "0255");
  });

  it("cambiando articolo il codice cambia (pere 0055)", () => {
    assert.equal(supplierCodeFor({ code: "0055" }), "0055");
  });

  it("selezione non più visibile dopo la ricerca: annullata", () => {
    assert.equal(visibleSelection("pere", ["patate"]), null);
  });

  it("selezione ancora visibile: mantenuta", () => {
    assert.equal(visibleSelection("patate", ["patate", "zucca"]), "patate");
  });
});
