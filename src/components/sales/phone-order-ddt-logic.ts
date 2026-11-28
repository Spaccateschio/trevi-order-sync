/** Pure rules for «DDT da abbinare»: presentation only, the DB re-checks everything. */
export type PendingDdtLine = { key: string; code: string | null; description: string | null; qty: number | null; um: string | null; price: number | null; matchedProductId: string | null };
export type PendingDdt = { id: string; customerName: string | null; customerCode: string | null; docNumber: string | null; docDate: string | null; lines: PendingDdtLine[]; existingOrderNumber: string | null };

export const lineReady = (l: PendingDdtLine) => l.matchedProductId != null && l.qty != null && l.qty > 0 && Boolean(l.um?.trim());
export const unmatchedCount = (d: PendingDdt) => d.lines.filter(l => !lineReady(l)).length;
/** Enabled only with a recognised customer and every line matched; an existing order is only a warning. */
export const canCreatePhoneOrder = (d: PendingDdt) => d.customerName != null && d.lines.length > 0 && unmatchedCount(d) === 0;
export const ddtAmount = (d: PendingDdt) => d.lines.reduce((s, l) => s + (l.qty ?? 0) * (l.price ?? 0), 0);
export const existingOrderWarning = (d: PendingDdt) => d.existingOrderNumber ? `Il cliente ha già l'ordine ${d.existingOrderNumber} per questa data` : null;
