/**
 * Conferma quantità della Lista: aggiornamento ottimistico della sola riga e ricarica unica in sottofondo.
 * Funzioni pure: il database resta l'unica fonte di verità (la ricarica finale riallinea sempre).
 */

export type OptimisticRow = { item_id: string; decided_quantity: number | string | null };
export type LockEntry = { lockedAt: string | null; unitId: string | null; unitCode: string | null };

/** Nuovo elenco con la quantità della sola riga indicata; le altre righe restano gli stessi oggetti. */
export function patchRowQuantity<R extends OptimisticRow>(rows: R[] | undefined, itemId: string, quantity: number | string | null): R[] | undefined {
  if (!rows) return rows;
  let hit = false;
  const next = rows.map((r) => {
    if (r.item_id !== itemId) return r;
    hit = true;
    return { ...r, decided_quantity: quantity };
  });
  return hit ? next : rows;
}

/** Nuova mappa con blocco/U.M. della sola riga indicata (solo se la riga è già presente). */
export function patchLock<E extends LockEntry>(map: Map<string, E> | undefined, itemId: string, patch: Partial<LockEntry>): Map<string, E> | undefined {
  const current = map?.get(itemId);
  if (!map || !current) return map;
  const next = new Map(map);
  next.set(itemId, { ...current, ...patch });
  return next;
}

/**
 * Ricarica unica: raccoglie le righe salvate e chiama `flush` una sola volta quando non resta
 * nessun salvataggio in corso (così una ricarica non sovrascrive una riga ancora in salvataggio).
 */
export function createRefreshBatcher(flush: (itemIds: string[], wide: boolean) => void) {
  let pending = 0;
  let ids = new Set<string>();
  let wide = false;
  return {
    begin() { pending += 1; },
    end(itemId: string | null, needsWide = false) {
      pending = Math.max(0, pending - 1);
      if (itemId) ids.add(itemId);
      wide = wide || needsWide;
      if (pending > 0 || (!ids.size && !wide)) return;
      const out = [...ids];
      const w = wide;
      ids = new Set();
      wide = false;
      flush(out, w);
    },
    get pending() { return pending; },
  };
}

/**
 * Coda per chiave (es. prodotto «Non in lista»): ogni operazione parte dopo la precedente della stessa
 * chiave, anche se quella è fallita; chiavi diverse procedono in parallelo.
 */
export function createKeyedChain() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(task, task);
      const tail = next.then(() => undefined, () => undefined);
      tails.set(key, tail);
      void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
      return next;
    },
    has(key: string) { return tails.has(key); },
  };
}
