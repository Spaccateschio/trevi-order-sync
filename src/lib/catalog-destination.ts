/**
 * Scelta di destinazione sulle card «Non in lista»: solo bozza locale, scritta al Conferma
 * del Carrello tramite autoAssignItem. Regole pure, nessuna scrittura.
 */
import { equalSplit } from "@/lib/supplier-memory";

/** Destinazione speciale: «Acquisto diretto (compro io)». */
export const DIRECT_TARGET = "direct";
/** Fornitore B2B di un articolo non ancora mio: il collegamento nasce al Conferma. */
export const B2B_SOURCE_TARGET = "b2b-source";

export type DraftQuota = { target: string; quantity: string; unitCode: string | null };

export type CatalogDestination = {
  /** Collegamenti fornitore tolti dalla spunta. */
  deselectedLinks: string[];
  /** Un solo fornitore spuntato: va preferito alla scelta automatica. */
  preferLinkId: string | null;
  /** «Acquisto diretto (compro io)» spuntato (anche insieme ai fornitori). */
  direct: boolean;
  /** Nomi da mostrare nel Carrello (solo presentazione). */
  labels: string[];
  /** Con 2+ destinazioni: quantità e U.M. per ciascuna. */
  quotas?: DraftQuota[];
};

type PoolEntry = { linkId: string; name: string };

const num = (raw: string) => {
  const n = Number(raw.trim().replace(",", "."));
  return raw.trim() && Number.isFinite(n) ? n : null;
};
const norm = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Destinazione dalle spunte. Con 2+ destinazioni la quantità si divide in parti uguali
 * (nell'U.M. del totale); quote già scritte per destinazioni ancora spuntate restano.
 */
export function destinationFromToggles(
  pool: PoolEntry[],
  checked: Iterable<string>,
  direct: boolean,
  opts: { total?: number | null; unitCode?: string | null; previous?: DraftQuota[] } = {},
): CatalogDestination {
  const on = new Set(checked);
  const kept = pool.filter((s) => on.has(s.linkId));
  const targets = [...kept.map((s) => s.linkId), ...(direct ? [DIRECT_TARGET] : [])];
  const dest: CatalogDestination = {
    deselectedLinks: pool.filter((s) => !on.has(s.linkId)).map((s) => s.linkId),
    preferLinkId: !direct && kept.length === 1 ? kept[0]!.linkId : null,
    direct,
    labels: [...kept.map((s) => s.name), ...(direct ? ["Acquisto diretto"] : [])],
  };
  if (targets.length >= 2) {
    const sameSet = opts.previous && opts.previous.length === targets.length && targets.every((t) => opts.previous!.some((q) => q.target === t));
    if (sameSet) dest.quotas = targets.map((t) => opts.previous!.find((q) => q.target === t)!);
    else {
      const parts = opts.total && opts.total > 0 ? equalSplit(opts.total, targets.length) : [];
      dest.quotas = targets.map((target, i) => ({ target, quantity: parts[i] === undefined ? "" : fmt(parts[i]!), unitCode: opts.unitCode ?? null }));
    }
  }
  return dest;
}

export type QuotaCheck =
  | { kind: "ok" }
  | { kind: "incompleta" }
  | { kind: "somma_diversa"; sum: number }
  /** U.M. diverse dal totale: nessuna somma inventata, solo avviso. */
  | { kind: "da_verificare" };

/** Somma confrontata solo tra quote nella stessa U.M. del totale. */
export function checkQuotas(quotas: DraftQuota[] | undefined, total: number | null, totalUnit: string | null): QuotaCheck {
  if (!quotas?.length) return { kind: "ok" };
  const values = quotas.map((q) => num(q.quantity));
  if (values.some((v) => v === null || v <= 0) || total === null) return { kind: "incompleta" };
  if (quotas.some((q) => norm(q.unitCode) !== norm(totalUnit))) return { kind: "da_verificare" };
  const sum = (values as number[]).reduce((a, b) => a + b, 0);
  return Math.abs(sum - total) < 1e-6 ? { kind: "ok" } : { kind: "somma_diversa", sum: Math.round(sum * 1000) / 1000 };
}

/** Messaggio bloccante per il Carrello (null = si può confermare). */
export function quotaCartError(dest: CatalogDestination | undefined, total: number | null, totalUnit: string | null): string | null {
  const c = checkQuotas(dest?.quotas, total, totalUnit);
  if (c.kind === "incompleta") return "Scrivi la quantità per ogni destinazione";
  if (c.kind === "somma_diversa") return `Le quote fanno ${fmt(c.sum)}, il totale è ${fmt(total ?? 0)}`;
  return null;
}

export type ExplicitQuota = { target: string; quantity: number; unitCode: string | null };

/** Opzioni passate a autoAssignItem al Conferma. */
export function autoAssignOverrides(dest: CatalogDestination | undefined) {
  if (!dest) return {};
  const explicit = (dest.quotas ?? []).flatMap((q) => {
    const n = num(q.quantity);
    return n !== null && n > 0 ? [{ target: q.target, quantity: n, unitCode: q.unitCode }] : [];
  });
  const kept = dest.labels.length - (dest.direct ? 1 : 0);
  return {
    extraDeselected: dest.deselectedLinks,
    ...(dest.preferLinkId ? { preferLinkId: dest.preferLinkId } : {}),
    ...(dest.direct && kept === 0 ? { forceDirect: true } : {}),
    ...(explicit.length >= 2 ? { explicitQuotas: explicit } : {}),
  };
}

/** Validazione della bozza letta dal browser. */
export function parseCatalogDestination(value: unknown): CatalogDestination | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  const quotas = Array.isArray(v["quotas"])
    ? (v["quotas"] as unknown[]).flatMap((q) => {
        if (!q || typeof q !== "object") return [];
        const r = q as Record<string, unknown>;
        if (typeof r["target"] !== "string" || typeof r["quantity"] !== "string") return [];
        return [{ target: r["target"], quantity: r["quantity"], unitCode: typeof r["unitCode"] === "string" ? r["unitCode"] : null }];
      })
    : [];
  return {
    deselectedLinks: strings(v["deselectedLinks"]),
    preferLinkId: typeof v["preferLinkId"] === "string" ? v["preferLinkId"] : null,
    direct: v["direct"] === true,
    labels: strings(v["labels"]),
    ...(quotas.length ? { quotas } : {}),
  };
}
