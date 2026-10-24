/**
 * Pianificazione dell'impostazione rapida delle U.M. di acquisto: funzioni pure.
 * L'applicazione tocca solo le referenze manuali attive (mai B2B: le loro U.M.
 * arrivano dal catalogo pubblicato del venditore) e aggiunge/converte/preferisce,
 * senza mai rimuovere U.M. esistenti.
 */

export type QuickApplyConversion = { factor: number; type: "esatta" | "indicativa" };

/** Minimo di referenza fornitore necessario per pianificare. */
export type ManualPurchaseLink = {
  link_id: string;
  is_active: boolean;
  b2b_relation_status: string | null;
  purchase_units: { unit_id: string; is_active: boolean; is_default: boolean }[];
};

export type PlannedUnitOp = {
  linkId: string;
  unitId: string;
  action: "add" | "set_conversion" | "set_default";
  conversionFactor: number | null;
  conversionType: "esatta" | "indicativa" | null;
};

/** Referenze che l'applicazione rapida può toccare: attive e non collegate a un catalogo B2B. */
export function manualLinksForPurchaseUnits(links: ManualPurchaseLink[]): ManualPurchaseLink[] {
  return links.filter((link) => link.is_active && link.b2b_relation_status !== "attivo");
}

/**
 * Operazioni da eseguire, in ordine per referenza: aggiunta (se manca),
 * conversione (se indicata e valida), predefinita (se diversa da quella attuale).
 */
export function planPurchaseUnitApply(
  links: ManualPurchaseLink[],
  selectedUnitIds: string[],
  defaultUnitId: string | null,
  conversions: Record<string, QuickApplyConversion | undefined>,
): PlannedUnitOp[] {
  const ops: PlannedUnitOp[] = [];
  for (const link of manualLinksForPurchaseUnits(links)) {
    const present = new Set(link.purchase_units.map((unit) => unit.unit_id));
    const activeDefault = link.purchase_units.find((unit) => unit.is_active && unit.is_default)?.unit_id ?? null;
    for (const unitId of selectedUnitIds) {
      if (!present.has(unitId)) {
        ops.push({ linkId: link.link_id, unitId, action: "add", conversionFactor: null, conversionType: null });
      }
      const conversion = conversions[unitId];
      if (conversion && Number.isFinite(conversion.factor) && conversion.factor > 0) {
        ops.push({ linkId: link.link_id, unitId, action: "set_conversion", conversionFactor: conversion.factor, conversionType: conversion.type });
      }
      if (defaultUnitId === unitId && activeDefault !== unitId) {
        ops.push({ linkId: link.link_id, unitId, action: "set_default", conversionFactor: null, conversionType: null });
      }
    }
  }
  return ops;
}
