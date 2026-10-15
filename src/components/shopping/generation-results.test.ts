import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCreateAction, orderShareText, replaceOutcome, summarize, type GenerationOutcome } from "./generation-results";

test("B2B si invia subito tramite piattaforma", () => {
  assert.equal(afterCreateAction(true), "invia_piattaforma");
});

test("non B2B resta da condividere, mai inviato automaticamente", () => {
  assert.equal(afterCreateAction(false), "condividi");
});

test("riprova sostituisce l'errore con l'esito senza duplicare il documento", () => {
  const list: GenerationOutcome[] = [
    { kind: "errore_invio", name: "Trevi", orderId: "o1", number: "ORD-1", isB2b: true, message: "x" },
    { kind: "acquisto_diretto", name: "AD", id: "a1", number: "AD-1" },
  ];
  const next = replaceOutcome(list, "o1", { kind: "inviato", name: "Trevi", orderId: "o1", number: "ORD-1" });
  assert.equal(next.length, 2);
  assert.deepEqual(summarize(next), { inviati: 1, daCondividere: 0, errori: 0, diretti: 1 });
});

test("il messaggio di condivisione contiene il link personale dell'ordine", () => {
  const t = orderShareText("ORD-3", "Breda", [{ product_name: "Mele", product_code: "M1", purchase_quantity: 2, purchase_unit_code: "kg" }], "https://x/consegna/abc");
  assert.ok(t.includes("https://x/consegna/abc"));
  assert.ok(t.includes("M1 Mele: 2 kg"));
});
