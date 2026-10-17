import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Email } from "./invito-collegamento";

/**
 * Nell'email di invito il riquadro d'identità mostra «Partita IVA» quando
 * l'azienda ne ha una (11 cifre, eventuale prefisso "IT"), altrimenti
 * «Codice fiscale»: mai un'etichetta che non corrisponde al dato anagrafico.
 */
function renderIdentity(customerTaxId: string): string {
  return renderToStaticMarkup(
    createElement(Email, {
      sellerName: "Trevi Fruit S.R.L.",
      recipientName: "Azienda di prova",
      customerTaxId,
    }),
  );
}

describe("invito-collegamento: riquadro azienda", () => {
  it("etichetta Partita IVA con 11 cifre", () => {
    expect(renderIdentity("01234567890")).toContain("Partita IVA");
  });

  it("accetta il prefisso IT davanti alla P.IVA", () => {
    expect(renderIdentity("IT01234567890")).toContain("Partita IVA");
  });

  it("etichetta Codice fiscale per un CF di 16 caratteri", () => {
    expect(renderIdentity("RSSMRA85M01H501Z")).toContain("Codice fiscale");
  });

  it("nessuna etichetta quando il dato manca", () => {
    expect(renderIdentity("")).not.toContain("Partita IVA");
    expect(renderIdentity("")).not.toContain("Codice fiscale");
  });
});
