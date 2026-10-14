import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { deliveryDefaults } from "./order-delivery-defaults";

const today = "2026-10-14";
const company = { date: "2026-10-15", from: "06:00", to: "10:00", address: "Magazzino" };

describe("deliveryDefaults", () => {
  it("la Lista vince su tutto", () => {
    assert.deepEqual(deliveryDefaults({ today, list: { date: "2026-10-20", from: "08:00", to: "09:00", address: "A" }, lastOrder: { from: "07:00", to: "11:00", address: "B" }, company }), { date: "2026-10-20", from: "08:00", to: "09:00", address: "A" });
  });
  it("ultimo ordine per orari e luogo, mai la sua data", () => {
    assert.deepEqual(deliveryDefaults({ today, list: null, lastOrder: { date: "2026-09-01", from: "07:00:00", to: "11:00:00", address: "B" }, company }), { date: "2026-10-15", from: "07:00", to: "11:00", address: "B" });
  });
  it("campo mancante nell'ultimo ordine: preferenze solo per quel campo", () => {
    { const r = deliveryDefaults({ today, list: null, lastOrder: { from: "07:00", to: "11:00", address: null }, company }); assert.equal(r.from, "07:00"); assert.equal(r.address, "Magazzino"); }
  });
  it("scarta date passate e orari non validi", () => {
    assert.deepEqual(deliveryDefaults({ today, list: { date: "2026-10-01" }, lastOrder: { from: "12:00", to: "09:00" }, company: null }), { date: "", from: "", to: "", address: "" });
  });
});
