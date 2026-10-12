/**
 * Regole pure della selezione fornitori nella Lista della Spesa (spunte, proposta automatica,
 * ripartizione, diciture, riepilogo). Nessuna scrittura: il database resta l'unico arbitro.
 */

export type PickUnit = { unitId: string; code: string };
export type PickSupplier = {
  linkId: string;
  isB2B: boolean;
  sourceLinked: boolean;
  purchasable: boolean;
  allowManual: boolean;
  units: PickUnit[];
  isPreferred: boolean;
};
export type QuickUnit = { unitId: string | null; manual: string | null };

const norm = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();

/** U.M. del fornitore uguale a quella di «Da acquistare»; null = nessuna U.M. confrontabile (mai conversioni). */
export function quickUnitFor(s: PickSupplier, decidedUnitId: string | null, decidedCode: string): QuickUnit | null {
  if (s.isB2B && (!s.sourceLinked || !s.purchasable)) return null;
  if (decidedUnitId) {
    const hit = s.units.find((u) => u.unitId === decidedUnitId);
    return hit ? { unitId: hit.unitId, manual: null } : null;
  }
  const code = norm(decidedCode);
  if (!code) return null;
  const hit = s.units.find((u) => norm(u.code) === code);
  if (hit) return { unitId: hit.unitId, manual: null };
  return s.allowManual ? { unitId: null, manual: code } : null;
}

export type AutoPick =
  | { kind: "pick"; linkId: string; reason: "unico" | "preferito" }
  | { kind: "da_scegliere"; reason: string }
  | { kind: "senza_fornitore" };

/**
 * Proposta automatica: unico fornitore idoneo, oppure unico preferito (product_supplier_links.is_preferred)
 * senza conflitto con la stella dell'Inventario (company_product_supplier_favorites). Mai scelte arbitrarie.
 * `inventoryStarLinks` = collegamenti con la stella dell'Inventario per questo prodotto.
 */
export function autoPickSupplier(
  suppliers: PickSupplier[],
  decidedUnitId: string | null,
  decidedCode: string,
  inventoryStarLinks: string[],
): AutoPick {
  if (!suppliers.length) return { kind: "senza_fornitore" };
  const eligible = suppliers.filter((s) => quickUnitFor(s, decidedUnitId, decidedCode) !== null);
  if (!eligible.length) return { kind: "da_scegliere", reason: "Nessun fornitore con U.M. uguale a quella da acquistare" };
  if (eligible.length === 1 && suppliers.length === 1) return { kind: "pick", linkId: eligible[0]!.linkId, reason: "unico" };
  const preferred = suppliers.filter((s) => s.isPreferred);
  if (preferred.length !== 1) {
    if (eligible.length === 1) return { kind: "pick", linkId: eligible[0]!.linkId, reason: "unico" };
    return { kind: "da_scegliere", reason: preferred.length ? "Più fornitori preferiti" : "Nessun fornitore preferito" };
  }
  const pref = preferred[0]!;
  const stars = [...new Set(inventoryStarLinks)];
  if (stars.length && (stars.length !== 1 || stars[0] !== pref.linkId)) {
    return { kind: "da_scegliere", reason: "Preferito e stella dell'Inventario non coincidono" };
  }
  if (!eligible.some((s) => s.linkId === pref.linkId)) return { kind: "da_scegliere", reason: "Il fornitore preferito non usa questa U.M." };
  return { kind: "pick", linkId: pref.linkId, reason: "preferito" };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Divide `total` in `n` parti la cui somma è esattamente `total`; interi se `integer`. Il resto va alle prime parti. */
export function splitEvenly(total: number, n: number, integer: boolean): number[] {
  if (n <= 0 || !(total > 0)) return [];
  const step = integer ? 1 : 0.001;
  const units = Math.round(total / step);
  const base = Math.floor(units / n);
  let rest = units - base * n;
  return Array.from({ length: n }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return round3((base + extra) * step);
  });
}

/**
 * Quote fisse (scelte a mano) restano; il residuo si divide tra le altre. null se le fisse superano il totale.
 */
export function rebalanceShares(total: number, shares: { id: string; fixed: number | null }[], integer: boolean): Record<string, number> | null {
  const fixedSum = round3(shares.reduce((sum, s) => sum + (s.fixed ?? 0), 0));
  if (fixedSum > total + 1e-9) return null;
  const free = shares.filter((s) => s.fixed === null);
  const parts = splitEvenly(round3(total - fixedSum), free.length, integer);
  const out: Record<string, number> = {};
  for (const s of shares) if (s.fixed !== null) out[s.id] = s.fixed;
  free.forEach((s, i) => (out[s.id] = parts[i] ?? 0));
  return out;
}

