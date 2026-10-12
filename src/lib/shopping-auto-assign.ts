import { supabase } from "@/integrations/supabase/client";
import { autoPickSupplier, quickUnitFor, type PickSupplier } from "@/lib/supplier-selection";

/**
 * Proposta automatica del fornitore per UNA riga della Lista, usata da «Conferma», dalla stella
 * e dalla conferma di massa. Scrive solo con assign_shopping_list_supplier (upsert per fornitore+U.M.:
 * ripetere non crea doppioni) e solo se la riga non ha ancora quote di fornitori né acquisto diretto.
 */

export type AutoAssignResult =
  | { kind: "assegnato"; supplierName: string }
  | { kind: "da_scegliere"; reason: string }
  | { kind: "senza_fornitore" }
  | { kind: "gia_ripartito" }
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
    assignmentId: null;
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

export async function autoAssignItem(assign: AssignFn, companyId: string, itemId: string): Promise<AutoAssignResult> {
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
  if (item.manual_purchase_quantity !== null) return { kind: "gia_ripartito" };

  const [assignments, overview, units, stars] = await Promise.all([
    supabase.from("shopping_list_item_suppliers").select("id").eq("item_id", itemId),
    supabase.rpc("product_supplier_overview", { _product_id: item.product_id }),
    supabase.rpc("shopping_item_supplier_units", { _item_id: itemId }),
    supabase.from("company_product_supplier_favorites").select("product_supplier_link_id").eq("company_id", companyId).eq("product_id", item.product_id),
  ]);
  const failure = assignments.error ?? overview.error ?? units.error ?? stars.error;
  if (failure) return { kind: "saltato", reason: failure.message };
  if ((assignments.data ?? []).length) return { kind: "gia_ripartito" };

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
  const starLinks = (stars.data ?? []).map((s) => s.product_supplier_link_id as string | null).filter((x): x is string => Boolean(x));
  const pick = autoPickSupplier(suppliers, decidedUnitId, decidedCode, starLinks);
  if (pick.kind !== "pick") return pick;
  const chosen = suppliers.find((s) => s.linkId === pick.linkId)!;
  const unit = quickUnitFor(chosen, decidedUnitId, decidedCode)!;
  try {
    await assign({
      data: {
        companyId,
        itemId,
        action: "set",
        linkId: chosen.linkId,
        assignedQuantity: null,
        purchaseQuantity: quantity,
        minWarningAccepted: true,
        notes: null,
        purchaseUnitId: unit.unitId,
        assignmentId: null,
        manualUnitCode: unit.manual,
      },
    });
  } catch (e) {
    return { kind: "saltato", reason: (e as Error).message };
  }
  return { kind: "assegnato", supplierName: chosen.name };
}
