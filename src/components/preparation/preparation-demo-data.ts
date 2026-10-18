export type Line = { id: string; name: string; image: "pomodori" | "carote" | "basilico"; requested: number; unit: string; prepared: string; weight: string; confirmed: boolean; missing: boolean };
export type DemoOrder = { id: string; customer: string; time: string; note: string; assignee: string; ready: boolean; lines: Line[] };
const line = (id: string, name: string, image: Line["image"], requested: number, unit: string): Line => ({ id, name, image, requested, unit, prepared: "", weight: "", confirmed: false, missing: false });
export function createDemoOrders(): DemoOrder[] {
  return [
    { id: "DEMO-001", customer: "Ristorante Il Giardino", time: "09:30", note: "Pomodori maturi. Consegna all'ingresso cucina.", assignee: "", ready: false, lines: [line("p1", "Pomodori a grappolo", "pomodori", 2, "cs"), line("p2", "Carote", "carote", 5, "kg"), line("p3", "Basilico fresco", "basilico", 6, "mz")] },
    { id: "DEMO-002", customer: "Bistrot della Piazza", time: "10:00", note: "Preferire confezioni piccole.", assignee: "Luca", ready: false, lines: [{ ...line("p4", "Pomodori a grappolo", "pomodori", 3, "kg"), prepared: "3", weight: "3.1", confirmed: true }, line("p5", "Basilico fresco", "basilico", 4, "mz")] },
    { id: "DEMO-003", customer: "Trattoria Le Foglie", time: "11:00", note: "", assignee: "Sara", ready: true, lines: [{ ...line("p6", "Carote", "carote", 4, "kg"), prepared: "4", weight: "4.2", confirmed: true }] },
  ];
}
export const parseQuantity = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
export function canConfirm(line: Line) {
  const qty = parseQuantity(line.prepared);
  const weight = parseQuantity(line.weight);
  return !line.missing && qty !== null && Number.isFinite(qty) && qty > 0 && (weight === null || (Number.isFinite(weight) && weight > 0));
}
export function updateLine(line: Line, field: "prepared" | "weight", value: string): Line { return { ...line, [field]: value, confirmed: false }; }
export function confirmLine(line: Line): Line { return canConfirm(line) ? { ...line, confirmed: true } : line; }
export function canComplete(order: DemoOrder) { return Boolean(order.assignee) && order.lines.length > 0 && order.lines.every(l => l.confirmed || l.missing); }
export function status(order: DemoOrder) { return order.ready ? "Pronti" : order.assignee || order.lines.some(l => l.confirmed || l.missing) ? "In lavorazione" : "Da preparare"; }
