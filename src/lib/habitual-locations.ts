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
