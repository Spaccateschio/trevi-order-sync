/** Pure rules for «DDT da abbinare»: presentation only, the DB re-checks everything. */
export type PendingDdtLine = { key: string; code: string | null; description: string | null; qty: number | null; um: string | null; price: number | null; matchedProductId: string | null };
export type PendingDdt = { id: string; customerName: string | null; customerCode: string | null; docNumber: string | null; docDate: string | null; lines: PendingDdtLine[]; existingOrderNumber: string | null };
export type PendingDdtCandidate = { linkId: string; code: string | null; description: string | null };

export const lineReady = (l: PendingDdtLine) => l.matchedProductId != null && l.qty != null && l.qty > 0 && Boolean(l.um?.trim());
export const unmatchedCount = (d: PendingDdt) => d.lines.filter(l => !lineReady(l)).length;
/** Enabled only with a recognised customer and every line matched; an existing order is only a warning. */
export const canCreatePhoneOrder = (d: PendingDdt) => d.customerName != null && d.lines.length > 0 && unmatchedCount(d) === 0;
export const ddtAmount = (d: PendingDdt) => d.lines.reduce((s, l) => s + (l.qty ?? 0) * (l.price ?? 0), 0);
export const existingOrderWarning = (d: PendingDdt) => d.existingOrderNumber ? `Il cliente ha già l'ordine ${d.existingOrderNumber} per questa data` : null;

const num = (v: unknown) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const txt = (v: unknown) => typeof v === 'string' && v.trim() ? v : null;
/** Maps the DB payload; a manual choice wins over the automatic code match, and only normalised units count. */
export function mapPendingDocs(raw: unknown, manual: Record<string, Record<string, string>> = {}): { doc: PendingDdt; candidates: PendingDdtCandidate[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d: Record<string, unknown>) => {
    const id = String(d['id']);
    const lines = (Array.isArray(d['lines']) ? d['lines'] : []) as Record<string, unknown>[];
    return {
      doc: { id, customerName: txt(d['customer_name']), customerCode: txt(d['customer_code']), docNumber: txt(d['doc_number']), docDate: txt(d['doc_date']), existingOrderNumber: txt(d['existing_order_number']),
        lines: lines.map(l => { const key = String(l['idx']); return { key, code: txt(l['code']), description: txt(l['description']), qty: num(l['qty']), um: txt(l['um_normalized']), price: num(l['price']), matchedProductId: manual[id]?.[key] ?? txt(l['auto_link_id']) }; }) },
      candidates: ((Array.isArray(d['candidates']) ? d['candidates'] : []) as Record<string, unknown>[]).map(c => ({ linkId: String(c['link_id']), code: txt(c['code']), description: txt(c['description']) })),
    };
  });
}
/** Only manual choices are sent; the server recomputes automatic matches itself. */
export const manualMatchesPayload = (manual: Record<string, string> | undefined) => ({ ...(manual ?? {}) });
