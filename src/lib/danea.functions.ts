import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCompanyAdmin(
  supabase: { rpc: (fn: "is_company_admin", args: { _company_id: string }) => PromiseLike<{ data: unknown }> },
  companyId: string,
) {
  const { data } = await supabase.rpc("is_company_admin", { _company_id: companyId });
  if (data !== true) throw new Error("Operazione riservata agli amministratori dell'azienda");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Crea o rigenera il collegamento Danea dell'azienda. Il token in chiaro si vede una volta sola. */
export const createDaneaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      basicLogin?: string | undefined;
      basicPassword?: string | undefined;
    }) => {
      if (!input?.companyId) throw new Error("Azienda mancante");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, data.companyId);

    const { sha256Hex } = await import("@/lib/danea-import.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const basicLogin = data.basicLogin?.trim() || null;
    const basicPasswordHash = data.basicPassword?.trim()
      ? await sha256Hex(data.basicPassword.trim())
      : null;

    await supabaseAdmin
      .from("danea_connections")
      .update({ status: "revocato" })
      .eq("company_id", data.companyId)
      .eq("status", "attivo");

    const { data: created, error } = await supabaseAdmin
      .from("danea_connections")
      .insert({
        company_id: data.companyId,
        token_hash: tokenHash,
        token_prefix: token.slice(0, 8),
        basic_login: basicLogin,
        basic_password_hash: basicPasswordHash,
        created_by: context.userId,
      })
      .select("id, token_prefix, created_at")
      .single();

    if (error || !created) throw new Error(error?.message ?? "Creazione collegamento non riuscita");

    await supabaseAdmin.from("audit_events").insert({
      company_id: data.companyId,
      actor_user_id: context.userId,
      action: "danea_connection.created",
      entity_type: "danea_connection",
      entity_id: created.id,
    });

    return { id: created.id, token, path: `/api/public/danea/products/${token}` };
  });

export const revokeDaneaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; connectionId: string }) => {
    if (!input?.companyId || !input?.connectionId) throw new Error("Dati mancanti");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("danea_connections")
      .update({ status: "revocato" })
      .eq("id", data.connectionId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_events").insert({
      company_id: data.companyId,
      actor_user_id: context.userId,
      action: "danea_connection.revoked",
      entity_type: "danea_connection",
      entity_id: data.connectionId,
    });

    return { ok: true };
  });
