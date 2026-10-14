import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { deliveryDefaults } from "./order-delivery-defaults";

const today = "2026-10-14";
const company = { date: "2026-10-15", from: "06:00", to: "10:00", address: "Magazzino" };
const addresses = [
  { id: "a-cons", text: "Consegna — Via del Mandrione 63, Roma" },
  { id: "a-sede", text: "Sede legale — Via Santi Cosma 5, Roma" },
];

describe("deliveryDefaults", () => {
  it("la Lista vince su tutto", () => {
    assert.deepEqual(deliveryDefaults({ today, list: { date: "2026-10-20", from: "08:00", to: "09:00", address: "A" }, lastOrder: { from: "07:00", to: "11:00", address: "B" }, company }), { date: "2026-10-20", from: "08:00", to: "09:00", address: "A", addressId: null });
  });
  it("ultimo ordine per orari e luogo, mai la sua data", () => {
    assert.deepEqual(deliveryDefaults({ today, list: null, lastOrder: { date: "2026-09-01", from: "07:00:00", to: "11:00:00", address: "B" }, company }), { date: "2026-10-15", from: "07:00", to: "11:00", address: "B", addressId: null });
  });
  it("campo mancante nell'ultimo ordine: preferenze solo per quel campo", () => {
    const r = deliveryDefaults({ today, list: null, lastOrder: { from: "07:00", to: "11:00", address: null }, company });
    assert.equal(r.from, "07:00");
    assert.equal(r.address, "Magazzino");
  });
  it("scarta date passate e orari non validi", () => {
    assert.deepEqual(deliveryDefaults({ today, list: { date: "2026-10-01" }, lastOrder: { from: "12:00", to: "09:00" }, company: null }), { date: "", from: "", to: "", address: "", addressId: null });
  });
  it("luogo storico uguale a un indirizzo attivo: lo seleziona", () => {
    const r = deliveryDefaults({ today, list: null, lastOrder: { address: "consegna — via del mandrione 63, roma" }, company: null, addresses });
    assert.equal(r.addressId, "a-cons");
  });
  it("indirizzo storico non più attivo: «Altro indirizzo…» col testo conservato", () => {
    const r = deliveryDefaults({ today, list: null, lastOrder: { addressId: "a-vecchio", address: "Via Vecchia 1" }, company: null, addresses });
    assert.deepEqual([r.addressId, r.address], [null, "Via Vecchia 1"]);
  });
  it("senza Lista, storico e preferenze: indirizzo principale di consegna", () => {
    const r = deliveryDefaults({ today, list: null, lastOrder: null, company: null, addresses, mainDeliveryAddressId: "a-cons" });
    assert.equal(r.addressId, "a-cons");
  });
  it("preferenze con indirizzo scelto prima del principale", () => {
    const r = deliveryDefaults({ today, list: null, lastOrder: null, company: { addressId: "a-sede" }, addresses, mainDeliveryAddressId: "a-cons" });
    assert.equal(r.addressId, "a-sede");
  });
});
