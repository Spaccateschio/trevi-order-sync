import { parseQuantity, qty } from '@/lib/inventory';
import type { IncassiDocLine, IncassiLineMatch, IncassiReceiveDoc } from '@/lib/incassi/incassi-receive';
import type { DisputeReason, DeliveryOrigin, DeliveryStatus } from '@/lib/purchase';

export type ReceiveOutcome = 'ok' | 'parziale' | 'mancante' | 'danneggiato';
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
/** DDT quantity prefilled only for a reliable match not above what is still to receive. */
const ddtQty = (line: ReceiveLine) => line.incassi && line.incassi.status !== 'da_controllare' && line.incassi.qty != null && line.incassi.qty <= line.baseline ? line.incassi.qty : null;
export function initialReceiveDraft(line: ReceiveLine): ReceiveDraft {
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
/** Bulk OK never replaces a row already checked, partially received, missing, or damaged. */
export function confirmUntouched(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>): Record<string, ReceiveDraft> {
  const next = { ...drafts };
  for (const line of lines) {
    const draft = next[line.key] ?? initialReceiveDraft(line);
    if (!draft.outcome) next[line.key] = { ...draft, outcome: 'ok' };
  }
  return next;
}
export function receiveSummary(lines: ReceiveLine[], drafts: Record<string, ReceiveDraft>) {
  const summary = { ok: 0, parziale: 0, mancante: 0, danneggiato: 0, untouched: 0 };
  for (const line of lines) {
    const outcome = drafts[line.key]?.outcome;
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
  if (arrived > line.baseline) throw new Error(`${line.name}: la quantità supera quella da ricevere`);
  const accepted = missing ? 0 : draft.outcome === 'danneggiato' ? numeric(draft.goodQuantity, 'Quantità buona') : arrived;
  if (accepted > arrived) throw new Error(`${line.name}: la quantità buona supera quella arrivata`);
  if (draft.outcome === 'parziale' && (arrived <= 0 || arrived >= line.baseline)) throw new Error(`${line.name}: indica una quantità parziale oppure scegli OK o Mancante`);
  if (missing && !draft.missingReason.trim()) throw new Error(`${line.name}: indica il motivo della mancanza`);
  const stock = missing || accepted === 0 ? 0 : line.sameUnit ? accepted : numeric(draft.outcome === 'danneggiato' ? draft.goodStockQuantity : draft.stockQuantity, `Quantità verificata in ${line.stockUnitCode ?? 'magazzino'}`);
  const declaredStock = supplierDeclared ? line.declaredStock : missing ? (line.sameUnit ? 0 : null) : line.sameUnit ? arrived : numeric(draft.stockQuantity, `Quantità arrivata in ${line.stockUnitCode ?? 'magazzino'}`);
  if (accepted > 0 && stock <= 0) throw new Error(`${line.name}: indica la quantità effettiva per il magazzino`);
  if (!supplierDeclared && declaredStock != null && stock > declaredStock) throw new Error(`${line.name}: la quantità buona supera quella arrivata in magazzino`);
  const cost = optionalNumeric(draft.unitCost, 'Prezzo');
  let priceQuantity = optionalNumeric(draft.priceQuantity, 'Quantità del prezzo');
  const priceCode = draft.priceUnitCode.trim();
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
