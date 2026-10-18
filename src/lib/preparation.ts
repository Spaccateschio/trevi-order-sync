import { z } from "zod";

export type PreparationLine = {
  id: string;
  name: string | null;
  code: string | null;
  requested: number | null;
  unitId: string | null;
  unit: string | null;
  notes: string | null;
  sellerProductId: string | null;
  prepared: number | null;
  weight: number | null;
  state: "pending" | "confirmed" | "missing";
  version: number;
  confirmedBy: string | null;
  confirmedAt: string | null;
  sourceChanged: boolean;
};
export type PreparationEvent = {
  id: string;
  itemId: string | null;
  action: string;
  actorUserId: string;
  actor: string;
  assignedMemberId: string | null;
  before: Record<string, PreparationJson> | null;
  after: Record<string, PreparationJson>;
  at: string;
};
export type PreparationJson =
  string | number | boolean | null | PreparationJson[] | { [key: string]: PreparationJson };
export type PreparationOrder = {
  id: string;
  number: string | null;
  customer: string;
  deliveryDate: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  address: string | null;
  notes: string | null;
  exportedAt: string | null;
  status: string;
  sourceSignature: string;
  version: number;
  assignedMemberId: string | null;
  readyAt: string | null;
  lines: PreparationLine[];
  events: PreparationEvent[];
};
export type PreparationBundle = {
  companyId: string;
  members: { id: string; name: string }[];
  orders: PreparationOrder[];
};
export const preparationInput = z
  .object({
    orderId: z.string().uuid(),
    action: z.enum(["assign", "confirm", "missing", "unlock", "ready"]),
    sourceSignature: z.string().regex(/^[a-f0-9]{32}$/),
    version: z.number().int().nonnegative(),
    itemId: z.string().uuid().nullable().default(null),
    lineVersion: z.number().int().nonnegative().nullable().default(null),
    assignedMemberId: z.string().uuid().nullable().default(null),
    quantity: z.number().finite().positive().nullable().default(null),
    weightKg: z.number().finite().positive().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (
      ["confirm", "missing", "unlock"].includes(value.action) &&
      (!value.itemId || value.lineVersion === null)
    )
      ctx.addIssue({ code: "custom", message: "Riga e versione obbligatorie" });
    if (value.action === "confirm" && value.quantity === null)
      ctx.addIssue({ code: "custom", message: "Quantità obbligatoria" });
    if (value.action !== "confirm" && (value.quantity !== null || value.weightKg !== null))
      ctx.addIssue({ code: "custom", message: "Quantità e peso ammessi solo nella conferma" });
  });
export type PreparationCommand = z.input<typeof preparationInput>;
export const parsePreparationQuantity = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : NaN;
};
export function canConfirmPreparation(line: PreparationLine, quantity: string, weight: string) {
  const q = parsePreparationQuantity(quantity),
    w = parsePreparationQuantity(weight);
  return (
    line.state === "pending" &&
    line.requested !== null &&
    Boolean(line.unitId && line.unit) &&
    q !== null &&
    Number.isFinite(q) &&
    q > 0 &&
    (w === null || (Number.isFinite(w) && w > 0))
  );
}
export function canCompletePreparation(
  order: PreparationOrder,
  members: PreparationBundle["members"],
) {
  return (
    !order.readyAt &&
    !order.exportedAt &&
    members.some((m) => m.id === order.assignedMemberId) &&
    order.lines.length > 0 &&
    order.lines.every((l) => l.state !== "pending" && !l.sourceChanged)
  );
}
export function preparationStatus(order: PreparationOrder) {
  return order.readyAt
    ? "Pronti"
    : order.assignedMemberId || order.lines.some((l) => l.state !== "pending")
      ? "In lavorazione"
      : "Da preparare";
}
export function preparationError(message: string) {
  if (message.includes("PREP_FORBIDDEN"))
    return "Preparazione non disponibile o accesso non autorizzato.";
  if (message.includes("PREP_SOURCE_CHANGED"))
    return "L'ordine è cambiato. Ricarica i dati prima di confermare.";
  if (message.includes("PREP_CONFLICT"))
    return "Un altro preparatore ha aggiornato questi dati. Ricarica prima di continuare.";
  if (message.includes("PREP_LOCKED"))
    return "Ordine non modificabile: già scaricato da Danea o non più attivo.";
  if (message.includes("PREP_READY")) return "L'ordine è già pronto e non può essere modificato.";
  if (message.includes("PREP_LINE_LOCKED"))
    return "Riga già confermata: ricarica i dati e usa la matita per correggere.";
  if (message.includes("PREP_INVALID_MEMBER")) return "Scegli un preparatore attivo dell'azienda.";
  if (message.includes("PREP_INCOMPLETE"))
    return "Conferma tutte le righe o segnale come mancanti prima di completare.";
  return "Operazione non riuscita. I valori inseriti sono conservati; ricarica e riprova.";
}
