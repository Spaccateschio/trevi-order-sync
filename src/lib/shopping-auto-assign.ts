import { supabase } from "@/integrations/supabase/client";
import {
  createItemGuard,
  quotaSaveError,
  planQuotaUpdate,
  quotaFor,
  type PickSupplier,
  type QuotaAssignment,
  type ValidConversion,
} from "@/lib/supplier-selection";
import { planDirectChange } from "@/lib/direct-quota-plan";
import {
  deselectedFor,
  chooseListDestinations,
  equalSplit,
  pickMemory,
  planFromMemory,
  planRescale,
  type HistoryEntry,
  type MemoryDestination,
  type SupplierMemory,
} from "@/lib/supplier-memory";
import { linksInTime, parseLocalDate, toSchedule } from "@/lib/delivery-schedule";

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
    .select("id, product_id, list_id, decided_quantity, decided_unit_id, decided_unit_code, unit_code, manual_purchase_quantity, quantity_locked_at, excluded_at")
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

  const [assignments, overview, units, stars, product, directPref] = await Promise.all([
    supabase
      .from("shopping_list_item_suppliers")
      .select("id, product_supplier_link_id, purchase_unit_id, purchase_unit_code, purchase_quantity, deselected_at")
      .eq("item_id", itemId),
    supabase.rpc("product_supplier_overview", { _product_id: item.product_id }),
    supabase.rpc("shopping_item_supplier_units", { _item_id: itemId }),
    supabase.from("company_product_supplier_favorites").select("product_supplier_link_id").eq("company_id", companyId).eq("product_id", item.product_id),
    supabase.from("products").select("stock_unit_id").eq("id", item.product_id).maybeSingle(),
    supabase.from("product_direct_purchase_preferences").select("is_preferred").eq("company_id", companyId).eq("product_id", item.product_id).maybeSingle(),
  ]);
  const failure = assignments.error ?? overview.error ?? units.error ?? stars.error ?? directPref.error;
  const directStarred = Boolean(directPref.data?.is_preferred);
  if (failure) return { kind: "saltato", reason: failure.message };
  // Quote tolte volontariamente (salvate nel database): non contano e non vengono mai riproposte.
  const allRows = assignments.data ?? [];
  const rows = allRows.filter((r) => !r.deselected_at);
  const dbDeselected = allRows.filter((r) => r.deselected_at).map((r) => r.product_supplier_link_id as string);
  if (rows.length && !updateExisting) return { kind: "gia_ripartito" };
  if (!rows.length && directQuota !== null) return { kind: "gia_ripartito" };

  const unitsByLink = new Map(((units.data ?? []) as unknown as UnitsRead[]).map((u) => [u.link_id, u]));
  const active = ((overview.data ?? []) as unknown as OverviewRead[]).filter((s) => s.is_active);
  let suppliers: (PickSupplier & { name: string })[] = active.map((s) => {
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

  // Giorni di consegna: solo per righe ancora senza destinazioni e senza scelta esplicita.
  // Mai su quote già presenti (manuali o confermate); mai blocchi.
  // Più stelle: le destinazioni con stella restano tutte proposte (anche se in ritardo, con avviso nella card).
  const multiStar = suppliers.filter((s) => s.isPreferred).length + (directStarred ? 1 : 0) >= 2;
  if (!multiStar && !rows.length && directQuota === null && !options.onlyLinkId && !options.preferLinkId && suppliers.length) {
    const inTime = await readLinksInTime(item.list_id as string, item.product_id as string);
    if (inTime) {
      const timely = suppliers.filter((s) => inTime.has(s.linkId));
      if (!timely.length) {
        const w = { kind: "diretto" as const, quantity, unitId: decidedUnitId, unitCode: decidedCode || null };
        if (options.collect) options.collect.push(w);
        else if (options.direct) {
          try {
            await options.direct({ data: { companyId, itemId, quantity: w.quantity, unitId: w.unitId, unitCode: w.unitCode } });
          } catch (e) {
            return { kind: "saltato", reason: quotaSaveError("l'acquisto diretto", (e as Error).message) };
          }
        } else return { kind: "da_scegliere", reason: "Nessun fornitore consegna in tempo: acquisto diretto consigliato" };
        return { kind: "assegnato", supplierName: "acquisto diretto (nessun fornitore consegna in tempo)" };
      }
      suppliers = timely;
    }
  }
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
  const remembered = options.onlyLinkId || options.preferLinkId ? null : ((await readMemories(companyId, [item.product_id as string])).get(item.product_id as string) ?? null);
  let manualStarAt: string | null = null;
  if (remembered) {
    // Stella cambiata a mano DOPO l'ultima Lista chiusa: vale la nuova preferenza, non la memoria.
    const { data: manual } = await supabase
      .from("product_supplier_links")
      .select("preferred_set_at")
      .eq("product_id", item.product_id)
      .not("preferred_set_by", "is", null)
      .order("preferred_set_at", { ascending: false })
      .limit(1);
    if (manual === null) return { kind: "saltato", reason: "Preferenza fornitore non disponibile" };
    manualStarAt = (manual?.[0]?.preferred_set_at as string | null | undefined) ?? null;
  }
  const choice = chooseListDestinations({ suppliers, deselected, memory: remembered, manualStarAt,
    inventoryStarLinks: (stars.data ?? []).flatMap((s) => s.product_supplier_link_id ? [s.product_supplier_link_id as string] : []),
    preferLinkId: options.preferLinkId ?? null, directStarred });
  const memory = choice.memory;
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
      if (mp.kind === "scrivi" && (options.direct || options.collect || mp.writes.every((w) => w.kind === "fornitore"))) {
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
    if (!options.onlyLinkId && choice.reason === "da_ripartire") {
      // Più stelle: quantità divisa in parti uguali tra le destinazioni con la stella (modificabili a mano dopo).
      const starredSuppliers = choice.linkIds.map((id) => suppliers.find((s) => s.linkId === id)).filter((s): s is (typeof suppliers)[number] => Boolean(s));
      const parts = equalSplit(quantity, starredSuppliers.length + (choice.direct ? 1 : 0));
      const writes: Parameters<typeof writeAll>[0] = [];
      for (const [i, s] of starredSuppliers.entries()) {
        const t = quotaFor(s, decidedUnitId, decidedCode, parts[i] ?? 0, stockUnitId, conversions[s.linkId] ?? []);
        if (!t) return { kind: "verifica", reason: "Da verificare: U.M. diverse senza conversione valida" };
        writes.push({ kind: "fornitore", linkId: s.linkId, assignmentId: null, target: t });
      }
      if (choice.direct) {
        if (!options.direct && !options.collect) return { kind: "da_scegliere", reason: "Da ripartire: più destinazioni con la stella" };
        writes.push({ kind: "diretto", quantity: parts[parts.length - 1] ?? 0, unitId: decidedUnitId, unitCode: decidedCode || null });
      }
      try {
        await writeAll(writes);
      } catch (e) {
        return { kind: "saltato", reason: quotaSaveError("la ripartizione", (e as Error).message) };
      }
      return { kind: "assegnato", supplierName: `${[...starredSuppliers.map((s) => s.name), ...(choice.direct ? ["acquisto diretto"] : [])].join(" + ")} (parti uguali)` };
    }
    if (!options.onlyLinkId && choice.reason === "preferito" && choice.direct && !choice.linkIds.length) {
      const w = { kind: "diretto" as const, quantity, unitId: decidedUnitId, unitCode: decidedCode || null };
      if (options.collect) options.collect.push(w);
      else if (options.direct) {
        try {
          await options.direct({ data: { companyId, itemId, quantity: w.quantity, unitId: w.unitId, unitCode: w.unitCode } });
        } catch (e) {
          return { kind: "saltato", reason: quotaSaveError("l'acquisto diretto", (e as Error).message) };
        }
      } else return { kind: "da_scegliere", reason: "Acquisto diretto con la stella: inserisci la quota" };
      return { kind: "assegnato", supplierName: "acquisto diretto (stella)" };
    }
    const targetFor = (s: PickSupplier) => quotaFor(s, decidedUnitId, decidedCode, quantity, stockUnitId, conversions[s.linkId] ?? []);
    const pool = options.onlyLinkId ? suppliers.filter((s) => s.linkId === options.onlyLinkId) : suppliers.filter((s) => !deselected.has(s.linkId));
    if (options.onlyLinkId) {
      const only = pool[0];
      const t = only ? targetFor(only) : null;
      if (!only || !t) return { kind: "verifica", reason: "Da verificare: U.M. diverse senza conversione valida" };
      linkId = only.linkId;
      target = t;
    } else {
      const selected = suppliers.find((s) => choice.linkIds.includes(s.linkId));
      if (!selected) return { kind: "da_scegliere", reason: "Fornitore da scegliere" };
      const proposed = targetFor(selected);
      if (!proposed) return { kind: "verifica", reason: "Da verificare: U.M. diverse senza conversione valida" };
      linkId = selected.linkId;
      target = proposed;
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

/** Collegamenti in tempo per «Per quando serve» della Lista; null se la Lista non ha data. */
async function readLinksInTime(listId: string, productId: string): Promise<Set<string> | null> {
  const { data: list } = await supabase.from("shopping_lists").select("delivery_date").eq("id", listId).maybeSingle();
  const needed = list?.delivery_date ? parseLocalDate(list.delivery_date as string) : null;
  if (!needed) return null;
  const { data, error } = await supabase
    .from("product_supplier_links")
    .select("id, delivery_weekdays, delivery_month_day, supplier_records(lead_time_days, delivery_weekdays, delivery_month_day)")
    .eq("product_id", productId);
  if (error || !data) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return linksInTime(
    (data as unknown as { id: string; delivery_weekdays: number[] | null; delivery_month_day: number | null; supplier_records: { lead_time_days:number|null; delivery_weekdays: number[] | null; delivery_month_day: number | null } | null }[]).map((r) => ({
      linkId: r.id,
      leadDays: r.supplier_records?.lead_time_days??null,
      schedule: r.delivery_weekdays !== null ? toSchedule(r.delivery_weekdays, r.delivery_month_day) : toSchedule(r.supplier_records?.delivery_weekdays, r.supplier_records?.delivery_month_day),
    })),
    today,
    needed,
  );
}

const normCode = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();

export type DirectQuotaChangeResult =
  | { kind: "salvato" }
  | { kind: "da_sistemare"; reason: string }
  | { kind: "invariato" }
  | { kind: "saltato"; reason: string };

/**
 * Cambio della quota «Acquisto diretto» (null = togli la quota): calcola le quote fornitore da
 * riscrivere (residuo) da passare a commit_shopping_list_item_quantity in UNA transazione, insieme
 * alla quota diretta. Solo calcolo: chi chiama legge i valori attesi e chiama il commit
 * (ricontrollato dal database). Eccedenza ammessa con avviso: nessuna quota fornitore viene toccata.
 */
export async function planDirectQuotaRescale(
  companyId: string,
  itemId: string,
  directQuantity: number | null,
): Promise<{ collect: PlannedWrite[]; result: DirectQuotaChangeResult }> {
  const collect: PlannedWrite[] = [];
  const result = await once<DirectQuotaChangeResult>(
    itemId,
    { kind: "saltato", reason: "Salvataggio già in corso: riprova tra un attimo" },
    () => runDirectChange(companyId, itemId, directQuantity, collect),
  );
  return { collect, result };
}

async function runDirectChange(companyId: string, itemId: string, directQuantity: number | null, collect: PlannedWrite[]): Promise<DirectQuotaChangeResult> {
  const { data: item, error } = await supabase
    .from("shopping_list_items")
    .select("id, product_id, decided_quantity, decided_unit_id, decided_unit_code, unit_code, manual_purchase_quantity, manual_purchase_unit_id, manual_purchase_unit_code, manual_purchase_done_at")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !item) return { kind: "saltato", reason: error?.message ?? "Riga non trovata" };
  if (item.manual_purchase_done_at) return { kind: "saltato", reason: "Acquisto diretto già registrato: non modificabile" };
  const quantity = item.decided_quantity === null ? null : Number(item.decided_quantity);
  if (!quantity || quantity <= 0) return { kind: "saltato", reason: "Conferma prima la quantità da acquistare" };
  const decidedCode = ((item.decided_unit_code as string | null) ?? (item.decided_unit_id ? "" : (item.unit_code as string | null))) ?? "";
  const ruledUnitId = (item.decided_unit_id as string | null) ?? null;
  const directOldRaw = item.manual_purchase_quantity === null ? null : Number(item.manual_purchase_quantity);
  const directComparable =
    directOldRaw !== null &&
    ((item.manual_purchase_unit_id && item.manual_purchase_unit_id === ruledUnitId) ||
      (!item.manual_purchase_unit_id && normCode(item.manual_purchase_unit_code ?? "") === normCode(decidedCode)));
  const directOld = directComparable ? directOldRaw : null;
  const directNew = directQuantity ?? 0;
  if (directComparable && Math.abs(directNew - (directOld ?? 0)) < 1e-9) return { kind: "invariato" };
  if (directOldRaw === null && directQuantity === null) return { kind: "invariato" };

  // La quota diretta si salva sempre (anche in eccedenza, con avviso); le quote fornitore seguono il residuo.
  collect.push({ kind: "diretto", quantity: directNew, unitId: null, unitCode: null });

  const [assignments, overview, units, product] = await Promise.all([
    supabase.from("shopping_list_item_suppliers").select("id, product_supplier_link_id, purchase_unit_id, purchase_unit_code, purchase_quantity, deselected_at").eq("item_id", itemId),
    supabase.rpc("product_supplier_overview", { _product_id: item.product_id }),
    supabase.rpc("shopping_item_supplier_units", { _item_id: itemId }),
    supabase.from("products").select("stock_unit_id").eq("id", item.product_id).maybeSingle(),
  ]);
  const failure = assignments.error ?? overview.error ?? units.error;
  if (failure) return { kind: "saltato", reason: failure.message };
  const allRows = assignments.data ?? [];
  const rows = allRows.filter((r) => !r.deselected_at);
  if (rows.length) {
    const { data: orderRows, error: orderError } = await supabase
      .from("purchase_order_items")
      .select("source_assignment_id")
      .in("source_assignment_id", rows.map((r) => r.id as string));
    if (orderError) return { kind: "saltato", reason: orderError.message };
    if ((orderRows ?? []).length) return { kind: "da_sistemare", reason: "Quote già in un ordine o in una bozza: sistemale dalle Bozze" };
  }
  const unitsByLink = new Map(((units.data ?? []) as unknown as UnitsRead[]).map((u) => [u.link_id, u]));
  const active = ((overview.data ?? []) as unknown as OverviewRead[]).filter((s) => s.is_active);
  const suppliers = active.map((s) => {
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
  const stockUnitId = (product.data?.stock_unit_id as string | null | undefined) ?? null;
  const poolRows = rows.map((r) => ({
    id: r.id as string,
    linkId: r.product_supplier_link_id as string,
    purchaseQuantity: r.purchase_quantity === null ? null : Number(r.purchase_quantity),
    purchaseUnitId: (r.purchase_unit_id as string | null) ?? null,
    purchaseUnitCode: (r.purchase_unit_code as string | null) ?? null,
  }));
  if (!poolRows.length) return { kind: "salvato" };
  const memory = (await readMemories(companyId, [item.product_id as string])).get(item.product_id as string) ?? null;
  const conversions = stockUnitId && ruledUnitId === stockUnitId ? await readConversions(poolRows.map((r) => r.linkId)) : {};
  const plan = planDirectChange({
    quantity,
    directOld,
    directNew,
    suppliers,
    assignments: poolRows,
    decidedUnitId: ruledUnitId,
    decidedCode,
    stockUnitId,
    conversions,
    memory,
  });
  if (plan.kind === "da_sistemare") {
    if (directOldRaw !== null && !directComparable) return { kind: "da_sistemare", reason: `Acquisto diretto in U.M. diversa: ${plan.reason}` };
    return plan;
  }
  if (plan.kind !== "scritti") return { kind: "salvato" };
  for (const w of plan.writes)
    collect.push({ kind: "fornitore", linkId: w.linkId, assignmentId: w.assignmentId, purchaseQuantity: w.quantity, purchaseUnitId: w.unitId, manualUnitCode: w.manual });
  return { kind: "salvato" };
}

