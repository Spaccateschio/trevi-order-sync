/**
 * Matita di «Genera ordini»: decide cosa serve prima di salvare una nuova quantità/U.M. di una quota.
 * Regola pura: non converte mai, non scrive nulla.
 */
export type EditUnit = { unit_id: string; code: string; conversion_factor?: number | null };

export type LineEditPlan =
  | { kind: "invalid"; reason: string }
  | { kind: "unchanged" }
  | {
      kind: "save";
      /** Cambio di U.M. verso una U.M. senza conversione: serve la conferma esplicita dell'utente. */
      needsUnitWarning: boolean;
      /** Una conferma di quantità già data va tolta prima: la nuova quantità/U.M. va riconfermata. */
      revokeFirst: boolean;
      fromCode: string;
      toCode: string;
    };

export function planLineEdit(args: {
  currentQuantity: number;
  currentUnitId: string | null;
  currentCode: string;
  nextQuantityText: string;
  nextUnitId: string | null;
  units: EditUnit[];
  coverageConfirmed: boolean;
  inOrder: boolean;
}): LineEditPlan {
  if (args.inOrder) return { kind: "invalid", reason: "Questa quota è già in un ordine: gestiscila dalle Bozze." };
  const q = Number(args.nextQuantityText.replace(",", "."));
  if (!Number.isFinite(q) || q <= 0) return { kind: "invalid", reason: "Quantità non valida" };
  const unit = args.units.find((u) => u.unit_id === args.nextUnitId);
  if (!unit) return { kind: "invalid", reason: "Scegli un'U.M. venduta dal fornitore" };
  const unitChanged = unit.unit_id !== args.currentUnitId;
  if (!unitChanged && q === args.currentQuantity) return { kind: "unchanged" };
  const noConversion = unit.conversion_factor === null || unit.conversion_factor === undefined || unit.conversion_factor <= 0;
  return {
    kind: "save",
    needsUnitWarning: unitChanged && noConversion,
    revokeFirst: args.coverageConfirmed,
    fromCode: args.currentCode,
    toCode: unit.code,
  };
}
