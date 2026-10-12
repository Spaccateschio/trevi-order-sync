/**
 * Memoria delle scelte d'acquisto tra Liste successive (regole pure, nessuna scrittura).
 * Fonte: l'ultima Lista CHIUSA della stessa azienda in cui il prodotto aveva una ripartizione effettiva.
 * Si ricordano solo destinazioni (fornitori / acquisto diretto), U.M. e proporzioni: MAI le quantità.
 */
import { quotaFor, splitEvenly, type PickSupplier, type QuotaTarget, type ValidConversion } from "@/lib/supplier-selection";

export type MemoryDestination =
  | {
      kind: "fornitore";
      linkId: string;
      unitId: string | null;
      unitCode: string | null;
      /** Quantità storica nella sua U.M. (serve solo per le proporzioni). */
      quantity: number | null;
      /** Equivalente storico in U.M. di magazzino (null senza conversione). */
      stockEquivalent: number | null;
    }
  | { kind: "diretto"; unitId: string | null; unitCode: string | null; quantity: number | null };

export type SupplierMemory = { listId: string; closedAt: string; destinations: MemoryDestination[] };

export type HistoryEntry = SupplierMemory;

const norm = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();
const exact3 = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Ultima Lista chiusa con almeno una destinazione valida; Liste aperte/annullate vanno escluse a monte. */
export function pickMemory(history: HistoryEntry[]): SupplierMemory | null {
  const valid = history
    .map((h) => ({ ...h, destinations: h.destinations.filter((d) => d.quantity !== null && d.quantity > 0) }))
    .filter((h) => h.destinations.length > 0)
    .sort((a, b) => (a.closedAt < b.closedAt ? 1 : a.closedAt > b.closedAt ? -1 : 0));
  return valid[0] ?? null;
}

/**
 * Proporzioni (somma 1) solo con quantità confrontabili: tutte nella stessa U.M., oppure tutte con
 * equivalente in U.M. di magazzino. Altrimenti null: mai sommare kg e casse.
 */
export function memoryShares(dests: MemoryDestination[]): number[] | null {
  if (!dests.length) return null;
  if (dests.length === 1) return [1];
  const codes = new Set(dests.map((d) => (d.unitId ? `id:${d.unitId}` : `c:${norm(d.unitCode)}`)));
  let values: number[] | null = null;
  if (codes.size === 1) values = dests.map((d) => d.quantity ?? 0);
  else if (dests.every((d) => d.kind === "fornitore" && d.stockEquivalent !== null && d.stockEquivalent > 0))
    values = dests.map((d) => (d.kind === "fornitore" ? (d.stockEquivalent ?? 0) : 0));
  if (!values || values.some((v) => !(v > 0))) return null;
  const total = values.reduce((a, b) => a + b, 0);
  return values.map((v) => v / total);
}

/** Applica le proporzioni: solo se ogni parte è esatta (3 decimali, interi se richiesto) e la somma torna. */
export function applyShares(total: number, shares: number[], integer: boolean): number[] | null {
  const parts = shares.map((s) => total * s);
  if (parts.some((p) => !(p > 0))) return null;
  if (integer ? parts.some((p) => Math.abs(p - Math.round(p)) > 1e-6) : parts.some((p) => !exact3(p))) return null;
  const rounded = parts.map((p) => (integer ? Math.round(p) : r3(p)));
  if (Math.abs(rounded.reduce((a, b) => a + b, 0) - total) > 1e-6) return null;
  return rounded;
}

export type MemoryWrite =
  | { kind: "fornitore"; linkId: string; target: QuotaTarget }
  | { kind: "diretto"; quantity: number; unitId: string | null; unitCode: string | null };

export type MemoryPlan =
  /** Nessuna memoria utilizzabile: si applicano le regole attuali (unico idoneo / unico ★). */
  | { kind: "nessuna"; reason?: string }
  /** Scritture sicure da eseguire. */
  | { kind: "scrivi"; writes: MemoryWrite[] }
  /** Destinazioni riproposte ma quote da completare a mano (proporzione non realizzabile). */
  | { kind: "proponi"; reason: string };

export type MemoryContext = {
  suppliers: PickSupplier[];
  /** Fornitori tolti volontariamente in questa Lista: la memoria non li ripristina. */
  deselected: Set<string>;
  decidedUnitId: string | null;
  decidedCode: string;
  quantity: number;
  stockUnitId: string | null;
  conversions: Record<string, ValidConversion[]>;
};

const supplierOk = (s: PickSupplier | undefined): s is PickSupplier =>
  Boolean(s) && !(s!.isB2B && (!s!.sourceLinked || !s!.purchasable));

/**
 * Piano dalla memoria per una riga SENZA quote. Fornitore storico non più collegato/acquistabile
 * o tolto volontariamente → nessuna memoria (Caso C): non si trasferisce nulla in automatico.
 */
