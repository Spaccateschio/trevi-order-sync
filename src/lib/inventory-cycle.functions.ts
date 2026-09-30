import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Ciclo Inventario → Lista della Spesa → Ordini: il colore e le autorizzazioni li decide il database. */

export type CycleColor = "verde" | "giallo" | "rosso";
export type CycleStatus = {
  color: CycleColor;
  open_session_id?: string;
  session_id?: string;
  session_name?: string;
  finished_at?: string | null;
  evaluated_at?: string | null;
  list_id?: string | null;
  list_name?: string | null;
  list_status?: string | null;
  list_items?: number;
  missing_orders?: number;
  cycle_outcome?: "completato" | "da_verificare" | null;
  to_verify?: number;
};

export const getInventoryCycleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("inventory_purchase_cycle_status", {
      _company_id: data.companyId,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CycleStatus;
  });

export const manageInventoryEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        sessionId: z.string().uuid(),
        action: z.enum(["take", "finish"]),
        listId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("manage_inventory_purchase_evaluation", {
      _company_id: data.companyId,
      _session_id: data.sessionId,
      _action: data.action,
      ...(data.listId ? { _list_id: data.listId } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
