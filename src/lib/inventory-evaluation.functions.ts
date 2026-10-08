import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Decisione di acquisto su un prodotto contato: azienda, sessione e permessi li verifica il database. */
export const setInventoryPurchaseEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        productId: z.string().uuid(),
        status: z.enum(["da_valutare", "da_acquistare", "non_acquistare"]),
        quantity: z.number().positive().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_inventory_purchase_evaluation", {
      _session_id: data.sessionId,
      _product_id: data.productId,
      _status: data.status,
      ...(data.quantity !== null ? { _quantity: data.quantity } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
