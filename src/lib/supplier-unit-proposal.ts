/**
 * U.M. di acquisto del fornitore effettivamente usato (o preselezionato) per una riga della Lista.
 * Sola lettura e presentazione: non converte mai, non scrive nulla. Le U.M. arrivano dal database
 * (shopping_item_supplier_units: per i B2B solo quelle pubblicate dal venditore).
 */
export type ProposalUnit = { unit_id: string; code: string; is_default?: boolean | null; conversion_factor?: number | null };
export type ProposalLink = { link_id: string; purchasable?: boolean | null; units: ProposalUnit[] | null };

export type UnitProposal = {
  linkId: string;
  units: ProposalUnit[];
  defaultUnit: ProposalUnit;
  /** La U.M. attuale è venduta dal fornitore, oppure è l'U.M. del prodotto con una conversione del fornitore. */
  compatible: boolean;
};

const norm = (code: string | null | undefined) => (code ?? "").replace(/\s+/g, " ").trim().toUpperCase();

export function supplierUnitProposal(args: {
  links: ProposalLink[];
  preferredLinkIds: Set<string>;
  deselectedLinkIds: string[];
  /** Fornitori con quota attiva in questa Lista. */
  assignedLinkIds: string[];
  currentCode: string;
  productUnitCode: string;
}): UnitProposal | null {
  const usable = args.links.filter((l) => (l.units ?? []).length > 0);
  let target: ProposalLink | undefined;
  if (args.assignedLinkIds.length > 1) return null; // più fornitori: ogni quota resta nella sua U.M.
  if (args.assignedLinkIds.length === 1) {
    target = usable.find((l) => l.link_id === args.assignedLinkIds[0]);
  } else {
    const candidates = usable.filter((l) => l.purchasable !== false && !args.deselectedLinkIds.includes(l.link_id));
    if (candidates.length === 1) target = candidates[0];
    else {
      const starred = candidates.filter((l) => args.preferredLinkIds.has(l.link_id));
      if (starred.length === 1) target = starred[0];
    }
  }
  if (!target) return null;
  const units = target.units ?? [];
  const defaultUnit = units.find((u) => u.is_default) ?? units[0]!;
  const current = norm(args.currentCode);
  const compatible =
    units.some((u) => norm(u.code) === current) ||
    (current !== "" && current === norm(args.productUnitCode) && units.some((u) => u.conversion_factor !== null && u.conversion_factor !== undefined));
  return { linkId: target.link_id, units, defaultUnit, compatible };
}

/** Testo unico per card e «Genera ordini». */
export const unitsSoldText = (supplier: string, units: ProposalUnit[]) => `${supplier} vende in ${units.map((u) => u.code).join(" / ")}`;
