import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Invio dell'email di invito. Il destinatario e i dati mostrati arrivano dal
 * database (letto con i permessi dell'utente autenticato): dal browser
 * accettiamo solo l'identificativo dell'invito e il token appena generato,
 * che non è recuperabile perché nel database resta solo la sua impronta.
 */
/**
 * L'email può essere generata da un ambiente locale o di anteprima: in quel
 * caso il link non sarebbe raggiungibile da chi la riceve, quindi usiamo
 * sempre l'indirizzo pubblico del sito.
 */
const PUBLIC_SITE_URL = "https://trevi-order-sync.lovable.app";

function publicOrigin(origin: string): string {
  const fromEnv = process.env["PUBLIC_SITE_URL"];
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    return PUBLIC_SITE_URL;
  }
  return origin;
}

const schema = z.object({
  invitationId: z.string().uuid(),
  token: z.string().min(10),
});

export const sendInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Nessuna lettura dell'impronta qui: funziona sia prima sia dopo la
    // migrazione che la rende illeggibile.
    const { data: invitation, error } = await supabase
      .from("company_invitations")
      .select("id, email, invite_code, expires_at, status, seller_company_id, customer_record_id")
      .eq("id", data.invitationId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invitation) throw new Error("Invito non trovato");

    const recipient = (invitation.email ?? "").trim();
    if (!recipient) {
      return { sent: false as const, reason: "no_email" as const };
    }

    // 1) Prenotazione nel database (limite 5/24h, 60 s, admin, codice): dopo la migrazione.
    let reservation: { sendId: string; receipt: string } | null = null;
    const reserve = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
    )("reserve_customer_invitation_send", { _invitation_id: invitation.id, _token: data.token });

    if (reserve.error && reserve.error.code !== "PGRST202") {
      throw new Error(reserveMessage(reserve.error.message));
    }
    if (!reserve.error) {
      const row = ((reserve.data ?? []) as { send_id: string; receipt: string }[])[0];
      if (!row) throw new Error("Invio non prenotato: riprova.");
      reservation = { sendId: row.send_id, receipt: row.receipt };
    } else {
      // 2) Prima della migrazione: controlli lato server sull'impronta (comportamento attuale).
      await legacyCheck(supabase, invitation, data.token);
    }

    const [{ data: seller }, customer] = await Promise.all([
      supabase
        .from("companies")
        .select("legal_name")
        .eq("id", invitation.seller_company_id)
        .maybeSingle(),
      invitation.customer_record_id
        ? supabase
            .from("customer_records")
            .select("legal_name, vat_number, tax_code")
            .eq("id", invitation.customer_record_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const origin = publicOrigin(new URL(getRequest().url).origin);
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const { classifySendError } = await import("./invitation-token-check");

    let outcome: "accettato" | "fallito" | "sconosciuto";
    let detail: string | undefined;
    let result: Awaited<ReturnType<typeof sendTemplateEmail>> | null = null;
    let failure: unknown = null;
    try {
      result = await sendTemplateEmail("invito-collegamento", recipient, {
        templateData: {
          sellerName: seller?.legal_name ?? "Il tuo fornitore",
          recipientName: customer?.data?.legal_name ?? undefined,
          customerTaxId:
            customer?.data?.vat_number?.trim() || customer?.data?.tax_code?.trim() || undefined,
          inviteLink: `${origin}/invito/${data.token}`,
          inviteCode: invitation.invite_code ?? undefined,
          expiresAt: new Date(invitation.expires_at).toLocaleDateString("it-IT"),
        },
        // Una prenotazione = un solo invio possibile, anche se la richiesta viene ripetuta.
        idempotencyKey: reservation
          ? `invito-collegamento-send-${reservation.sendId}`
          : `invito-collegamento-${invitation.id}-${data.token.slice(0, 12)}`,
      });
      outcome = result.sent ? "accettato" : "fallito";
      detail = result.sent ? undefined : "recipient_suppressed";
    } catch (err) {
      failure = err;
      outcome = classifySendError(err);
      detail = err instanceof Error ? err.message : "errore";
    }

    if (reservation) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (
          supabaseAdmin.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: { message: string } | null }>
        )("record_customer_invitation_send", {
          _send_id: reservation.sendId,
          _receipt: reservation.receipt,
          _outcome: outcome,
          _detail: detail ?? null,
        });
      } catch (recordError) {
        // L'esito resta «prenotato» → letto come «esito sconosciuto»: il limite non si libera.
        console.error("[invito] esito non registrato", recordError);
      }
    }

    if (failure) throw failure;
    if (!result?.sent) {
      return { sent: false as const, reason: "recipient_suppressed" as const };
    }
    return { sent: true as const };
  });

function reserveMessage(code: string): string {
  const map: Record<string, string> = {
    INV_SEND_AUTH_REQUIRED: "Autenticazione richiesta",
    INV_SEND_NOT_FOUND: "Invito non trovato",
    INV_SEND_NOT_ADMIN: "Operazione riservata agli amministratori dell'azienda",
    INV_SEND_NOT_PENDING: "L'invito non è più in attesa",
    INV_SEND_EXPIRED: "Invito scaduto: usa Reinvia",
    INV_SEND_NO_EMAIL: "L'invito non ha un indirizzo email",
    INV_SEND_INVALID_TOKEN: "Codice dell'invito non valido",
    INV_SEND_TOO_SOON: "Attendi almeno un minuto prima di un nuovo invio",
    INV_SEND_DAILY_LIMIT: "Limite raggiunto: massimo 5 invii in 24 ore per questo invito",
  };
  const key = Object.keys(map).find((k) => code.includes(k));
  return key ? map[key]! : "Invio non autorizzato";
}

async function legacyCheck(
  supabase: { from: (t: "company_invitations") => any; rpc: (...a: any[]) => any },
  invitation: { id: string; status: string; expires_at: string; seller_company_id: string },
  token: string,
) {
  const { data: hashRow } = await supabase
    .from("company_invitations")
    .select("token_hash")
    .eq("id", invitation.id)
    .maybeSingle();
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_company_admin", {
    _company_id: invitation.seller_company_id,
  });
  if (adminError) throw new Error(adminError.message);

  const { checkInvitationSend } = await import("./invitation-token-check");
  const check = await checkInvitationSend({
    isAdmin: isAdmin === true,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    tokenHash: (hashRow as { token_hash?: string } | null)?.token_hash ?? null,
    token,
  });
  if (!check.ok) {
    const messages = {
      not_admin: "Operazione riservata agli amministratori dell'azienda",
      not_pending: "L'invito non è più in attesa",
      expired: "Invito scaduto: usa Reinvia",
      invalid_token: "Codice dell'invito non valido",
    } as const;
    throw new Error(messages[check.reason]);
  }
}
