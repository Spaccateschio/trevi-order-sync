import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { template } from "./invito-collegamento";

/**
 * Nell'email di invito il riquadro d'identità mostra «Partita IVA» quando
 * l'azienda ne ha una (11 cifre, eventuale prefisso "IT"), altrimenti
 * «Codice fiscale»: mai un'etichetta che non corrisponde al dato anagrafico.
 */
function renderIdentity(customerTaxId: string): string {
  return renderToStaticMarkup(
    createElement(template.component, {
      sellerName: "Trevi Fruit S.R.L.",
      recipientName: "Azienda di prova",
      customerTaxId,
    }),
  );
}

test("etichetta Partita IVA con 11 cifre", () => {
  assert.ok(renderIdentity("01234567890").includes("Partita IVA"));
});

test("accetta il prefisso IT davanti alla P.IVA", () => {
  assert.ok(renderIdentity("IT01234567890").includes("Partita IVA"));
});

test("etichetta Codice fiscale per un CF di 16 caratteri", () => {
  assert.ok(renderIdentity("RSSMRA85M01H501Z").includes("Codice fiscale"));
});

test("nessuna etichetta quando il dato manca", () => {
  const html = renderIdentity("");
  assert.ok(!html.includes("Partita IVA"));
  assert.ok(!html.includes("Codice fiscale"));
});
