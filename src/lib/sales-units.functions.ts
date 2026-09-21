import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const unitActionSchema = z.object({
  companyId: z.string().uuid(),
  unitId: z.string().uuid().nullable(),
  action: z.enum(["create", "update", "activate", "deactivate", "delete", "set_usage"]),
  code: z.string().trim().max(20).nullable(),
  description: z.string().trim().max(100).nullable(),
  usage: z.enum(["acquisto", "vendita", "entrambi"]).nullable().default(null),
});

const batchSchema = z.object({
  companyId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(10000),
  unitId: z.string().uuid(),
  operation: z.enum(["add", "visible", "active", "factor", "default", "remove", "conversion_type"]),
  booleanValue: z.boolean().nullable(),
  conversionFactor: z.number().positive().nullable(),
  conversionType: z.enum(["esatta", "indicativa"]).nullable().default(null),
  overwrite: z.boolean(),
});


async function assertAdmin(
  supabase: { rpc: (fn: "is_company_admin", args: { _company_id: string }) => PromiseLike<{ data: unknown }> },
  companyId: string,
) {
  const { data } = await supabase.rpc("is_company_admin", { _company_id: companyId });
  if (data !== true) throw new Error("Operazione riservata agli amministratori dell'azienda");
}

export const manageUnitOfMeasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => unitActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("manage_unit_of_measure", {
      _company_id: data.companyId,
      _unit_id: data.unitId ?? "00000000-0000-0000-0000-000000000000",
      _action: data.action,
      _actor_user_id: context.userId,
      ...(data.code === null ? {} : { _code: data.code }),
      ...(data.description === null ? {} : { _description: data.description }),
      ...(data.usage === null ? {} : { _usage: data.usage }),
    });
    if (error) throw new Error(error.message);
    return { id: result };
  });


export const applyProductSaleUnitBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => batchSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("apply_product_sale_unit_batch", {
      _company_id: data.companyId,
      _product_ids: data.productIds,
      _unit_id: data.unitId,
      _operation: data.operation,
      _overwrite: data.overwrite,
      _actor_user_id: context.userId,
      ...(data.booleanValue === null ? {} : { _boolean_value: data.booleanValue }),
      ...(data.conversionFactor === null ? {} : { _conversion_factor: data.conversionFactor }),
      ...(data.conversionType === null ? {} : { _conversion_type: data.conversionType }),
    });

    if (error) throw new Error(error.message);
    return result as { requested: number; changed: number; unchanged: number };
  });