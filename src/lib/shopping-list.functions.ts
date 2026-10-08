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
  origin: z.enum(["manuale", "fabbisogno", "inventario"]),
  // U.M. della quantità decisa scelta all'aggiunta: entrambe assenti = U.M. del prodotto.
  decided_unit_id: z.string().uuid().nullable().optional(),
  decided_unit_code: z.string().trim().max(20).nullable().optional(),
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
  decidedQuantity: z.number().positive().nullable(),
  reason: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(500).nullable(),
  // U.M. scelta in «Da acquistare»: entrambe null = U.M. del prodotto.
  decidedUnitId: z.string().uuid().nullable().optional(),
  decidedUnitCode: z.string().trim().max(20).nullable().optional(),
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
  // Ripartizione da aggiornare/rimuovere (più U.M. dello stesso fornitore).
  assignmentId: z.string().uuid().nullable().optional(),
  // «Altra U.M.» scritta a mano (solo fornitori non B2B): salvata solo nella ripartizione.
  manualUnitCode: z.string().trim().max(20).nullable().optional(),
});

export const manageShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("manage_shopping_list", {
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
    const { data: result, error } = await context.supabase.rpc("add_shopping_list_items", {
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
    const { error } = await context.supabase.rpc("set_shopping_list_item_quantity", {
      _company_id: data.companyId,
      _item_id: data.itemId,
      _decided_quantity: data.decidedQuantity as number,
      _actor_user_id: context.userId,
      ...(data.reason === null ? {} : { _reason: data.reason }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.decidedUnitId ? { _decided_unit_id: data.decidedUnitId } : {}),
      ...(data.decidedUnitCode ? { _decided_unit_code: data.decidedUnitCode } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Conferma (blocca) o sblocca la quantità da acquistare di una riga. Autorizzazione nel DB tramite auth.uid(). */
export const setShoppingListItemQuantityLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ itemId: z.string().uuid(), locked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_shopping_list_item_quantity_lock", {
      _item_id: data.itemId,
      _locked: data.locked,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Conferma atomica di un prodotto «Da valutare»: Lista (se serve) + inserimento + quantità + blocco in una sola transazione. */
export const confirmShoppingListProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        listId: z.string().uuid().nullable(),
        sessionId: z.string().uuid().nullable(),
        archiveId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("confirm_shopping_list_product", {
      _company_id: data.companyId,
      _product_id: data.productId,
      _quantity: data.quantity,
      ...(data.listId ? { _list_id: data.listId } : {}),
      ...(data.sessionId ? { _session_id: data.sessionId } : {}),
      ...(data.archiveId ? { _archive_id: data.archiveId } : {}),
    });
    if (error) throw new Error(error.message);
    return result as { list_id: string; item_id: string };
  });

export const removeShoppingListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), itemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_shopping_list_item", {
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
    const { error } = await context.supabase.rpc("assign_shopping_list_supplier", {
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
      ...(data.assignmentId ? { _assignment_id: data.assignmentId } : {}),
      ...(data.manualUnitCode ? { _manual_unit_code: data.manualUnitCode } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Quota «Acquisto diretto» esplicita della riga (solo Lista aperta). quantity null/0 = rimuove. */
export const setShoppingListDirectQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        itemId: z.string().uuid(),
        quantity: z.number().min(0).nullable(),
        unitId: z.string().uuid().nullable(),
        unitCode: z.string().trim().max(20).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("set_shopping_list_direct_quota", {
      _company_id: data.companyId,
      _item_id: data.itemId,
      _quantity: data.quantity ?? 0,
      ...(data.unitId ? { _unit_id: data.unitId } : {}),
      ...(data.unitCode ? { _unit_code: data.unitCode } : {}),
    });
    if (error) throw new Error(error.message);
    return result as unknown as { item_id: string; status: string; remaining: number | null };
  });

export type ClosePreview = {
  list_id: string;
  status: string;
  number: string | null;
  items_total: number;
  ordered_products: number;
  missing: { item_id: string; name: string; code: string | null }[];
  unassigned: { item_id: string; name: string; code: string | null }[];
  partial: { item_id: string; name: string; code: string | null; remaining: number | null }[];
  direct: { item_id: string; name: string; code: string | null; quantity: number; unit_code: string | null; origin: "esplicito" }[];
  uncertain: { item_id: string; name: string; code: string | null; reason: string }[];
  orders: { supplier_record_id: string; name: string; lines: number }[];
  default_address: { id: string; text: string } | null;
};

/** Anteprima della chiusura: stesse regole della chiusura definitiva (calcolate nel database). */
export const getShoppingListClosePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("shopping_list_close_preview", { _list_id: data.listId });
    if (error) throw new Error(error.message);
    return result as unknown as ClosePreview;
  });

const deliverySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time_from: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  time_to: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  address_id: z.string().uuid().nullable(),
  address_text: z.string().trim().max(300).nullable(),
});

/** Chiusura definitiva e atomica: numero LS, fotografia, acquisti diretti e ordini per fornitore. */
export const closeShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        listId: z.string().uuid(),
        delivery: deliverySchema,
        generalNotes: z.string().trim().max(1000).nullable(),
        supplierOverrides: z
          .array(
            deliverySchema.omit({ address_id: true }).extend({
              supplier_record_id: z.string().uuid(),
              notes: z.string().trim().max(1000).nullable(),
            }),
          )
          .max(200),
        directNotes: z.array(z.object({ item_id: z.string().uuid(), notes: z.string().trim().max(300) })).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("close_shopping_list", {
      _company_id: data.companyId,
      _list_id: data.listId,
      _delivery: data.delivery,
      ...(data.generalNotes ? { _general_notes: data.generalNotes } : {}),
      _supplier_overrides: data.supplierOverrides,
      _direct_notes: data.directNotes,
    });
    if (error) throw new Error(error.message);
    return result as unknown as { list_id: string; number: string; already_closed: boolean; order_ids: string[] };
  });

const dateSchema = z.object({
  companyId: z.string().uuid(),
  listId: z.string().uuid(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/** Data per cui serve la singola Lista: scrive solo shopping_lists.delivery_date, mai le preferenze aziendali. */
export const setShoppingListDeliveryDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_shopping_list_delivery_date", {
      _company_id: data.companyId,
      _list_id: data.listId,
      _delivery_date: data.deliveryDate as string,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
