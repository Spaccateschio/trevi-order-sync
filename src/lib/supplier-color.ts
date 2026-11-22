/**
 * Colore pastello di presentazione per fornitore (solo schermo, nessuna regola di business).
 * Chiave stabile: supplier_records.id. Colore salvato (display_color) vince sull'automatico.
 */
export const SUPPLIER_PALETTE = ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09", "p10", "p11", "p12"] as const;
export type SupplierColorCode = (typeof SUPPLIER_PALETTE)[number];

export const SUPPLIER_COLOR_NAMES: Record<SupplierColorCode, string> = {
  p01: "Azzurro", p02: "Celeste", p03: "Lavanda", p04: "Lilla", p05: "Rosa", p06: "Pesca",
  p07: "Sabbia", p08: "Acqua", p09: "Turchese", p10: "Pervinca", p11: "Grigio-blu", p12: "Malva",
};

export function isSupplierColorCode(value: unknown): value is SupplierColorCode {
  return typeof value === "string" && (SUPPLIER_PALETTE as readonly string[]).includes(value);
}

/** Colore automatico: hash FNV-1a dell'id, sempre uguale per lo stesso fornitore. */
export function autoSupplierColor(supplierRecordId: string): SupplierColorCode {
  let h = 0x811c9dc5;
  for (let i = 0; i < supplierRecordId.length; i++) {
    h ^= supplierRecordId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return SUPPLIER_PALETTE[h % SUPPLIER_PALETTE.length]!;
}

export function resolveSupplierColor(supplierRecordId: string, saved: string | null | undefined): SupplierColorCode {
  return isSupplierColorCode(saved) ? saved : autoSupplierColor(supplierRecordId);
}

/** Variabile CSS del token (definita in src/styles.css). */
export const supplierColorVar = (code: SupplierColorCode) => `var(--supplier-${code})`;

export type ProductSupplierTone = { recordId: string; name: string; color: SupplierColorCode };

/**
 * Fornitore principale e fasce di una card.
 * Ordine: quota più alta salvata in questa Lista; poi stella (preferito); poi priorità e nome.
 */
export function productSupplierTones(args: {
  links: { recordId: string; preferred: boolean; priority?: number | null }[];
  quotas?: { recordId: string; quantity: number | null }[] | undefined;
  records: Map<string, { name: string; color: SupplierColorCode }>;
}): ProductSupplierTone[] {
  const quotaBy = new Map<string, number>();
  for (const q of args.quotas ?? []) quotaBy.set(q.recordId, (quotaBy.get(q.recordId) ?? 0) + Math.max(0, q.quantity ?? 0));
  const ids = [...new Set([...(args.quotas ?? []).map((q) => q.recordId), ...(args.quotas?.length ? [] : args.links.map((l) => l.recordId))])];
  const link = (id: string) => args.links.find((l) => l.recordId === id);
  return ids
    .filter((id) => args.records.has(id))
    .sort((a, b) => {
      const qa = quotaBy.get(a) ?? -1, qb = quotaBy.get(b) ?? -1;
      if (qa !== qb) return qb - qa;
      const pa = link(a)?.preferred ? 1 : 0, pb = link(b)?.preferred ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ra = link(a)?.priority ?? 999, rb = link(b)?.priority ?? 999;
      if (ra !== rb) return ra - rb;
      return args.records.get(a)!.name.localeCompare(args.records.get(b)!.name, "it");
    })
    .map((id) => ({ recordId: id, ...args.records.get(id)! }));
}
