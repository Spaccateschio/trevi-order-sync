import { parseQuantity, qty } from '@/lib/inventory';
import type { IncassiDocLine, IncassiLineMatch, IncassiReceiveDoc } from '@/lib/incassi/incassi-receive';
import type { DisputeReason, DeliveryOrigin, DeliveryStatus } from '@/lib/purchase';

export type ReceiveOutcome = 'ok' | 'parziale' | 'mancante' | 'danneggiato' | 'eccedenza';
export type ReceiveLine = {
  key: string; orderItemId: string | null; deliveryItemId: string | null;
  productId: string; code: string; name: string; version: string;
  ordered: number | null; baseline: number; unitCode: string | null; orderedUnitCode?: string | null;
  stockUnitCode: string | null; sameUnit: boolean; declaredStock: number | null;
  declaredPurchase: number | null; lineType: string;
  producer: string | null; lot: string | null; expiry: string | null;
  unitCost: number | null; priceUnitCode: string | null; priceUnitId: string | null;
  verifiedStock: number | null; priceQuantity: number | null;
  receiptId?: string | null; receiptItemId?: string | null; receiptVersion?: string | null; receiptItemVersion?: string | null;
  incassi?: IncassiLineMatch;
};
export type ReceiveBundle = {
  companyId: string; archiveId: string; orderVersion: string;
  delivery: { id: string; origin: DeliveryOrigin; status: DeliveryStatus; version: string } | null;
  receiptId: string | null; lines: ReceiveLine[];
  incassiDocuments?: IncassiReceiveDoc[]; incassiUnmatched?: IncassiDocLine[];
};
export type ReceiveDraft = {
  outcome: ReceiveOutcome | null; quantity: string; goodQuantity: string;
  stockQuantity: string; goodStockQuantity: string; missingReason: string;
  reason: DisputeReason; producer: string; lot: string; expiry: string;
  unitCost: string; priceUnitCode: string; priceQuantity: string;
  substituteProductId: string; substituteQuantity: string;
};
export const OUTCOMES = [['ok', 'OK'], ['parziale', 'Parziale'], ['mancante', 'Mancante'], ['danneggiato', 'Danneggiato']] as const;
const str = (value: number | null) => value == null ? '' : String(value);
/** Explicit excess is available only without a delivery/declaration and in kg/kg. */
export function canReceiveExcess(line: ReceiveLine, hasDelivery = false): boolean {
  return !hasDelivery && line.deliveryItemId == null && line.declaredPurchase == null && line.declaredStock == null
    && line.sameUnit && line.unitCode?.trim().toLowerCase() === 'kg' && line.stockUnitCode?.trim().toLowerCase() === 'kg'
    && line.incassi?.status === 'eccedenza' && Boolean(line.incassi.documentId)
    && line.incassi.qty != null && line.incassi.qty > line.baseline;
}
/** DDT proposals remain local until final confirmation. */
const ddtQty = (line: ReceiveLine) => line.incassi && line.incassi.status !== 'da_controllare' && line.incassi.qty != null && (line.incassi.qty <= line.baseline || canReceiveExcess(line)) ? line.incassi.qty : null;
export function initialReceiveDraft(line: ReceiveLine, hasDelivery = false): ReceiveDraft {
  const base = baseReceiveDraft(line);
  if (!canReceiveExcess(line, hasDelivery)) return base;
  const ddt = str(line.incassi?.qty ?? null);
  // Excess rows open preset with DDT quantity and price; confirmation still happens only with «Conferma carico».
  return { ...base, outcome: 'eccedenza', quantity: ddt, goodQuantity: ddt, unitCost: str(line.incassi?.price ?? null), priceUnitCode: 'kg', priceQuantity: ddt };
}
function baseReceiveDraft(line: ReceiveLine): ReceiveDraft {
  return {
    outcome: null, quantity: str(ddtQty(line) ?? line.baseline), goodQuantity: str(ddtQty(line) ?? line.baseline),
    stockQuantity: str(line.sameUnit ? line.baseline : line.verifiedStock ?? line.declaredStock),
    goodStockQuantity: str(line.sameUnit ? line.baseline : line.verifiedStock ?? line.declaredStock),
    missingReason: '', reason: 'qualita', producer: line.producer ?? '', lot: line.lot ?? '', expiry: line.expiry ?? '',
    unitCost: str(line.unitCost ?? (line.incassi && line.incassi.status !== 'da_controllare' ? line.incassi.price : null)),
    priceUnitCode: line.priceUnitCode ?? '', priceQuantity: str(line.priceQuantity),
    substituteProductId: '', substituteQuantity: '',
  };
}
/** Leaving excess restores the original price basis, never the excess weight as an OK price quantity. */
export function chooseReceiveOutcome(line: ReceiveLine, draft: ReceiveDraft, outcome: ReceiveOutcome): ReceiveDraft {
  if (draft.outcome !== 'eccedenza' || outcome === 'eccedenza') return { ...draft, outcome };
  const initial = baseReceiveDraft(line);
  return { ...draft, outcome, quantity: str(line.baseline), unitCost: initial.unitCost, priceUnitCode: initial.priceUnitCode, priceQuantity: initial.priceQuantity };
}
/** Bulk OK never replaces a row already checked, partially received, missing, or damaged. */
export function confirmUntouched(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>, hasDelivery = false): Record<string, ReceiveDraft> {
  const next = { ...drafts };
  for (const line of lines) {
    const draft = next[line.key] ?? initialReceiveDraft(line, hasDelivery);
    next[line.key] = draft.outcome ? draft : { ...draft, outcome: 'ok' };
  }
  return next;
}
export function receiveSummary(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>, hasDelivery = false) {
  const summary = { ok: 0, parziale: 0, mancante: 0, danneggiato: 0, eccedenza: 0, untouched: 0 };
  for (const line of lines) {
    const outcome = (drafts[line.key] ?? initialReceiveDraft(line, hasDelivery)).outcome;
    if (outcome) summary[outcome]++; else summary.untouched++;
  }
  return summary;
}
const numeric = (raw: string, name: string) => {
  const value = parseQuantity(raw);
  if (value == null || value < 0) throw new Error(`${name}: quantità non valida`);
  return value;
};
const optionalNumeric = (raw: string, name: string) => raw.trim() ? numeric(raw, name) : null;
/** No package/weight conversion is guessed: verified stock is explicit when units differ. */
export function receivePayload(line: ReceiveLine, draft: ReceiveDraft, supplierDeclared: boolean) {
  if (!draft.outcome) throw new Error(`${line.name}: scegli un esito`);
  const missing = draft.outcome === 'mancante';
  const arrived = missing ? 0 : draft.outcome === 'ok' ? line.baseline : numeric(draft.quantity, line.name);
  const excess = draft.outcome === 'eccedenza';
  if (excess && (!canReceiveExcess(line, supplierDeclared) || arrived <= line.baseline || arrived > (line.incassi?.qty ?? 0))) throw new Error(`${line.name}: eccedenza non valida rispetto al DDT`);
  if (arrived > line.baseline && !excess) throw new Error(`${line.name}: la quantità supera quella da ricevere`);
  const accepted = missing ? 0 : draft.outcome === 'danneggiato' ? numeric(draft.goodQuantity, 'Quantità buona') : arrived;
  if (accepted > arrived) throw new Error(`${line.name}: la quantità buona supera quella arrivata`);
  if (draft.outcome === 'parziale' && (arrived <= 0 || arrived >= line.baseline)) throw new Error(`${line.name}: indica una quantità parziale oppure scegli OK o Mancante`);
  if (missing && !draft.missingReason.trim()) throw new Error(`${line.name}: indica il motivo della mancanza`);
  const stock = missing || accepted === 0 ? 0 : line.sameUnit ? accepted : numeric(draft.outcome === 'danneggiato' ? draft.goodStockQuantity : draft.stockQuantity, `Quantità verificata in ${line.stockUnitCode ?? 'magazzino'}`);
  const declaredStock = supplierDeclared ? line.declaredStock : missing ? (line.sameUnit ? 0 : null) : line.sameUnit ? arrived : numeric(draft.stockQuantity, `Quantità arrivata in ${line.stockUnitCode ?? 'magazzino'}`);
  if (accepted > 0 && stock <= 0) throw new Error(`${line.name}: indica la quantità effettiva per il magazzino`);
  if (!supplierDeclared && declaredStock != null && stock > declaredStock) throw new Error(`${line.name}: la quantità buona supera quella arrivata in magazzino`);
  const cost = excess ? line.incassi?.price ?? null : optionalNumeric(draft.unitCost, 'Prezzo');
  let priceQuantity = optionalNumeric(draft.priceQuantity, 'Quantità del prezzo');
  const priceCode = excess ? 'kg' : draft.priceUnitCode.trim();
  if (excess) priceQuantity = accepted;
  if (priceQuantity == null && priceCode) {
    if (priceCode.toLowerCase() === line.unitCode?.toLowerCase()) priceQuantity = accepted || null;
    else if (priceCode.toLowerCase() === line.stockUnitCode?.toLowerCase()) priceQuantity = stock || null;
  }
  if (priceQuantity != null && priceQuantity <= 0) throw new Error('Quantità del prezzo non valida');
  const substitute = draft.substituteProductId.trim() || null;
  if (substitute && (!missing || supplierDeclared)) throw new Error('Per una sostituzione interna, segna Mancante la riga originale');
  return {
    order_item_id: line.orderItemId, delivery_item_id: line.deliveryItemId, version: line.version,
    receipt_id: line.receiptId ?? null, receipt_item_id: line.receiptItemId ?? null,
    receipt_version: line.receiptVersion ?? null, receipt_item_version: line.receiptItemVersion ?? null,
    excess_confirmed: excess, ddt_document_id: excess ? line.incassi?.documentId ?? null : null,
    outcome: draft.outcome, quantity: accepted, arrived_quantity: arrived,
    declared_stock_quantity: declaredStock, verified_quantity: stock,
    missing_reason: missing ? draft.missingReason.trim() : null,
    reason: draft.reason, notes: draft.outcome === 'danneggiato' ? 'Danneggiato: verifica al ricevimento' : null,
    producer: draft.producer.trim() || null, lot: draft.lot.trim() || null, expiry: draft.expiry || null,
    unit_cost: cost, price_unit_code: priceCode || null,
    price_quantity: priceQuantity, substitute_product_id: substitute,
    substitute_quantity: substitute ? numeric(draft.substituteQuantity, 'Quantità sostitutiva in magazzino') : null,
  };
}
const withUnit = (value: number, unit: string | null | undefined) => unit ? `${qty(value)} ${unit}` : qty(value);
/** Pure presentation of the three columns; never invents quantities or prices. */
export function receiveLineColumns(line: ReceiveLine) {
  const orderedUnit = line.orderedUnitCode ?? line.unitCode;
  const ordered = line.ordered == null ? '—' : withUnit(line.ordered, orderedUnit);
  const ddt = line.incassi;
  const arrived = line.declaredPurchase != null ? withUnit(line.declaredPurchase, line.unitCode)
    : line.declaredStock != null ? withUnit(line.declaredStock, line.stockUnitCode)
    : ddt && ddt.qty != null ? withUnit(ddt.qty, ddt.unit) : null;
  const arrivedStock = line.declaredPurchase != null && line.declaredStock != null && !line.sameUnit ? withUnit(line.declaredStock, line.stockUnitCode) : null;
  if (line.unitCost == null && ddt && ddt.price != null) {
    const ddtPrice = `${ddt.price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}${ddt.unit ? ` / ${ddt.unit}` : ''}`;
    return { ordered, arrived, arrivedStock, price: ddtPrice, ddt };
  }
  const price = line.unitCost == null ? null : `${line.unitCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}${line.priceUnitCode ? ` / ${line.priceUnitCode}` : ''}`;
  return { ordered, arrived, arrivedStock, price, ddt: ddt ?? null };
}

