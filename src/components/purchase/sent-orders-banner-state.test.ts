import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bannerRules, pendingPickupKey, visibleSentOrders } from "./sent-orders-banner-state";

describe("Avviso ORD della Lista", () => {
  it("non applica la scadenza di 12 ore agli ordini pendenti", () => {
    assert.equal(bannerRules(true, Date.parse("2026-10-21T06:00:00Z")).since, null);
  });
  it("include gli ordini inviati e parziali, ma non quelli completamente ricevuti o chiusi", () => {
    assert.deepEqual(bannerRules(true).statuses, ["inviato", "parzialmente_consegnato"]);
    for (const status of ["consegnato", "chiuso", "annullato", "bozza"]) {
      assert.equal(bannerRules(true).statuses.includes(status), false);
    }
  });
  it("non permette di chiudere l'avviso pendente", () => {
    assert.equal(bannerRules(true).dismissible, false);
  });
  it("mantiene accessibili tutti gli ORD, anche precedentemente nascosti", () => {
    const orders = Array.from({ length: 25 }, (_, i) => ({ id: `ORD-${i + 1}` }));
    assert.deepEqual(visibleSentOrders(orders, new Set(orders.map((o) => o.id)), true), orders);
  });
  it("aggiorna automaticamente ogni 15 secondi", () => {
    assert.equal(bannerRules(true).refreshMs, 15_000);
  });
  it("sincronizza lo stesso riferimento usato dai controlli della Lista", () => {
    assert.deepEqual(pendingPickupKey("azienda-prova"), ["purchase-orders-pending-pickup", "azienda-prova"]);
    assert.equal(visibleSentOrders([], new Set(), true).length > 0, false);
  });
  it("conserva scadenza, stati e chiusura nelle altre pagine", () => {
    const rules = bannerRules(false, Date.parse("2026-10-21T06:00:00Z"));
    assert.equal(rules.since, "2026-10-20T18:00:00.000Z");
    assert.deepEqual(rules.statuses, ["inviato"]);
    assert.equal(rules.dismissible, true);
    assert.equal(rules.refreshMs, 60_000);
    assert.deepEqual(visibleSentOrders([{ id: "a" }, { id: "b" }], new Set(["a"]), false), [{ id: "b" }]);
  });
});