/** Zone abituali di un prodotto: solo informazione organizzativa (nessun effetto su card, giacenze o conteggi). */
export type HabitualState = { ids: string[]; primaryId: string | null };

/** Aggiunge/toglie una zona. Se si toglie la principale, la principale resta vuota: va scelta dall'utente. */
export function toggleHabitual(state: HabitualState, locationId: string): HabitualState {
  if (state.ids.includes(locationId)) {
    const ids = state.ids.filter((id) => id !== locationId);
    return { ids, primaryId: state.primaryId === locationId ? null : state.primaryId };
  }
  const ids = [...state.ids, locationId];
  // Prima zona aggiunta: è l'unica possibile, quindi è la principale.
  return { ids, primaryId: state.primaryId ?? (ids.length === 1 ? locationId : null) };
}

export function setPrimary(state: HabitualState, locationId: string): HabitualState {
  if (!state.ids.includes(locationId)) return state;
  return { ...state, primaryId: locationId };
}

/** Messaggio di blocco prima del salvataggio, null se salvabile. */
export function habitualError(state: HabitualState): string | null {
  if (state.ids.length && !state.primaryId) return "Scegli la zona principale tra quelle rimaste";
  if (state.primaryId && !state.ids.includes(state.primaryId)) return "La zona principale deve essere tra le zone abituali";
  return null;
}

export type HabitualMap = Map<string, HabitualState>;
/** null = tutte; "none" = senza zona abituale; altrimenti id zona. */
export type HabitualFilter = string | null;
export const NO_HABITUAL = "none";

export function buildHabitualMap(rows: { product_id: string; location_id: string; is_primary: boolean }[]): HabitualMap {
  const map: HabitualMap = new Map();
  for (const r of rows) {
    const s = map.get(r.product_id) ?? { ids: [], primaryId: null };
    s.ids.push(r.location_id);
    if (r.is_primary) s.primaryId = r.location_id;
    map.set(r.product_id, s);
  }
  return map;
}

/** Filtro organizzativo: agisce solo sulla vista, mai sulle card della sessione o sulla chiusura. */
export function matchesHabitual(productId: string, map: HabitualMap, filter: HabitualFilter): boolean {
  if (!filter) return true;
  const ids = map.get(productId)?.ids ?? [];
  return filter === NO_HABITUAL ? ids.length === 0 : ids.includes(filter);
}

/** Con una zona di conteggio scelta: prima i prodotti che vi stanno abitualmente, poi gli altri (ordine stabile). */
export function habitualFirst<T extends { product_id: string }>(rows: T[], map: HabitualMap, locationId: string | null): T[] {
  if (!locationId) return rows;
  const inZone = (r: T) => (map.get(r.product_id)?.ids.includes(locationId) ? 0 : 1);
  return rows.map((r, i) => ({ r, i })).sort((a, b) => inZone(a.r) - inZone(b.r) || a.i - b.i).map((x) => x.r);
}
