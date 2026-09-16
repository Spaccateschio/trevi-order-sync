import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCompanyAdmin(
  supabase: {
    rpc: (fn: "is_company_admin", args: { _company_id: string }) => PromiseLike<{ data: unknown }>;
  },
  companyId: string,
) {
  const { data } = await supabase.rpc("is_company_admin", { _company_id: companyId });
  if (data !== true) throw new Error("Operazione riservata agli amministratori dell'azienda");
}

/**
 * Crea una postazione Danea: il server genera utente e password.
 * L'indirizzo pubblico NON cambia mai. La password è restituita una sola volta
 * e conservata soltanto come impronta con sale.
 */
export const createDaneaStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; name: string }) => {
    if (!input?.companyId) throw new Error("Azienda mancante");
    const name = input.name?.trim();
    if (!name) throw new Error("Indica un nome per la postazione (es. PC Ufficio)");
    if (name.length > 60) throw new Error("Nome postazione troppo lungo");
    return { companyId: input.companyId, name };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, data.companyId);

    const { generatePassword, hashPassword, randomHex, slugForUsername } = await import(
      "@/lib/danea-auth.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("legal_name")
      .eq("id", data.companyId)
      .maybeSingle();

    const base = slugForUsername(company?.legal_name ?? "trevi");
    const password = generatePassword();
    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);

    let created: { id: string; username: string } | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const username = `${base}-${randomHex(3)}`;
      const { data: row, error } = await supabaseAdmin
        .from("danea_stations")
        .insert({
          company_id: data.companyId,
          name: data.name,
          username,
          password_hash: passwordHash,
          password_salt: salt,
          created_by: context.userId,
        })
        .select("id, username")
        .maybeSingle();

      if (row) created = row;
      // 23505 = utente già esistente: riprovo con un suffisso diverso.
      else if (error && error.code !== "23505") lastError = error.message;
      else if (error) lastError = error.message;
      if (error && error.code !== "23505") break;
    }

    if (!created) throw new Error(lastError ?? "Creazione postazione non riuscita");

    await supabaseAdmin.from("audit_events").insert({
      company_id: data.companyId,
      actor_user_id: context.userId,
      action: "danea_station.created",
      entity_type: "danea_station",
      entity_id: created.id,
      detail: { name: data.name, username: created.username },
    });

    return { id: created.id, username: created.username, password };
  });

/** Nuova password: stessa postazione, stesso utente, stesso indirizzo. */
export const regenerateDaneaStationPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; stationId: string }) => {
    if (!input?.companyId || !input?.stationId) throw new Error("Dati mancanti");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, data.companyId);

    const { generatePassword, hashPassword, randomHex } = await import("@/lib/danea-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const password = generatePassword();
    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);

    const { data: updated, error } = await supabaseAdmin
      .from("danea_stations")
      .update({ password_hash: passwordHash, password_salt: salt })
      .eq("id", data.stationId)
      .eq("company_id", data.companyId)
      .eq("status", "attivo")
      .select("id, username")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Postazione non trovata o revocata");

    await supabaseAdmin.from("audit_events").insert({
      company_id: data.companyId,
      actor_user_id: context.userId,
      action: "danea_station.password_regenerated",
      entity_type: "danea_station",
      entity_id: updated.id,
    });

    return { id: updated.id, username: updated.username, password };
  });

/** Revoca una singola postazione: indirizzo e altre postazioni restano invariati. */
export const revokeDaneaStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; stationId: string }) => {
    if (!input?.companyId || !input?.stationId) throw new Error("Dati mancanti");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("danea_stations")
      .update({ status: "revocato" })
      .eq("id", data.stationId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_events").insert({
      company_id: data.companyId,
      actor_user_id: context.userId,
      action: "danea_station.revoked",
      entity_type: "danea_station",
      entity_id: data.stationId,
    });

    return { ok: true };
  });
