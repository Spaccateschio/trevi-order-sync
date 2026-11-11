/**
 * U.M. predefinita della card di inventario.
 *
 * La scelta fatta nella sessione vince sempre; se il prodotto ha U.M. abituali
 * impostate nella scheda, la prima inserita è automaticamente la preferita;
 * seguono l'U.M. dell'ultimo conteggio e, per ultima, l'U.M. di magazzino.
 */
export function inventoryDefaultUnitId(input: {
  chosenId?: string | null | undefined;
  preferredId?: string | null | undefined;
  lastCountedId?: string | null | undefined;
  stockUnitId?: string | null | undefined;
}): string | null {
  return input.chosenId ?? input.preferredId ?? input.lastCountedId ?? input.stockUnitId ?? null;
}

/** Unica risoluzione per il selettore e tutte le scritture della card. */
export function inventoryCardUnit(input: {
  options: readonly { id: string; code: string }[];
  chosenId?: string | null | undefined;
  preferredId?: string | null | undefined;
  lastCountedCode?: string | null | undefined;
  stockCode?: string | null | undefined;
}): { id: string | null; code: string | null } {
  const byCode = (code: string | null | undefined) => input.options.find(
    (option) => option.code.trim().toLowerCase() === code?.trim().toLowerCase(),
  );
  const id = inventoryDefaultUnitId({
    chosenId: input.options.find((option) => option.id === input.chosenId)?.id,
    preferredId: input.options.find((option) => option.id === input.preferredId)?.id,
    lastCountedId: byCode(input.lastCountedCode)?.id,
    stockUnitId: byCode(input.stockCode)?.id,
  });
  const option = input.options.find((unit) => unit.id === id);
  return { id, code: option?.code ?? (input.stockCode?.trim() || null) };
}