export const isWholeNumber = (n: number | null | undefined) => n !== null && n !== undefined && Math.abs(n - Math.round(n)) < 1e-9;

export type RowLabel =
  | "Quantità mancante"
  | "Quantità non confermata"
  | "Senza fornitore"
  | "Fornitore da scegliere"
  | "Da assegnare"
  | "Parziale"
  | "Assegnato"
  | "Da verificare"
  | "Escluso";

export type RowFacts = {
  quantity: number | null;
  locked: boolean;
  /** Stato calcolato dal database (shopping_list_item_state). */
  status: "da_assegnare" | "parziale" | "assegnata" | "da_verificare" | "manuale";
  linkedSuppliers: number;
  quotes: number;
  excluded?: boolean;
};

/** Una sola dicitura per prodotto: una quantità non confermata non conta mai come assegnata. */
export function rowLabel(r: RowFacts): RowLabel {
  if (r.excluded) return "Escluso";
  if (!r.quantity || r.quantity <= 0) return "Quantità mancante";
  if (!r.locked) return "Quantità non confermata";
  if (r.status === "assegnata") return "Assegnato";
  if (r.status === "parziale") return "Parziale";
  if (r.status === "da_verificare") return "Da verificare";
  if (r.quotes === 0) return r.linkedSuppliers === 0 ? "Senza fornitore" : "Fornitore da scegliere";
  return "Da assegnare";
}

export type ListSummary = { total: number; assigned: number; partial: number; toFix: number; excluded: number };

/** Riepilogo sull'intera Lista (mai sui filtri): ogni prodotto in un solo stato. */
export function summarizeRows(rows: RowFacts[]): ListSummary {
  const s: ListSummary = { total: 0, assigned: 0, partial: 0, toFix: 0, excluded: 0 };
  for (const r of rows) {
    const label = rowLabel(r);
    if (label === "Escluso") { s.excluded += 1; continue; }
    s.total += 1;
    if (label === "Assegnato") s.assigned += 1;
    else if (label === "Parziale") s.partial += 1;
    else s.toFix += 1;
  }
  return s;
}

/** Motivo specifico per il popup «Genera ordini». */
export function issueReason(r: RowFacts): string {
  const label = rowLabel(r);
  if (label === "Parziale") return "Ripartizione parziale";
  if (label === "Da verificare") return "Conversione U.M. da verificare";
  return label;
}

/** Messaggio leggibile quando il database rifiuta di togliere una quota già finita in un ordine. */
export function friendlyAssignError(message: string): string {
  if (/purchase_order_items_source_assignment_id_fkey|foreign key/i.test(message)) {
    return "Questa quota è già in un ordine: gestiscila dalle Bozze.";
  }
  return message;
}

/** Fatti della riga dalla panoramica del database + blocco della quantità. */
export function factsFromRow(
  row: { decided_quantity: number | null; status: RowFacts["status"]; suppliers_available: number },
  locked: boolean,
  excluded = false,
): RowFacts {
  return {
    quantity: row.decided_quantity === null ? null : Number(row.decided_quantity),
    locked,
    status: row.status,
    linkedSuppliers: Number(row.suppliers_available ?? 0),
    quotes: row.status === "da_assegnare" ? 0 : 1,
    excluded,
  };
}

/** U.M. proposta tra quelle del fornitore: l'unica, oppure l'unica predefinita; altrimenti scelta dell'utente (null). */
export function defaultUnitOf<T extends { isDefault?: boolean }>(units: (T & { unitId: string })[]): string | null {
  if (units.length === 1) return units[0]!.unitId;
  const defaults = units.filter((u) => u.isDefault);
  return defaults.length === 1 ? defaults[0]!.unitId : null;
}

/** Stessa regola sui codici (finestra «Aggiungi prodotti», articoli del Catalogo B2B). */
export function defaultUnitCode(units: { code: string; isDefault: boolean }[]): string {
  const unique = [...new Map(units.filter((u) => u.code).map((u) => [u.code, u])).values()];
  if (unique.length === 1) return unique[0]!.code;
  const defaults = unique.filter((u) => u.isDefault);
  return defaults.length === 1 ? defaults[0]!.code : "";
}

