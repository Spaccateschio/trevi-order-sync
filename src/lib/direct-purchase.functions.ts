import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Acquisto diretto (documento AD): ogni scrittura passa da RPC del database con context.supabase.
 * Il database verifica azienda, ruolo, U.M. attive e quote della Lista.
 */

const uuid = z.string().uuid();

export const generateDirectPurchaseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ listId: uuid, generationKey: uuid, itemIds: z.array(uuid).max(500).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("generate_direct_purchase_draft", {
      _list_id: data.listId,
      _generation_key: data.generationKey,
      ...(data.itemIds ? { _item_ids: data.itemIds } : {}),
    });
    if (error) throw new Error(error.message);
    return result as unknown as { id: string; number: string; already_exists: boolean };
  });

export const updateDirectPurchaseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        header: z.object({
          purchased_where: z.string().trim().max(200).nullable(),
          purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
          total_paid: z.number().min(0).nullable(),
          notes: z.string().trim().max(1000).nullable(),
        }),
        lines: z
          .array(
            z.object({
              line_id: uuid,
              quantity: z.number().positive().nullable(),
              unit_id: uuid.nullable(),
              unit_price: z.number().min(0).nullable(),
              price_unit_id: uuid.nullable(),
              notes: z.string().trim().max(500).nullable(),
            }),
          )
          .max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_direct_purchase_draft", {
      _id: data.id,
      _header: data.header,
      _lines: data.lines,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmDirectPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("confirm_direct_purchase", { _id: data.id });
    if (error) throw new Error(error.message);
    return result as unknown as { id: string; already_confirmed: boolean; list_closed?: boolean };
  });

export const cancelDirectPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_direct_purchase", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
