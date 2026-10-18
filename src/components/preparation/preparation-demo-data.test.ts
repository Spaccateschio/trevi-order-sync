import { describe, it, expect } from "vitest";
import {
  createDemoOrders,
  updateLine,
  confirmLine,
  canComplete,
  canConfirm,
} from "./preparation-demo-data";
function firstOrder() {
  const order = createDemoOrders()[0];
  if (!order) throw new Error("Missing demo order");
  return order;
}
function firstLine() {
  const l = firstOrder().lines[0];
  if (!l) throw new Error("Missing demo line");
  return l;
}
describe("Preparazione dimostrativa", () => {
  it("il peso proposto resta non confermato", () => {
    const l = firstLine();
    expect(updateLine(l, "weight", "11.8").confirmed).toBe(false);
  });
  it("solo la conferma esplicita blocca la riga", () => {
    const l = { ...firstLine(), prepared: "2", weight: "11.8" };
    expect(l.confirmed).toBe(false);
    expect(confirmLine(l).confirmed).toBe(true);
    expect(updateLine(confirmLine(l), "weight", "12").confirmed).toBe(false);
  });
  it("2 casse e 11.8 kg rimangono distinti", () => {
    const l = confirmLine({ ...firstLine(), prepared: "2", weight: "11.8" });
    expect(l.unit).toBe("cs");
    expect(l.prepared).toBe("2");
    expect(l.weight).toBe("11.8");
    expect(l.requested).toBe(2);
  });
  it("peso facoltativo e quantità positiva", () => {
    const l = firstLine();
    expect(canConfirm({ ...l, prepared: "2" })).toBe(true);
    expect(canConfirm({ ...l, prepared: "0" })).toBe(false);
    expect(canConfirm({ ...l, prepared: "-1" })).toBe(false);
    expect(canConfirm({ ...l, prepared: "2", weight: "-1" })).toBe(false);
  });
  it("pronto solo con preparatore e tutte le righe verificate", () => {
    const o = firstOrder();
    expect(canComplete(o)).toBe(false);
    const done = {
      ...o,
      assignee: "Sara",
      lines: o.lines.map((l) => confirmLine({ ...l, prepared: String(l.requested) })),
    };
    expect(canComplete(done)).toBe(true);
    expect(canComplete({ ...done, assignee: "" })).toBe(false);
    expect(canComplete({ ...done, lines: [] })).toBe(false);
    expect(canComplete({ ...done, lines: [firstLine()] })).toBe(false);
  });
  it("mancante risolto ma non inventa quantità o peso", () => {
    const o = firstOrder();
    const lines = o.lines.map((l) => ({ ...l, missing: true }));
    expect(canComplete({ ...o, assignee: "Luca", lines })).toBe(true);
    expect(lines.at(0)?.prepared).toBe("");
    expect(lines.at(0)?.weight).toBe("");
  });
});