export function planFromMemory(memory: SupplierMemory | null, ctx: MemoryContext): MemoryPlan {
  if (!memory || !memory.destinations.length) return { kind: "nessuna" };
  const dests = memory.destinations;
  for (const d of dests) {
    if (d.kind !== "fornitore") continue;
    if (ctx.deselected.has(d.linkId)) return { kind: "nessuna", reason: "Fornitore tolto in questa Lista" };
    if (!supplierOk(ctx.suppliers.find((s) => s.linkId === d.linkId))) return { kind: "nessuna", reason: "Fornitore precedente non più acquistabile" };
  }
  const prevUnit = (d: MemoryDestination & { kind: "fornitore" }) => ({ unitId: d.unitId, manual: d.unitId ? null : norm(d.unitCode) || null });
  const targetFor = (d: MemoryDestination & { kind: "fornitore" }, q: number, strictUnit: boolean) => {
    const s = ctx.suppliers.find((x) => x.linkId === d.linkId)!;
    const conv = ctx.conversions[d.linkId] ?? [];
    const withPrev = quotaFor(s, ctx.decidedUnitId, ctx.decidedCode, q, ctx.stockUnitId, conv, prevUnit(d));
    if (withPrev || strictUnit) return withPrev;
    // U.M. precedente non più disponibile: si usa l'U.M. attuale (stessa o conversione valida).
    return quotaFor(s, ctx.decidedUnitId, ctx.decidedCode, q, ctx.stockUnitId, conv);
  };
  const directFits = (d: MemoryDestination) =>
    norm(d.unitCode) === norm(ctx.decidedCode) || (Boolean(d.unitId) && d.unitId === ctx.decidedUnitId);

  if (dests.length === 1) {
    const d = dests[0]!;
    if (d.kind === "diretto") {
      if (!directFits(d) && d.unitCode) return { kind: "proponi", reason: "Acquisto diretto in U.M. diversa: inserisci la quota a mano" };
      return { kind: "scrivi", writes: [{ kind: "diretto", quantity: ctx.quantity, unitId: ctx.decidedUnitId, unitCode: ctx.decidedCode || null }] };
    }
    const t = targetFor(d, ctx.quantity, false);
    return t ? { kind: "scrivi", writes: [{ kind: "fornitore", linkId: d.linkId, target: t }] } : { kind: "proponi", reason: "Da verificare: U.M. diverse senza conversione valida" };
  }

  const shares = memoryShares(dests);
  if (!shares) return { kind: "proponi", reason: "Ripartizione precedente in U.M. non confrontabili: completa le quote" };
  const parts = applyShares(ctx.quantity, shares, Number.isInteger(ctx.quantity));
  if (!parts) return { kind: "proponi", reason: "Le proporzioni precedenti non danno quote esatte: completa le quote" };
  const writes: MemoryWrite[] = [];
  for (const [i, d] of dests.entries()) {
    const q = parts[i]!;
    if (d.kind === "diretto") {
      if (!directFits(d)) return { kind: "proponi", reason: "Acquisto diretto in U.M. diversa: completa le quote" };
      writes.push({ kind: "diretto", quantity: q, unitId: ctx.decidedUnitId, unitCode: ctx.decidedCode || null });
    } else {
      const t = targetFor(d, q, false);
      if (!t) return { kind: "proponi", reason: "Una quota non è convertibile in confezioni intere: completa le quote" };
      writes.push({ kind: "fornitore", linkId: d.linkId, target: t });
    }
  }
  return { kind: "scrivi", writes };
}

/** «Come l'ultima volta»: le quote attuali hanno le stesse destinazioni e le stesse proporzioni della memoria. */
export function matchesMemory(
  memory: SupplierMemory | null,
  current: { linkId: string | null; quantity: number | null; unitKey: string }[],
): boolean {
  if (!memory || !current.length || current.length !== memory.destinations.length) return false;
  const key = (d: MemoryDestination) => (d.kind === "diretto" ? "diretto" : d.linkId);
  const memKeys = memory.destinations.map(key).sort();
  const curKeys = current.map((c) => c.linkId ?? "diretto").sort();
  if (memKeys.join("|") !== curKeys.join("|")) return false;
  if (current.length === 1) return true;
  const shares = memoryShares(memory.destinations);
  if (!shares) return false;
  const units = new Set(current.map((c) => c.unitKey));
  if (units.size !== 1 || current.some((c) => !(c.quantity && c.quantity > 0))) return false;
  const total = current.reduce((a, c) => a + (c.quantity ?? 0), 0);
  return memory.destinations.every((d, i) => {
    const c = current.find((x) => (x.linkId ?? "diretto") === key(d))!;
    return Math.abs((c.quantity ?? 0) / total - shares[i]!) < 0.005;
  });
}

/**
 * Deselezioni volontarie: valgono finché la pagina resta aperta (nessuna struttura nel database
 * le conserva). Dopo un aggiornamento della pagina non sono più ricordate: limite dichiarato.
 */
const deselections = new Map<string, Set<string>>();
export function markDeselected(itemId: string, linkId: string) {
  (deselections.get(itemId) ?? deselections.set(itemId, new Set()).get(itemId)!).add(linkId);
}
export function clearDeselected(itemId: string, linkId: string) {
  deselections.get(itemId)?.delete(linkId);
}
export function deselectedFor(itemId: string): Set<string> {
  return new Set(deselections.get(itemId) ?? []);
}