/** Conversione valida (effective_supplier_conversion): 1 U.M. d'acquisto = factor U.M. di magazzino. */
export type ValidConversion = { unitId: string; factor: number };

export type QuotaTarget = { unitId: string | null; manual: string | null; quantity: number };

/**
 * Quantità per il fornitore partendo da «Da acquistare»: stessa U.M. → stessa quantità; altrimenti,
 * solo se «Da acquistare» è nell'U.M. di magazzino e c'è UNA conversione valida, quantità convertita
 * (solo se il risultato è un numero intero di confezioni: mai arrotondamenti arbitrari). null = da verificare.
 */
export function quotaFor(
  s: PickSupplier,
  decidedUnitId: string | null,
  decidedCode: string,
  quantity: number,
  stockUnitId: string | null,
  conversions: ValidConversion[],
  onlyUnit?: { unitId: string | null; manual: string | null },
): QuotaTarget | null {
  const same = quickUnitFor(s, decidedUnitId, decidedCode);
  const matches = (u: { unitId: string | null; manual: string | null }) =>
    !onlyUnit || (onlyUnit.unitId ? u.unitId === onlyUnit.unitId : !u.unitId && norm(u.manual) === norm(onlyUnit.manual));
  if (same && matches(same)) return { ...same, quantity };
  if (!stockUnitId || decidedUnitId !== stockUnitId) return null;
  const usable = conversions.filter((c) => c.factor > 0 && s.units.some((u) => u.unitId === c.unitId) && matches({ unitId: c.unitId, manual: null }));
  if (usable.length !== 1) return null;
  const packs = quantity / usable[0]!.factor;
  if (!isWholeNumber(packs)) return null;
  return { unitId: usable[0]!.unitId, manual: null, quantity: Math.round(packs) };
}

export type QuotaAssignment = {
  id: string;
  linkId: string;
  purchaseUnitId: string | null;
  purchaseUnitCode: string | null;
  purchaseQuantity: number | null;
  /** Quota già in una bozza o in un ordine inviato. */
  inOrder: boolean;
};

export type QuotaPlan =
  | { kind: "set"; linkId: string; assignmentId: string | null; target: QuotaTarget }
  | { kind: "proponi" }
  | { kind: "invariato" }
  | { kind: "verifica"; reason: string };

/**
 * Cosa fare dopo «Conferma» sulle quote già presenti (D-bis):
 * nessuna quota → proposta automatica; acquisto diretto → rispettato; più fornitori → nessuna ridistribuzione;
 * un solo fornitore → la sua quota segue «Da acquistare» se l'U.M. è la stessa o c'è conversione valida;
 * quota già in ordine → mai toccata.
 */
export function planQuotaUpdate(args: {
  assignments: QuotaAssignment[];
  directQuota: number | null;
  suppliers: PickSupplier[];
  decidedUnitId: string | null;
  decidedCode: string;
  quantity: number;
  stockUnitId: string | null;
  conversions: Record<string, ValidConversion[]>;
}): QuotaPlan {
  const { assignments, directQuota } = args;
  if (!assignments.length) return directQuota !== null ? { kind: "invariato" } : { kind: "proponi" };
  if (directQuota !== null) return { kind: "verifica", reason: "Acquisto diretto presente: controlla le quote" };
  if (assignments.length > 1) return { kind: "verifica", reason: "Più fornitori: controlla la differenza da assegnare" };
  const a = assignments[0]!;
  if (a.inOrder) return { kind: "verifica", reason: "Questa quota è già in un ordine: gestiscila dalle Bozze." };
  const s = args.suppliers.find((x) => x.linkId === a.linkId);
  if (!s) return { kind: "verifica", reason: "Fornitore non più collegato" };
  const target = quotaFor(s, args.decidedUnitId, args.decidedCode, args.quantity, args.stockUnitId, args.conversions[s.linkId] ?? [], {
    unitId: a.purchaseUnitId,
    manual: a.purchaseUnitId ? null : a.purchaseUnitCode,
  });
  if (!target) return { kind: "verifica", reason: "Da verificare: U.M. diverse senza conversione valida" };
  if (a.purchaseQuantity !== null && Math.abs(a.purchaseQuantity - target.quantity) < 1e-9) return { kind: "invariato" };
  return { kind: "set", linkId: a.linkId, assignmentId: a.id, target };
}
