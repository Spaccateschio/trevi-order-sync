import { supabase } from "@/integrations/supabase/client";
import {
  autoPickSupplier,
  createItemGuard,
  quotaSaveError,
  planQuotaUpdate,
  quotaFor,
  type PickSupplier,
  type QuotaAssignment,
  type ValidConversion,
} from "@/lib/supplier-selection";
import {
  deselectedFor,
  pickMemory,
  planFromMemory,
  planRescale,
  type HistoryEntry,
  type MemoryDestination,
  type SupplierMemory,
} from "@/lib/supplier-memory";

/**
 * Proposta automatica del fornitore per UNA riga della Lista, usata da «Conferma», dalla stella,
 * dalla conferma di massa e dall'aggiunta dal Catalogo B2B. Scrive solo con assign_shopping_list_supplier
 * (upsert per fornitore+U.M.: ripetere non crea doppioni).
 * - Riga senza quote: sceglie l'unico idoneo / l'unico preferito / il fornitore del Catalogo appena usato.
 * - Riga con un solo fornitore (e `updateExisting`): la sua quota segue «Da acquistare» se l'U.M. è la
 *   stessa o esiste una conversione valida; mai su quote già in ordine, mai con acquisto diretto o più fornitori.
 */

export type AutoAssignResult =
  | { kind: "assegnato"; supplierName: string }
  | { kind: "aggiornato"; supplierName: string }
  | { kind: "da_scegliere"; reason: string }
  | { kind: "senza_fornitore" }
  | { kind: "gia_ripartito" }
  | { kind: "verifica"; reason: string }
  | { kind: "saltato"; reason: string };

type AssignFn = (args: {
  data: {
    companyId: string;
    itemId: string;
    action: "set";
    linkId: string;
    assignedQuantity: null;
    purchaseQuantity: number;
    minWarningAccepted: boolean;
    notes: null;
    purchaseUnitId: string | null;
    assignmentId: string | null;
    manualUnitCode: string | null;
  };
}) => Promise<unknown>;

type OverviewRead = { link_id: string; supplier_name: string; is_active: boolean; is_preferred: boolean | null };
type UnitsRead = {
  link_id: string;
  is_b2b: boolean;
  source_linked: boolean;
  allow_manual: boolean;
  purchasable: boolean;
  units: { unit_id: string; code: string }[];
};

type DirectFn = (args: {
  data: { companyId: string; itemId: string; quantity: number | null; unitId: string | null; unitCode: string | null };
}) => Promise<unknown>;

export type AutoAssignOptions = {
  /** Fornitore del Catalogo B2B scelto all'aggiunta: precede la memoria. */
  preferLinkId?: string | null;
  /** Spunta manuale: si assegna solo a questo fornitore (stessa U.M. o conversione valida). */
  onlyLinkId?: string | null;
  updateExisting?: boolean;
  /** Quantità prima della modifica: serve a capire se le quote multiple sono ancora automatiche. */
  previousQuantity?: number | null;
  /** Scrittura della quota «Acquisto diretto» (memoria): senza, la memoria con acquisto diretto si limita a proporre. */
  direct?: DirectFn;
  /**
   * Solo calcolo: le quote vengono raccolte qui invece di essere scritte (le scrive poi
   * commit_shopping_list_item_quantity nella stessa transazione della quantità).
   */
  collect?: PlannedWrite[];
  /** Quantità/U.M. ancora da salvare (con `collect`): il calcolo usa questi valori. */
  quantity?: number;
  unitId?: string | null;
  unitCode?: string | null;
};

export type PlannedWrite =
  | { kind: "fornitore"; linkId: string; assignmentId: string | null; purchaseQuantity: number; purchaseUnitId: string | null; manualUnitCode: string | null }
  | { kind: "diretto"; quantity: number; unitId: string | null; unitCode: string | null };

