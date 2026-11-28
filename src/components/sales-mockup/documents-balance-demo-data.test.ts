import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoCustomers,
  documentStatus,
  filterCustomers,
  hasOverdue,
  markPaid,
  openTotal,
  overdueTotal,
  paymentPlan,
} from "./documents-balance-demo-data";

const today = new Date("2026-11-28T12:00:00Z");
const customers = createDemoCustomers(today);
const aurora = customers.find((c) => c.id === "c1")!;
const santAnna = customers.find((c) => c.id === "c5")!;

describe("saldo clienti", () => {
  test("il saldo è la somma dei documenti non pagati", () => {
    assert.equal(openTotal(aurora.documents, today), 1050.5);
  });

  test("un cliente con tutto pagato ha saldo zero", () => {
    assert.equal(openTotal(santAnna.documents, today), 0);
    assert.equal(hasOverdue(santAnna.documents, today), false);
  });

  test("una fattura oltre la scadenza è scaduta e conta nello scaduto", () => {
    const doc = aurora.documents.find((d) => d.id === "d1")!;
    assert.equal(documentStatus(doc, today), "scaduto");
    assert.equal(overdueTotal(aurora.documents, today), 840.5);
  });

  test("un documento senza scadenza non è mai scaduto", () => {
    const doc = customers.find((c) => c.id === "c2")!.documents.find((d) => d.id === "d5")!;
    assert.equal(doc.dueDate, null);
    assert.equal(documentStatus(doc, today), "da_incassare");
  });

  test("l'incasso copre i documenti dal più vecchio e lascia l'avanzo", () => {
    const plan = paymentPlan(aurora.documents, 900, today);
    assert.deepEqual(plan.coveredIds, ["d1"]);
    assert.equal(plan.residual, 59.5);
  });

  test("l'incasso che copre tutto azzera il saldo", () => {
    const plan = paymentPlan(aurora.documents, 1050.5, today);
    assert.deepEqual(plan.coveredIds, ["d1", "d2"]);
    assert.equal(markPaid(aurora.documents, plan.coveredIds).filter((d) => !d.paid).length, 0);
    assert.equal(openTotal(markPaid(aurora.documents, plan.coveredIds), today), 0);
  });

  test("il filtro scaduti lascia solo i clienti con documenti oltre la scadenza", () => {
    const names = filterCustomers(customers, "scaduti", "", today).map((c) => c.name).sort();
    assert.deepEqual(names, ["Fruttiera Aurora", "Mercato Centrale Pigneto"]);
  });

  test("il filtro da incassare esclude chi ha già pagato tutto", () => {
    const names = filterCustomers(customers, "da_incassare", "", today).map((c) => c.name).sort();
    assert.deepEqual(names, [
      "Fruttiera Aurora",
      "Mercato Centrale Pigneto",
      "Ortofrutta Belvedere",
      "Verdura del Corso",
    ]);
  });

  test("la ricerca per numero di documento trova il cliente giusto", () => {
    const found = filterCustomers(customers, "tutti", "DDT 211", today);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.name, "Ortofrutta Belvedere");
  });
});
