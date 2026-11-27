/** Pure rules for Trevi Incassi delivery documents: linking, unit normalization, idempotent merge. */
export type LinkResult =
  | { status: 'collegato'; orderId: string; buyerCompanyId: string; reason: null }
  | { status: 'da_controllare'; orderId: null; buyerCompanyId: null; reason: 'codice_cliente_mancante' | 'riferimento_mancante' | 'nessun_ordine' | 'più_ordini' };

const ORD_RE = /ORD-\d{4}-\d{5}/gi;
/** Exactly one distinct ORD reference in the notes, otherwise null (never guess). */
export function extractOrderRef(notes: string | null | undefined): string | null {
  const found = new Set((notes ?? '').match(ORD_RE)?.map((s) => s.toUpperCase()) ?? []);
  return found.size === 1 ? [...found][0]! : null;
}

export function resolveOrderLink(customerCode: string | null | undefined, orderRef: string | null, candidates: { order_id: string; buyer_company_id: string }[]): LinkResult {
  if (!customerCode || !customerCode.trim()) return { status: 'da_controllare', orderId: null, buyerCompanyId: null, reason: 'codice_cliente_mancante' };
  if (!orderRef) return { status: 'da_controllare', orderId: null, buyerCompanyId: null, reason: 'riferimento_mancante' };
  const ids = new Map(candidates.map((c) => [c.order_id, c.buyer_company_id]));
  if (ids.size === 0) return { status: 'da_controllare', orderId: null, buyerCompanyId: null, reason: 'nessun_ordine' };
  if (ids.size > 1) return { status: 'da_controllare', orderId: null, buyerCompanyId: null, reason: 'più_ordini' };
  const [orderId, buyer] = [...ids][0]!;
  return { status: 'collegato', orderId, buyerCompanyId: buyer, reason: null };
}

const PIECE = new Set(['pz', 'pezzo', 'pezzi']);
/** Empty or unknown unit → null (row to review); never converted at random. */
export function normalizeIncassiUnit(um: string | null | undefined, knownCodes: readonly string[] = []): string | null {
  const u = (um ?? '').trim().toLowerCase();
  if (!u) return null;
  if (PIECE.has(u)) return 'pz';
  if (u === 'kg') return 'kg';
  const hit = knownCodes.find((c) => c.trim().toLowerCase() === u);
  return hit ? hit.trim().toLowerCase() : null;
}

export type IncassiLineIn = { code?: string | null | undefined; description?: string | null | undefined; qty?: number | null | undefined; um?: string | null | undefined; price?: number | null | undefined; total?: number | null | undefined };
export type IncassiLine = { code: string | null; description: string | null; qty: number | null; um: string | null; um_normalized: string | null; price: number | null; total: number | null; needs_review: boolean };
export function normalizeLines(lines: IncassiLineIn[], knownCodes: readonly string[] = []): IncassiLine[] {
  return lines.map((l) => {
    const um_normalized = normalizeIncassiUnit(l.um, knownCodes);
    return { code: l.code ?? null, description: l.description ?? null, qty: l.qty ?? null, um: l.um ?? null, um_normalized, price: l.price ?? null, total: l.total ?? null, needs_review: um_normalized === null || l.qty == null };
  });
}

export type DocState = {
  doc_type: 'ddt' | 'preventivo'; doc_number: string | null; doc_date: string | null; customer_code: string | null; notes_raw: string | null;
  prepared_at: string | null; in_carico_at: string | null; consegna_stato: 'consegnato' | 'non_consegnato' | null; consegna_at: string | null; lines: IncassiLine[];
};
/** doc_type may be omitted on updates: reuse the stored one; a new document without it is rejected (null). */
export function resolveDocType(existing: Pick<DocState, 'doc_type'> | null, incoming: DocState['doc_type'] | null | undefined): DocState['doc_type'] | null {
  return incoming ?? existing?.doc_type ?? null;
}
/** Same document twice = same result; an empty incoming field never erases a stored value. */
export function mergeDocument(existing: DocState | null, incoming: Partial<DocState> & { doc_type: DocState['doc_type'] }): DocState {
  const pick = <K extends keyof DocState>(k: K): DocState[K] => {
    const v = incoming[k];
    const empty = v === undefined || v === null || (Array.isArray(v) && v.length === 0 && k === 'lines' && existing != null);
    return (empty ? (existing?.[k] ?? (k === 'lines' ? [] : null)) : v) as DocState[K];
  };
  return {
    doc_type: incoming.doc_type, doc_number: pick('doc_number'), doc_date: pick('doc_date'), customer_code: pick('customer_code'), notes_raw: pick('notes_raw'),
    prepared_at: pick('prepared_at'), in_carico_at: pick('in_carico_at'), consegna_stato: pick('consegna_stato'), consegna_at: pick('consegna_at'), lines: pick('lines'),
  };
}

/** Timeline facts for steps 4-6: step 6 only when delivered. */
export function deliveryTimelineFacts(d: { prepared_at: string | null; in_carico_at: string | null; consegna_stato: string | null; consegna_at: string | null } | null | undefined) {
  if (!d) return { prepared_at: null, shipped_at: null, delivered_at: null, not_delivered: false };
  return { prepared_at: d.prepared_at, shipped_at: d.in_carico_at, delivered_at: d.consegna_stato === 'consegnato' ? d.consegna_at : null, not_delivered: d.consegna_stato === 'non_consegnato' };
}
