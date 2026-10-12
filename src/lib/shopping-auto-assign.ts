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

export type AutoAssignOptions = { preferLinkId?: string | null; updateExisting?: boolean };

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
  const quantity = item.decided_quantity === null ? null : Number(item.decided_quantity);
  if (!quantity || quantity <= 0) return { kind: "saltato", reason: "Quantità mancante" };
  if (!item.quantity_locked_at) return { kind: "saltato", reason: "Quantità non confermata" };
  if (item.excluded_at) return { kind: "saltato", reason: "Prodotto escluso" };
  const directQuota = item.manual_purchase_quantity === null ? null : Number(item.manual_purchase_quantity);

  const [assignments, overview, units, stars, product] = await Promise.all([
    supabase
      .from("shopping_list_item_suppliers")
      .select("id, product_supplier_link_id, purchase_unit_id, purchase_unit_code, purchase_quantity")
      .eq("item_id", itemId),
    supabase.rpc("product_supplier_overview", { _product_id: item.product_id }),
    supabase.rpc("shopping_item_supplier_units", { _item_id: itemId }),
    supabase.from("company_product_supplier_favorites").select("product_supplier_link_id").eq("company_id", companyId).eq("product_id", item.product_id),
    supabase.from("products").select("stock_unit_id").eq("id", item.product_id).maybeSingle(),
  ]);
  const failure = assignments.error ?? overview.error ?? units.error ?? stars.error;
  if (failure) return { kind: "saltato", reason: failure.message };
  const rows = assignments.data ?? [];
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
    const starLinks = (stars.data ?? []).map((s) => s.product_supplier_link_id as string | null).filter((x): x is string => Boolean(x));
    const targetFor = (s: PickSupplier) => quotaFor(s, decidedUnitId, decidedCode, quantity, stockUnitId, conversions[s.linkId] ?? []);
    const pick = autoPickSupplier(suppliers, decidedUnitId, decidedCode, starLinks, {
      preferLinkId: options.preferLinkId ?? null,
      isEligible: (s) => targetFor(s) !== null,
    });
    if (pick.kind !== "pick") return pick;
    linkId = pick.linkId;
    target = targetFor(suppliers.find((s) => s.linkId === linkId)!)!;
  }
  const chosen = suppliers.find((s) => s.linkId === linkId)!;
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
