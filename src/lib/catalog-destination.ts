/**
 * Scelta di destinazione sulle card «Non in lista»: solo bozza locale, scritta al Conferma
 * del Carrello tramite autoAssignItem. Regole pure, nessuna scrittura.
 */
export type CatalogDestination = {
  /** Collegamenti fornitore tolti dalla spunta. */
  deselectedLinks: string[];
  /** Un solo fornitore spuntato: va preferito alla scelta automatica. */
  preferLinkId: string | null;
  /** «Acquisto diretto (compro io)»: tutta la quantità a me, nessun fornitore. */
  direct: boolean;
  /** Nomi da mostrare nel Carrello (solo presentazione). */
  labels: string[];
};

type PoolEntry = { linkId: string; name: string };

/** Destinazione dalle spunte: diretto esclude i fornitori, un solo fornitore spuntato diventa il preferito. */
export function destinationFromToggles(pool: PoolEntry[], checked: Iterable<string>, direct: boolean): CatalogDestination {
  const on = new Set(checked);
  if (direct) return { deselectedLinks: pool.map((s) => s.linkId), preferLinkId: null, direct: true, labels: ["Acquisto diretto"] };
  const kept = pool.filter((s) => on.has(s.linkId));
  return {
    deselectedLinks: pool.filter((s) => !on.has(s.linkId)).map((s) => s.linkId),
    preferLinkId: kept.length === 1 ? kept[0]!.linkId : null,
    direct: false,
    labels: kept.map((s) => s.name),
  };
}

/** Opzioni passate a autoAssignItem al Conferma. */
export function autoAssignOverrides(dest: CatalogDestination | undefined) {
  if (!dest) return {};
  return {
    extraDeselected: dest.deselectedLinks,
    ...(dest.preferLinkId ? { preferLinkId: dest.preferLinkId } : {}),
    ...(dest.direct ? { forceDirect: true } : {}),
  };
}

/** Validazione della bozza letta dal browser. */
export function parseCatalogDestination(value: unknown): CatalogDestination | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    deselectedLinks: strings(v["deselectedLinks"]),
    preferLinkId: typeof v["preferLinkId"] === "string" ? v["preferLinkId"] : null,
    direct: v["direct"] === true,
    labels: strings(v["labels"]),
  };
}
