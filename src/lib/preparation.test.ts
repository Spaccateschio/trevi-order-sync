import { describe, expect, it } from "vitest";
import {
  canCompletePreparation,
  canConfirmPreparation,
  parsePreparationQuantity,
  preparationInput,
  type PreparationLine,
  type PreparationOrder,
} from "./preparation";

const id = "00000000-0000-4000-8000-000000000001";
const line: PreparationLine = {
  id,
  name: "Pomodori",
  code: "P1",
  requested: 2,
  unit: "cs",
  unitId: id,
  notes: null,
  sellerProductId: null,
  prepared: null,
  weight: null,
  state: "pending",
  version: 0,
  confirmedBy: null,
  confirmedAt: null,
  sourceChanged: false,
};
const order: PreparationOrder = {
  id,
  number: "TEST",
  customer: "Cliente",
  deliveryDate: null,
  timeFrom: null,
  timeTo: null,
  address: null,
  notes: null,
  exportedAt: null,
  status: "inviato",
  sourceSignature: "a".repeat(32),
  version: 0,
  assignedMemberId: id,
  readyAt: null,
  lines: [{ ...line, state: "confirmed", prepared: 2, weight: 11.8 }],
  events: [],
};
const base = {
  orderId: id,
  action: "confirm" as const,
  sourceSignature: "a".repeat(32),
  version: 0,
  itemId: id,
  lineVersion: 0,
  quantity: 2,
  weightKg: 11.8,
};
describe("Preparazione: quantità e peso separati", () => {
  it("mantiene 2 casse preparate e 11,8 kg distinti", () => {
    expect(preparationInput.parse(base)).toMatchObject({ quantity: 2, weightKg: 11.8 });
    expect(canConfirmPreparation(line, "2", "11,8")).toBe(true);
  });
  it("consente la conferma quantità senza peso", () => {
    expect(canConfirmPreparation(line, "2", "")).toBe(true);
    expect(preparationInput.parse({ ...base, weightKg: null }).weightKg).toBeNull();
  });
  it("non conferma quantità zero", () => {
    expect(canConfirmPreparation(line, "0", "")).toBe(false);
    expect(preparationInput.safeParse({ ...base, quantity: 0 }).success).toBe(false);
  });
  it("rifiuta peso zero o negativo", () => {
    expect(canConfirmPreparation(line, "2", "0")).toBe(false);
    expect(preparationInput.safeParse({ ...base, weightKg: -1 }).success).toBe(false);
  });
  it("non inventa quantità quando manca U.M. d'acquisto", () => {
    expect(canConfirmPreparation({ ...line, unitId: null, unit: null }, "2", "11,8")).toBe(false);
  });
  it("mancante non porta quantità o peso", () => {
    expect(preparationInput.safeParse({ ...base, action: "missing" }).success).toBe(false);
    expect(
      preparationInput.parse({ ...base, action: "missing", quantity: null, weightKg: null }),
    ).toMatchObject({ quantity: null, weightKg: null });
  });
  it("richiede versione della riga per confermare", () => {
    expect(preparationInput.safeParse({ ...base, lineVersion: null }).success).toBe(false);
  });
  it("rifiuta numeri non finiti", () => {
    expect(preparationInput.safeParse({ ...base, quantity: Infinity }).success).toBe(false);
    expect(canConfirmPreparation(line, "abc", "11")).toBe(false);
  });
  it("legge la virgola decimale senza trasformare vuoto in zero", () => {
    expect(parsePreparationQuantity("11,8")).toBe(11.8);
    expect(parsePreparationQuantity("")).toBeNull();
  });
});
describe("Preparazione: completamento", () => {
  const members = [{ id, name: "Preparatore" }];
  it("completa solo con preparatore attivo", () => {
    expect(canCompletePreparation(order, members)).toBe(true);
    expect(canCompletePreparation(order, [])).toBe(false);
  });
  it("non completa righe non verificate", () => {
    expect(canCompletePreparation({ ...order, lines: [line] }, members)).toBe(false);
  });
  it("consente mancanti espliciti", () => {
    expect(
      canCompletePreparation({ ...order, lines: [{ ...line, state: "missing" }] }, members),
    ).toBe(true);
  });
  it("non completa dopo modifica ordine originale", () => {
    expect(
      canCompletePreparation(
        { ...order, lines: [{ ...(order.lines[0] as PreparationLine), sourceChanged: true }] },
        members,
      ),
    ).toBe(false);
  });
  it("ordini scaricati non completabili", () => {
    expect(canCompletePreparation({ ...order, exportedAt: "2026-10-18T12:00:00Z" }, members)).toBe(
      false,
    );
  });
  it("ordini pronti non riaperti", () => {
    expect(canCompletePreparation({ ...order, readyAt: "2026-10-18T12:00:00Z" }, members)).toBe(
      false,
    );
  });
});
