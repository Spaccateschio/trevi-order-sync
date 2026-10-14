import { describe, expect, it } from "vitest";
import { deliveryDefaults } from "./order-delivery-defaults";

const today = "2026-10-14";
const company = { date: "2026-10-15", from: "06:00", to: "10:00", address: "Magazzino" };

describe("deliveryDefaults", () => {
  it("la Lista vince su tutto", () => {
    expect(deliveryDefaults({ today, list: { date: "2026-10-20", from: "08:00", to: "09:00", address: "A" }, lastOrder: { from: "07:00", to: "11:00", address: "B" }, company })).toEqual({ date: "2026-10-20", from: "08:00", to: "09:00", address: "A" });
  });
  it("ultimo ordine per orari e luogo, mai la sua data", () => {
    expect(deliveryDefaults({ today, list: null, lastOrder: { date: "2026-09-01", from: "07:00:00", to: "11:00:00", address: "B" }, company })).toEqual({ date: "2026-10-15", from: "07:00", to: "11:00", address: "B" });
  });
  it("campo mancante nell'ultimo ordine: preferenze solo per quel campo", () => {
    expect(deliveryDefaults({ today, list: null, lastOrder: { from: "07:00", to: "11:00", address: null }, company })).toMatchObject({ from: "07:00", address: "Magazzino" });
  });
  it("scarta date passate e orari non validi", () => {
    expect(deliveryDefaults({ today, list: { date: "2026-10-01" }, lastOrder: { from: "12:00", to: "09:00" }, company: null })).toEqual({ date: "", from: "", to: "", address: "" });
  });
});