/* ---------- Compact mobile receiving: presentation only, never changes payload rules ---------- */
export type ReceiveRowIndicator = 'ok' | 'da_controllare' | 'da_fare';
/** «!» only for rows already «da controllare» (unit, unmatched, uncertain match); weight differences never alarm. */
export function receiveRowNeedsReview(line: ReceiveLine): boolean {
  return line.incassi?.status === 'da_controllare';
}
export function receiveRowIndicator(line: ReceiveLine, draft: ReceiveDraft, reviewed = false): ReceiveRowIndicator {
  if (receiveRowNeedsReview(line) && !reviewed) return 'da_controllare';
  return draft.outcome ? 'ok' : 'da_fare';
}
/** Prepared side: supplier declaration first, then the DDT line; each side keeps its own unit. */
export function requestedPreparedLabel(line: ReceiveLine): string {
  const requested = withUnit(line.ordered ?? line.baseline, line.orderedUnitCode ?? line.unitCode);
  const ddt = line.incassi;
  const prepared = line.declaredPurchase != null ? withUnit(line.declaredPurchase, line.unitCode)
    : line.declaredStock != null ? withUnit(line.declaredStock, line.stockUnitCode)
    : ddt && ddt.qty != null ? withUnit(ddt.qty, ddt.unit ?? line.unitCode) : '—';
  return `Richiesto ${requested} · Preparato ${prepared}`;
}
/** The single «OK» keeps the internal DDT-capped outcome for eligible kg rows, without naming it. */
export function chooseOkDraft(line: ReceiveLine, draft: ReceiveDraft, hasDelivery = false): ReceiveDraft {
  return canReceiveExcess(line, hasDelivery) ? initialReceiveDraft(line, hasDelivery) : chooseReceiveOutcome(line, draft, 'ok');
}
export function isOkOutcome(outcome: ReceiveOutcome | null): boolean {
  return outcome === 'ok' || outcome === 'eccedenza';
}
const draftOf = (line: ReceiveLine, drafts: Record<string, ReceiveDraft>, hasDelivery: boolean) => drafts[line.key] ?? initialReceiveDraft(line, hasDelivery);
export function receiveCounts(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>, reviewed: Record<string, boolean>, hasDelivery = false) {
  let checked = 0;
  for (const line of lines) if (receiveRowIndicator(line, draftOf(line, drafts, hasDelivery), reviewed[line.key] ?? false) === 'ok') checked++;
  return { checked, toCheck: lines.length - checked };
}
export function receiveCountsLabel(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>, reviewed: Record<string, boolean>, hasDelivery = false): string {
  const c = receiveCounts(lines, drafts, reviewed, hasDelivery);
  return `${c.checked} controllate · ${c.toCheck} da controllare. Tocca una riga per prezzo e dettagli.`;
}
/** Enabled only when every row has an outcome and no «!» is left; stock still moves only on click. */
export function canConfirmReceipt(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>, reviewed: Record<string, boolean>, hasDelivery = false): boolean {
  return lines.length > 0 && receiveCounts(lines, drafts, reviewed, hasDelivery).toCheck === 0;
}
/** Sheet boxes: DDT price with its unit and the amount only when units agree; nothing invented. */
export function receiveSheetMoney(line: ReceiveLine, draft: ReceiveDraft): { price: string | null; amount: string | null } {
  const eur = (v: number) => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const ddt = line.incassi && line.incassi.status !== 'da_controllare' ? line.incassi : null;
  const priceValue = ddt?.price ?? (draft.unitCost.trim() ? parseQuantity(draft.unitCost) : line.unitCost);
  const priceUnit = ddt?.price != null ? ddt.unit ?? line.unitCode : draft.priceUnitCode || line.priceUnitCode;
  if (priceValue == null) return { price: null, amount: null };
  const quantity = ddt?.qty != null ? ddt.qty : line.declaredPurchase;
  const quantityUnit = ddt?.qty != null ? ddt.unit ?? line.unitCode : line.unitCode;
  const amount = quantity != null && priceUnit && quantityUnit && priceUnit.toLowerCase() === quantityUnit.toLowerCase() ? eur(Math.round(priceValue * quantity * 100) / 100) : null;
  return { price: `${eur(priceValue)}${priceUnit ? ` / ${priceUnit}` : ''}`, amount };
}
export function isWeightLine(line: ReceiveLine): boolean {
  return (line.incassi?.unit ?? line.unitCode)?.trim().toLowerCase() === 'kg';
}
