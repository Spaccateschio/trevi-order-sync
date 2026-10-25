import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validatePurchaseSelection } from "./product-purchase-units";

export const saveProductPurchaseUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid(), unitIds: z.array(z.string().uuid()).max(200), defaultUnitId: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: product, error: productError } = await context.supabase.from("products").select("company_id").eq("id", data.productId).maybeSingle();
    if (productError || !product) throw new Error("Prodotto non disponibile");
    const { data: admin, error: adminError } = await context.supabase.rpc("is_company_admin", { _company_id: product.company_id });
    if (adminError || admin !== true) throw new Error("Solo un amministratore può salvare le U.M. di acquisto");
    const { data: units, error: unitError } = await context.supabase.from("units_of_measure").select("id, company_id, status, usage").eq("company_id", product.company_id);
    if (unitError) throw new Error(unitError.message);
    const unitIds = validatePurchaseSelection(units ?? [], product.company_id, data.unitIds, data.defaultUnitId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("save_product_purchase_units", { _product_id: data.productId, _unit_ids: unitIds, _default_unit_id: data.defaultUnitId, _actor_user_id: context.userId });
    if (error) throw new Error(error.message);
    return { saved: true };
  });