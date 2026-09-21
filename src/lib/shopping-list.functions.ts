import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Le scritture della Lista della Spesa passano sempre dal server: azienda e coerenza le verifica il database. */

const listSchema = z.object({
  companyId: z.string().uuid(),
  action: z.enum(["open", "rename", "confirm", "close", "cancel"]),
  listId: z.string().uuid().nullable(),
  archiveId: z.string().uuid().nullable(),
  name: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

const itemInput = z.object({
  product_id: z.string().uuid(),
  suggested_quantity: z.number().nullable().optional(),
  decided_quantity: z.number().positive().nullable().optional(),
  origin: z.enum(["manuale", "fabbisogno"]),
  available: z.number().nullable().optional(),
  needed: z.number().nullable().optional(),
  min_stock: z.number().nullable().optional(),
  raw_need: z.number().nullable().optional(),
  order_multiple: z.number().nullable().optional(),
});

const addSchema = z.object({
  companyId: z.string().uuid(),
  listId: z.string().uuid(),
  items: z.array(itemInput).min(1).max(500),
  replaceExisting: z.boolean(),
});

const quantitySchema = z.object({
  companyId: z.string().uuid(),
  itemId: z.string().uuid(),
  decidedQuantity: z.number().positive(),
  reason: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

const assignSchema = z.object({
  companyId: z.string().uuid(),
  itemId: z.string().uuid(),
  action: z.enum(["set", "remove"]),
  linkId: z.string().uuid(),
  assignedQuantity: z.number().positive().nullable(),
  purchaseQuantity: z.number().positive().nullable(),
  minWarningAccepted: z.boolean(),
  notes: z.string().trim().max(500).nullable(),
  // U.M. con cui si acquista: facoltativa, deve essere abilitata sulla referenza.
  purchaseUnitId: z.string().uuid().nullable().optional(),
});

export const manageShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("manage_shopping_list", {
      _company_id: data.companyId,
      _action: data.action,
      _actor_user_id: context.userId,
      ...(data.listId === null ? {} : { _list_id: data.listId }),
      ...(data.archiveId === null ? {} : { _archive_id: data.archiveId }),
      ...(data.name === null ? {} : { _name: data.name }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const addShoppingListItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("add_shopping_list_items", {
      _company_id: data.companyId,
      _list_id: data.listId,
      _items: data.items,
      _replace_existing: data.replaceExisting,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return (result ?? { added: 0, skipped: 0, updated: 0 }) as {
      added: number;
      skipped: number;
      updated: number;
    };
  });

export const setShoppingListItemQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => quantitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_shopping_list_item_quantity", {
      _company_id: data.companyId,
      _item_id: data.itemId,
      _decided_quantity: data.decidedQuantity,
      _actor_user_id: context.userId,
      ...(data.reason === null ? {} : { _reason: data.reason }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeShoppingListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), itemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("remove_shopping_list_item", {
      _company_id: data.companyId,
      _item_id: data.itemId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignShoppingListSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("assign_shopping_list_supplier", {
      _company_id: data.companyId,
      _item_id: data.itemId,
      _action: data.action,
      _link_id: data.linkId,
      _min_warning_accepted: data.minWarningAccepted,
      _actor_user_id: context.userId,
      ...(data.assignedQuantity === null ? {} : { _assigned_quantity: data.assignedQuantity }),
      ...(data.purchaseQuantity === null ? {} : { _purchase_quantity: data.purchaseQuantity }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.purchaseUnitId ? { _purchase_unit_id: data.purchaseUnitId } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