/**
 * Memoria per prodotto: ultima Lista CHIUSA della stessa azienda (RLS + filtro company_id) con quote reali.
 * Si leggono solo destinazioni, U.M. e quantità storiche per le proporzioni: le quantità non vengono copiate.
 */
export async function readMemories(companyId: string, productIds: string[]): Promise<Map<string, SupplierMemory>> {
  const out = new Map<string, SupplierMemory>();
  const ids = [...new Set(productIds)];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data: items, error } = await supabase
      .from("shopping_list_items")
      .select("id, product_id, list_id, excluded_at, manual_purchase_quantity, manual_purchase_unit_id, manual_purchase_unit_code, shopping_lists!inner(status, closed_at, company_id)")
      .eq("company_id", companyId)
      .eq("shopping_lists.company_id", companyId)
      .eq("shopping_lists.status", "chiusa")
      .in("product_id", chunk);
    if (error || !items?.length) continue;
    const itemIds = items.map((x) => x.id as string);
    const supRows: { item_id: string; product_supplier_link_id: string; purchase_unit_id: string | null; purchase_unit_code: string | null; purchase_quantity: number | null; assigned_quantity: number | null }[] = [];
    for (let j = 0; j < itemIds.length; j += 200) {
      const { data } = await supabase
        .from("shopping_list_item_suppliers")
        .select("item_id, product_supplier_link_id, purchase_unit_id, purchase_unit_code, purchase_quantity, assigned_quantity")
        .eq("company_id", companyId)
        .is("deselected_at", null)
        .in("item_id", itemIds.slice(j, j + 200));
      supRows.push(...((data ?? []) as typeof supRows));
    }
    const byProduct = new Map<string, HistoryEntry[]>();
    for (const it of items) {
      if (it.excluded_at) continue;
      const list = it.shopping_lists as unknown as { closed_at: string | null };
      const dests: MemoryDestination[] = supRows
        .filter((r) => r.item_id === it.id)
        .map((r) => ({
          kind: "fornitore" as const,
          linkId: r.product_supplier_link_id,
          unitId: r.purchase_unit_id,
          unitCode: r.purchase_unit_code,
          quantity: r.purchase_quantity === null ? null : Number(r.purchase_quantity),
          stockEquivalent: r.assigned_quantity === null ? null : Number(r.assigned_quantity),
        }));
      if (it.manual_purchase_quantity !== null && Number(it.manual_purchase_quantity) > 0) {
        dests.push({
          kind: "diretto",
          unitId: (it.manual_purchase_unit_id as string | null) ?? null,
          unitCode: (it.manual_purchase_unit_code as string | null) ?? null,
          quantity: Number(it.manual_purchase_quantity),
        });
      }
      const arr = byProduct.get(it.product_id as string) ?? [];
      arr.push({ listId: it.list_id as string, closedAt: list?.closed_at ?? "", destinations: dests });
      byProduct.set(it.product_id as string, arr);
    }
    for (const [pid, hist] of byProduct) {
      const m = pickMemory(hist);
      if (m) out.set(pid, m);
    }
  }
  return out;
}

/** Richieste in corso per riga: doppio clic o chiamate ripetute non producono una seconda scrittura. */
const once = createItemGuard();

/** Conversioni valide solo da effective_supplier_conversion (mai il vecchio conversion_factor). */
async function readConversions(linkIds: string[]): Promise<Record<string, ValidConversion[]>> {
  const out: Record<string, ValidConversion[]> = {};
  if (!linkIds.length) return out;
  const { data, error } = await supabase
    .from("product_supplier_link_units")
    .select("id, link_id, unit_id")
    .in("link_id", linkIds)
    .eq("is_active", true);
  if (error || !data) return out;
  for (const lu of data) {
    if (!lu.unit_id) continue;
    const { data: conv } = await supabase.rpc("effective_supplier_conversion", { _link_unit_id: lu.id as string });
    const row = (conv as unknown as { is_valid: boolean; stock_conversion_factor: number | null }[] | null)?.[0];
    if (row?.is_valid && row.stock_conversion_factor && Number(row.stock_conversion_factor) > 0) {
      (out[lu.link_id as string] ??= []).push({ unitId: lu.unit_id as string, factor: Number(row.stock_conversion_factor) });
    }
  }
  return out;
}

