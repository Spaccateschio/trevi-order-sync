/**
 * U.M. predefinita della card di inventario.
 *
 * La scelta fatta nella sessione vince sempre; se il prodotto ha U.M. abituali
 * impostate nella scheda, la prima inserita è automaticamente la preferita;
 * seguono l'U.M. dell'ultimo conteggio e, per ultima, l'U.M. di magazzino.
 */
export function inventoryDefaultUnitId(input: {
  chosenId?: string | null;
  preferredId?: string | null;
  lastCountedId?: string | null;
  stockUnitId?: string | null;
}): string | null {
  return input.chosenId ?? input.preferredId ?? input.lastCountedId ?? input.stockUnitId ?? null;
}
