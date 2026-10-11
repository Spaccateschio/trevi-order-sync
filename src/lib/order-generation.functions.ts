import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * «Genera ordini per fornitore»: ogni scrittura passa da RPC del database (auth.uid(), FOR UPDATE,
 * generation_key). Il browser non calcola residui, prezzi o completamento.
 */

const uuid = z.string().uuid();
const delivery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time_from: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  time_to: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  address_text: z.string().trim().max(300).nullable(),
  notes: z.string().trim().max(1000).nullable(),
});

export type GenerationLine = {
  assignment_id: string;
  item_id: string;
  code: string | null;
  name: string;
  unit_code: string | null;
  quantity: number;
  unit_cost: number | null;
  price_unit_code: string | null;
  notes: string | null;
  is_b2b: boolean;
  needs_coverage: boolean;
};
export type GenerationSupplier = { supplier_record_id: string; name: string; is_b2b: boolean; lines: GenerationLine[] };
export type GenerationPreview = {
  list_id: string;
  status: string;
  number: string | null;
  delivery: { date: string | null; time_from: string | null; time_to: string | null; address_id: string | null; address_text: string | null };
  issues: { item_id: string; code: string | null; name: string; status: string; remaining: number | null }[];
  excluded: { item_id: string; code: string | null; name: string; reason: string | null }[];
  suppliers: GenerationSupplier[];
  direct: { item_id: string; code: string | null; name: string; quantity: number; unit_code: string | null; done: boolean }[];
  drafts: { order_id: string; number: string | null; supplier_record_id: string; supplier_name: string | null; is_b2b: boolean; lines: number }[];
};

export const getGenerationPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("shopping_list_generation_preview", { _list_id: data.listId });
    if (error) throw new Error(error.message);
    return result as unknown as GenerationPreview;
  });

export const generateSupplierOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ listId: uuid, supplierRecordId: uuid, generationKey: uuid, delivery, assignmentIds: z.array(uuid).max(500).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("generate_supplier_order", {
      _list_id: data.listId,
      _supplier_record_id: data.supplierRecordId,
      _generation_key: data.generationKey,
      _delivery: data.delivery,
      ...(data.assignmentIds ? { _assignment_ids: data.assignmentIds } : {}),
    });
    if (error) throw new Error(error.message);
    return result as unknown as { order_id: string; number: string | null; already_exists: boolean };
  });

export const updateDraftOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        lines: z.array(z.object({ line_id: uuid, purchase_quantity: z.number().min(0).nullable() })).max(500),
        delivery: delivery.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_draft_order", {
      _order_id: data.orderId,
      _lines: data.lines,
      ...(data.delivery ? { _delivery: data.delivery } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const changeDraftSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: uuid, supplierRecordId: uuid, generationKey: uuid }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("change_draft_supplier", {
      _order_id: data.orderId,
      _new_supplier_record_id: data.supplierRecordId,
      _generation_key: data.generationKey,
    });
    if (error) throw new Error(error.message);
    return result as unknown as { order_id: string };
  });

export const manageListExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ listId: uuid, itemIds: z.array(uuid).min(1).max(500), action: z.enum(["exclude", "restore"]), reason: z.string().trim().max(200).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("manage_shopping_list_exclusion", {
      _list_id: data.listId,
      _item_ids: data.itemIds,
      _action: data.action,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return result as unknown as { changed: number; list_closed: boolean };
  });

export const registerDirectPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("register_direct_purchase", { _item_id: data.itemId });
    if (error) throw new Error(error.message);
    return result as unknown as { list_closed?: boolean; already_registered: boolean };
  });

export const confirmAssignmentCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: uuid, confirm: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_assignment_coverage", { _assignment_id: data.assignmentId, _confirm: data.confirm });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
