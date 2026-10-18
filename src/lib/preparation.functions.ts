import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { preparationInput, preparationError, type PreparationBundle } from "./preparation";

export const getPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bundle, error } = await context.supabase.rpc("preparation_bundle", {
      _member_id: data.memberId,
    });
    if (error) throw new Error(preparationError(error.message));
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle))
      throw new Error("Preparazione non disponibile.");
    return bundle as unknown as PreparationBundle;
  });

export const savePreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => preparationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("manage_order_preparation", {
      _order_id: data.orderId,
      _action: data.action,
      _source_signature: data.sourceSignature,
      _version: data.version,
      _item_id: data.itemId as string,
      _line_version: data.lineVersion as number,
      _assigned_member_id: data.assignedMemberId as string,
      _quantity: data.quantity as number,
      _weight_kg: data.weightKg as number,
    });
    if (error) throw new Error(preparationError(error.message));
    return { ok: true };
  });