export async function autoAssignItem(
  assign: AssignFn,
  companyId: string,
  itemId: string,
  options: AutoAssignOptions = {},
): Promise<AutoAssignResult> {
  return once<AutoAssignResult>(itemId, { kind: "gia_ripartito" }, () => run(assign, companyId, itemId, options));
}

async function run(assign: AssignFn, companyId: string, itemId: string, options: AutoAssignOptions): Promise<AutoAssignResult> {
  const updateExisting = options.updateExisting ?? true;
  const { data: item, error } = await supabase
    .from("shopping_list_items")
    .select("id, product_id, decided_quantity, decided_unit_id, decided_unit_code, unit_code, manual_purchase_quantity, quantity_locked_at, excluded_at")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !item) return { kind: "saltato", reason: error?.message ?? "Riga non trovata" };
  const planning = Boolean(options.collect);
  const quantity = planning && options.quantity !== undefined ? options.quantity : item.decided_quantity === null ? null : Number(item.decided_quantity);
  if (!quantity || quantity <= 0) return { kind: "saltato", reason: "Quantità mancante" };
  if (!planning && !item.quantity_locked_at) return { kind: "saltato", reason: "Quantità non confermata" };
  if (planning && options.unitId !== undefined) item.decided_unit_id = options.unitId;
  if (planning && options.unitCode !== undefined) item.decided_unit_code = options.unitCode;
  if (item.excluded_at) return { kind: "saltato", reason: "Prodotto escluso" };
  const directQuota = item.manual_purchase_quantity === null ? null : Number(item.manual_purchase_quantity);

  const [assignments, overview, units, stars, product] = await Promise.all([
    supabase
      .from("shopping_list_item_suppliers")
      .select("id, product_supplier_link_id, purchase_unit_id, purchase_unit_code, purchase_quantity, deselected_at")
      .eq("item_id", itemId),
    supabase.rpc("product_supplier_overview", { _product_id: item.product_id }),
    supabase.rpc("shopping_item_supplier_units", { _item_id: itemId }),
    supabase.from("company_product_supplier_favorites").select("product_supplier_link_id").eq("company_id", companyId).eq("product_id", item.product_id),
    supabase.from("products").select("stock_unit_id").eq("id", item.product_id).maybeSingle(),
  ]);
  const failure = assignments.error ?? overview.error ?? units.error ?? stars.error;
  if (failure) return { kind: "saltato", reason: failure.message };
  // Quote tolte volontariamente (salvate nel database): non contano e non vengono mai riproposte.
  const allRows = assignments.data ?? [];
  const rows = allRows.filter((r) => !r.deselected_at);
  const dbDeselected = allRows.filter((r) => r.deselected_at).map((r) => r.product_supplier_link_id as string);
  if (rows.length && !updateExisting) return { kind: "gia_ripartito" };
  if (!rows.length && directQuota !== null) return { kind: "gia_ripartito" };

  const unitsByLink = new Map(((units.data ?? []) as unknown as UnitsRead[]).map((u) => [u.link_id, u]));
  const active = ((overview.data ?? []) as unknown as OverviewRead[]).filter((s) => s.is_active);
  const suppliers: (PickSupplier & { name: string })[] = active.map((s) => {
    const u = unitsByLink.get(s.link_id);
    return {
      linkId: s.link_id,
      name: s.supplier_name,
      isB2B: Boolean(u?.is_b2b),
      sourceLinked: Boolean(u?.source_linked),
      purchasable: u ? u.purchasable !== false : false,
      allowManual: Boolean(u?.allow_manual),
      units: (u?.units ?? []).map((x) => ({ unitId: x.unit_id, code: x.code })),
      isPreferred: Boolean(s.is_preferred),
    };
  });
  const decidedUnitId = (item.decided_unit_id as string | null) ?? null;
  const decidedCode = ((item.decided_unit_code as string | null) ?? (decidedUnitId ? "" : (item.unit_code as string | null))) ?? "";
  const stockUnitId = (product.data?.stock_unit_id as string | null | undefined) ?? null;
  // Le conversioni servono solo se «Da acquistare» è nell'U.M. di magazzino (fornitori non B2B).
  const conversions =
    stockUnitId && decidedUnitId === stockUnitId ? await readConversions(suppliers.filter((s) => !s.isB2B).map((s) => s.linkId)) : {};

  let inOrder = new Set<string>();
  if (rows.length) {
    const { data: orderRows, error: orderError } = await supabase
      .from("purchase_order_items")
      .select("source_assignment_id")
      .in("source_assignment_id", rows.map((r) => r.id as string));
    if (orderError) return { kind: "saltato", reason: orderError.message };
    inOrder = new Set((orderRows ?? []).map((r) => r.source_assignment_id as string));
  }
  const quotaRows: QuotaAssignment[] = rows.map((r) => ({
    id: r.id as string,
    linkId: r.product_supplier_link_id as string,
    purchaseUnitId: (r.purchase_unit_id as string | null) ?? null,
    purchaseUnitCode: (r.purchase_unit_code as string | null) ?? null,
    purchaseQuantity: r.purchase_quantity === null ? null : Number(r.purchase_quantity),
    inOrder: inOrder.has(r.id as string),
  }));

  const deselected = new Set([...deselectedFor(itemId), ...dbDeselected]);
  const memory = options.onlyLinkId || options.preferLinkId ? null : ((await readMemories(companyId, [item.product_id as string])).get(item.product_id as string) ?? null);
  const memCtx = { suppliers, deselected, decidedUnitId, decidedCode, quantity, stockUnitId, conversions };
  const writeAll = async (writes: ({ kind: "fornitore"; linkId: string; assignmentId: string | null; target: { unitId: string | null; manual: string | null; quantity: number } } | { kind: "diretto"; quantity: number; unitId: string | null; unitCode: string | null })[]) => {
    for (const w of writes) {
      if (options.collect) {
        options.collect.push(
          w.kind === "diretto"
            ? w
            : { kind: "fornitore", linkId: w.linkId, assignmentId: w.assignmentId, purchaseQuantity: w.target.quantity, purchaseUnitId: w.target.unitId, manualUnitCode: w.target.manual },
        );
        continue;
      }
      if (w.kind === "diretto") {
        if (!options.direct) throw new Error("Acquisto diretto da inserire a mano");
        await options.direct({ data: { companyId, itemId, quantity: w.quantity, unitId: w.unitId, unitCode: w.unitCode } });
      } else {
        await assign({
          data: { companyId, itemId, action: "set", linkId: w.linkId, assignedQuantity: null, purchaseQuantity: w.target.quantity, minWarningAccepted: true, notes: null, purchaseUnitId: w.target.unitId, assignmentId: w.assignmentId, manualUnitCode: w.target.manual },
        });
      }
    }
  };

  // Più destinazioni: ricalcolo solo se le quote sono ancora quelle automatiche sulla quantità precedente.
  if (rows.length + (directQuota !== null && rows.length ? 1 : 0) > 1 && options.previousQuantity) {
    const memAll = memory ?? (await readMemories(companyId, [item.product_id as string])).get(item.product_id as string) ?? null;
    const writes = planRescale({ rows: quotaRows, directQuota, previousQuantity: options.previousQuantity, memory: memAll, ctx: memCtx });
    if (writes) {
      try {
        await writeAll(writes);
      } catch (e) {
        return { kind: "saltato", reason: quotaSaveError("la ripartizione", (e as Error).message) };
      }
      return { kind: "aggiornato", supplierName: "le destinazioni" };
    }
  }

  const plan = planQuotaUpdate({ assignments: quotaRows, directQuota, suppliers, decidedUnitId, decidedCode, quantity, stockUnitId, conversions });
  if (plan.kind === "invariato") return { kind: "gia_ripartito" };
  if (plan.kind === "verifica") return { kind: "verifica", reason: plan.reason };

  let linkId: string;
  let assignmentId: string | null = null;
  let target: { unitId: string | null; manual: string | null; quantity: number };
  if (plan.kind === "set") {
    linkId = plan.linkId;
    assignmentId = plan.assignmentId;
    target = plan.target;
  } else {
    // Memoria (solo senza scelta esplicita dal Catalogo B2B e senza spunta manuale).
    if (memory) {
      const mp = planFromMemory(memory, memCtx);
      if (mp.kind === "scrivi" && (options.direct || mp.writes.every((w) => w.kind === "fornitore"))) {
        try {
          await writeAll(mp.writes.map((w) => (w.kind === "fornitore" ? { ...w, assignmentId: null } : w)));
        } catch (e) {
          return { kind: "saltato", reason: quotaSaveError("la ripartizione", (e as Error).message) };
        }
        const names = mp.writes.map((w) => (w.kind === "diretto" ? "acquisto diretto" : (suppliers.find((s) => s.linkId === w.linkId) as { name: string }).name));
        return { kind: "assegnato", supplierName: `${names.join(" + ")} (come l'ultima volta)` };
      }
      if (mp.kind === "proponi" || mp.kind === "scrivi") return { kind: "da_scegliere", reason: mp.kind === "proponi" ? mp.reason : "Acquisto diretto da inserire a mano" };
    }
    const starLinks = (stars.data ?? []).map((s) => s.product_supplier_link_id as string | null).filter((x): x is string => Boolean(x));
    const targetFor = (s: PickSupplier) => quotaFor(s, decidedUnitId, decidedCode, quantity, stockUnitId, conversions[s.linkId] ?? []);
    const pool = options.onlyLinkId ? suppliers.filter((s) => s.linkId === options.onlyLinkId) : suppliers.filter((s) => !deselected.has(s.linkId));
    if (options.onlyLinkId) {
      const only = pool[0];
      const t = only ? targetFor(only) : null;
      if (!only || !t) return { kind: "verifica", reason: "Da verificare: U.M. diverse senza conversione valida" };
      linkId = only.linkId;
      target = t;
    } else {
      const pick = autoPickSupplier(pool, decidedUnitId, decidedCode, starLinks, {
        preferLinkId: options.preferLinkId ?? null,
        isEligible: (s) => targetFor(s) !== null,
      });
      if (pick.kind !== "pick") return pick;
      linkId = pick.linkId;
      target = targetFor(suppliers.find((s) => s.linkId === linkId)!)!;
    }
  }
  const chosen = suppliers.find((s) => s.linkId === linkId)!;
  if (options.collect) {
    options.collect.push({ kind: "fornitore", linkId, assignmentId, purchaseQuantity: target.quantity, purchaseUnitId: target.unitId, manualUnitCode: target.manual });
    return plan.kind === "set" ? { kind: "aggiornato", supplierName: chosen.name } : { kind: "assegnato", supplierName: chosen.name };
  }
  try {
    await assign({
      data: {
        companyId,
        itemId,
        action: "set",
        linkId,
        assignedQuantity: null,
        purchaseQuantity: target.quantity,
        minWarningAccepted: true,
        notes: null,
        purchaseUnitId: target.unitId,
        assignmentId,
        manualUnitCode: target.manual,
      },
    });
  } catch (e) {
    return { kind: "saltato", reason: quotaSaveError(chosen.name, (e as Error).message) };
  }
  return plan.kind === "set" ? { kind: "aggiornato", supplierName: chosen.name } : { kind: "assegnato", supplierName: chosen.name };
}