/**
 * Coda «vince l'ultimo valore» per riga: una sola scrittura alla volta; i valori arrivati durante
 * un salvataggio sostituiscono quelli in attesa; una risposta lenta non sovrascrive un valore più recente.
 */
export function createLatestQueue<V>(worker: (key: string, value: V) => Promise<void>) {
  const running = new Map<string, Promise<void>>();
  const waiting = new Map<string, { value: V }>();
  const drain = async (key: string) => {
    while (waiting.has(key)) {
      const { value } = waiting.get(key)!;
      waiting.delete(key);
      try {
        await worker(key, value);
      } catch {
        /* l'errore è già comunicato dal worker; si prosegue con l'eventuale valore più recente */
      }
    }
    running.delete(key);
  };
  return {
    push(key: string, value: V): Promise<void> {
      waiting.set(key, { value });
      if (!running.has(key)) running.set(key, drain(key));
      return running.get(key)!;
    },
    busy: (key: string) => running.has(key),
    /** Il valore è ancora quello più recente richiesto? (nessun altro in attesa) */
    isLatest: (key: string) => !waiting.has(key),
  };
}

export type RescaleRow = { id: string; linkId: string; purchaseUnitId: string | null; purchaseUnitCode: string | null; purchaseQuantity: number | null; inOrder: boolean };
export type RescaleWrite =
  | { kind: "fornitore"; linkId: string; assignmentId: string; target: QuotaTarget }
  | { kind: "diretto"; quantity: number; unitId: string | null; unitCode: string | null };

const sameMultiset = (a: number[], b: number[]) => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]!) < 1e-6);
};

/**
 * Cambio quantità con PIÙ destinazioni: si ricalcola solo se le quote attuali sono ancora quelle
 * automatiche (proporzioni della memoria o parti uguali) calcolate sulla quantità precedente.
 * Quote cambiate a mano, in ordine o non esatte → null (si mostra la differenza da sistemare).
 */
export function planRescale(args: {
  rows: RescaleRow[];
  directQuota: number | null;
  previousQuantity: number;
  memory: SupplierMemory | null;
  ctx: MemoryContext;
}): RescaleWrite[] | null {
  const { rows, directQuota, previousQuantity, memory, ctx } = args;
  const destCount = rows.length + (directQuota !== null ? 1 : 0);
  if (destCount < 2 || rows.some((r) => r.inOrder || r.purchaseQuantity === null)) return null;
  const unitOf = (r: RescaleRow) => ({ unitId: r.purchaseUnitId, manual: r.purchaseUnitId ? null : r.purchaseUnitCode });
  const sameUnit = (r: RescaleRow, t: QuotaTarget) =>
    r.purchaseUnitId ? r.purchaseUnitId === t.unitId : !t.unitId && norm(r.purchaseUnitCode) === norm(t.manual);

  // 1) Proporzioni della memoria.
  const prev = planFromMemory(memory, { ...ctx, quantity: previousQuantity });
  if (prev.kind === "scrivi" && prev.writes.length === destCount) {
    const matches = prev.writes.every((w) => {
      if (w.kind === "diretto") return directQuota !== null && Math.abs(directQuota - w.quantity) < 1e-6;
      const r = rows.find((x) => x.linkId === w.linkId);
      return r !== undefined && sameUnit(r, w.target) && Math.abs((r.purchaseQuantity ?? 0) - w.target.quantity) < 1e-6;
    });
    if (matches) {
      const next = planFromMemory(memory, ctx);
      if (next.kind !== "scrivi") return null;
      return next.writes.map((w) =>
        w.kind === "diretto" ? w : { ...w, assignmentId: rows.find((x) => x.linkId === w.linkId)!.id },
      );
    }
  }
  // 2) Parti uguali (spunte nella stessa U.M. di «Da acquistare»), senza acquisto diretto.
  if (directQuota !== null) return null;
  const allSame = rows.every((r) => {
    const s = ctx.suppliers.find((x) => x.linkId === r.linkId);
    if (!s) return false;
    const t = quotaFor(s, ctx.decidedUnitId, ctx.decidedCode, 1, null, [], unitOf(r));
    return t !== null;
  });
  if (!allSame) return null;
  const was = splitEvenly(previousQuantity, rows.length, Number.isInteger(previousQuantity));
  if (!sameMultiset(was, rows.map((r) => r.purchaseQuantity ?? 0))) return null;
  const parts = splitEvenly(ctx.quantity, rows.length, Number.isInteger(ctx.quantity));
  if (parts.length !== rows.length) return null;
  return rows.map((r, i) => ({
    kind: "fornitore" as const,
    linkId: r.linkId,
    assignmentId: r.id,
    target: { unitId: r.purchaseUnitId, manual: r.purchaseUnitId ? null : r.purchaseUnitCode, quantity: parts[i]! },
  }));
}
