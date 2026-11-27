/** Pure presentation rules: Incassi DDT lines shown as supplier-declared goods in receiving. Never writes. */
import { normalizeIncassiUnit } from './incassi-link';

export type IncassiDocLine = { code: string | null; description: string | null; qty: number | null; um: string | null; price: number | null; total?: number | null };
export type IncassiReceiveDoc = { id: string; docNumber: string | null; docDate: string | null; consegnaStato: string | null; lines: IncassiDocLine[] };
export type IncassiOrderLine = { key: string; supplierCode: string | null; ordered: number | null; orderedUnitCode: string | null };
export type IncassiMatchStatus = 'abbinata' | 'differenza' | 'da_controllare';
export type IncassiLineMatch = {
  status: IncassiMatchStatus; docNumber: string | null; qty: number | null; unit: string | null;
  price: number | null; reason: string | null;
};
export type IncassiMatchResult = { byKey: Record<string, IncassiLineMatch>; unmatched: IncassiDocLine[]; documents: IncassiReceiveDoc[] };

const norm = (code: string | null | undefined) => (code ?? '').trim().toUpperCase();
const unitOf = (um: string | null | undefined) => normalizeIncassiUnit(um, um ? [um] : []);

/** One DDT line per Danea supplier code, never guessed; several valid DDT → everything to review. */
export function matchIncassiLines(orderLines: IncassiOrderLine[], documents: IncassiReceiveDoc[]): IncassiMatchResult {
  const valid = documents.filter((d) => d.consegnaStato !== 'non_consegnato');
  const byKey: Record<string, IncassiLineMatch> = {};
  if (valid.length === 0) return { byKey, unmatched: [], documents: valid };
  if (valid.length > 1) {
    for (const l of orderLines) byKey[l.key] = { status: 'da_controllare', docNumber: null, qty: null, unit: null, price: null, reason: 'Più documenti per questo ordine' };
    return { byKey, unmatched: [], documents: valid };
  }
  const doc = valid[0]!;
  const used = new Set<number>();
  for (const l of orderLines) {
    const code = norm(l.supplierCode);
    const hits = code ? doc.lines.map((d, i) => [d, i] as const).filter(([d]) => norm(d.code) === code) : [];
    if (hits.length !== 1) {
      hits.forEach(([, i]) => used.add(i));
      if (hits.length > 1) byKey[l.key] = { status: 'da_controllare', docNumber: doc.docNumber, qty: null, unit: null, price: null, reason: 'Codice ripetuto nel documento' };
      continue;
    }
    const [d, i] = hits[0]!;
    used.add(i);
    const unit = unitOf(d.um);
    const base = { docNumber: doc.docNumber, qty: d.qty, unit: d.um?.trim() || null, price: d.price };
    const ordUnit = unitOf(l.orderedUnitCode);
    let status: IncassiMatchStatus = 'abbinata'; let reason: string | null = null;
    if (!unit || d.qty == null) { status = 'da_controllare'; reason = 'Unità o quantità da controllare'; }
    else if (unit === 'pz' && !Number.isInteger(d.qty)) { status = 'da_controllare'; reason = 'Pezzi con decimali'; }
    else if (!ordUnit || unit !== ordUnit) { status = 'da_controllare'; reason = 'Unità diversa dall\'ordine'; }
    else if (l.ordered != null && d.qty !== l.ordered) { status = 'differenza'; reason = 'Quantità diversa dall\'ordinato'; }
    byKey[l.key] = { status, reason, ...base };
  }
  return { byKey, unmatched: doc.lines.filter((_, i) => !used.has(i)), documents: valid };
}
