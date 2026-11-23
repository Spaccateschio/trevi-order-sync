export type EntryCartLine = {
  id: string;
  productId?: string;
  label: string;
  detail?: string;
  quantity: string;
  unitCode: string | null;
  supplierNames?: string[];
  supplierDetails?: string[];
  /** Motivo esatto quando non esiste nessuna destinazione (solo presentazione). */
  noSupplierReason?: string | null;
  error?: string | null;
};

export type EntryCartMissing = {
  id: string;
  label: string;
  detail?: string;
};

export type EntryCartProgress = { done: number; total: number } | null;

type DraftEnvelope<T> = { version: 1; updatedAt: string; value: T };

/** La bozza appartiene a una persona, a un'azienda e a una specifica lista o sessione. */
export function entryCartStorageKey(args: {
  userId: string;
  companyId: string;
  area: "lista" | "inventario";
  referenceId: string;
}) {
  return ["efficio-entry-cart", "v1", args.userId, args.companyId, args.area, args.referenceId].join(":");
}

export function readEntryCartDraft<T>(
  storage: Pick<Storage, "getItem"> | null,
  key: string,
  validate: (value: unknown) => T | null,
): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope<unknown>>;
    return parsed.version === 1 ? validate(parsed.value) : null;
  } catch {
    return null;
  }
}

export function writeEntryCartDraft<T>(storage: Pick<Storage, "setItem"> | null, key: string, value: T) {
  if (!storage) return false;
  try {
    const envelope: DraftEnvelope<T> = { version: 1, updatedAt: new Date().toISOString(), value };
    storage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearEntryCartDraft(storage: Pick<Storage, "removeItem"> | null, key: string) {
  if (!storage) return;
  try { storage.removeItem(key); } catch { /* Lo storage non disponibile non blocca il lavoro. */ }
}

export function entryCartMetrics(lines: Pick<EntryCartLine, "id" | "productId" | "supplierNames">[]) {
  return {
    products: new Set(lines.map((line) => line.productId ?? line.id)).size,
    suppliers: new Set(lines.flatMap((line) => line.supplierNames ?? [])).size,
  };
}

/** Nel riepilogo una riga con più fornitori compare sotto ciascuno, sempre con la sua quantità totale. */
export function entryCartLinesBySupplier<T extends Pick<EntryCartLine, "supplierNames" | "noSupplierReason">>(lines: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const names = [...new Set((line.supplierNames ?? []).map((name) => name.trim()).filter(Boolean))];
    for (const supplier of names.length ? names : [`Senza fornitore — ${line.noSupplierReason ?? "da scegliere sulla card"}`]) {
      groups.set(supplier, [...(groups.get(supplier) ?? []), line]);
    }
  }
  return [...groups.entries()]
    .map(([supplier, supplierLines]) => ({ supplier, lines: supplierLines }))
    .sort((left, right) => left.supplier.localeCompare(right.supplier, "it"));
}

/** Nell'anteprima l'invio multiplo comprende esclusivamente i fornitori B2B. */
export function bulkB2bSupplierNames(groups: readonly { supplier: string }[], b2bSuppliers: ReadonlySet<string>) {
  return groups.map((group) => group.supplier).filter((supplier) => b2bSuppliers.has(supplier));
}

/** Una riga confermata che viene modificata passa nelle bozze, senza comparire due volte. */
export function confirmedLinesWithoutDrafts<T extends Pick<EntryCartLine, "id">>(confirmed: readonly T[], drafts: readonly Pick<EntryCartLine, "id">[]): T[] {
  const draftIds = new Set(drafts.map((line) => line.id));
  return confirmed.filter((line) => !draftIds.has(line.id));
}

/**
 * Un gruppo alla volta, richieste indipendenti in parallelo. Un rifiuto non ferma le altre righe:
 * il risultato contiene solo gli errori, associati alla loro chiave.
 */
export async function saveEntryCartInGroups<T>(args: {
  lines: T[];
  keyOf: (line: T) => string;
  worker: (line: T) => Promise<void>;
  groupSize?: number;
  onProgress?: (done: number, total: number) => void;
}) {
  const errors: Record<string, string> = {};
  const groupSize = Math.max(1, args.groupSize ?? 4);
  let done = 0;
  args.onProgress?.(0, args.lines.length);
  for (let offset = 0; offset < args.lines.length; offset += groupSize) {
    const group = args.lines.slice(offset, offset + groupSize);
    const results = await Promise.allSettled(group.map((line) => args.worker(line)));
    results.forEach((result, index) => {
      const key = args.keyOf(group[index]!);
      if (result.status === "rejected") {
        errors[key] = result.reason instanceof Error ? result.reason.message : "Salvataggio non riuscito";
      }
      done += 1;
      args.onProgress?.(done, args.lines.length);
    });
  }
  return errors;
}
