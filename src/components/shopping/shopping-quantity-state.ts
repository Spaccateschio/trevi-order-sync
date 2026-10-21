import { parseQuantity } from "@/lib/inventory";

export function confirmationQuantity(raw: string | undefined, saved: number | null): number | null {
  const value = raw === undefined ? saved : parseQuantity(raw);
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function quantityHasDraft(raw: string | undefined, saved: number | null): boolean {
  if (raw === undefined) return false;
  if (raw.trim() === "") return saved !== null;
  return parseQuantity(raw) !== saved;
}

/** Card di catalogo non ancora in Lista: cosa fa «Conferma» con la quantità scritta.
 *  0 = «Non acquistare» (nessuna riga scritta), > 0 = aggiunta alla Lista, vuoto = nessuna decisione. */
export function catalogConfirmAction(quantity: number | null): "add" | "non_acquistare" | null {
  if (quantity === null) return null;
  return quantity > 0 ? "add" : "non_acquistare";
}

/** Synchronous guard: a second click cannot start a second write before React updates. */
export function createConfirmationGuard() {
  const running = new Set<string>();
  return {
    start(id: string) { if (running.has(id)) return false; running.add(id); return true; },
    finish(id: string) { running.delete(id); },
  };
}