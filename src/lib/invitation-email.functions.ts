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
const schema = z.object({
  invitationId: z.string().uuid(),
  token: z.string().min(10),
});

export const sendInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: invitation, error } = await supabase
      .from("company_invitations")
      .select("id, email, invite_code, expires_at, status, seller_company_id, customer_record_id")
      .eq("id", data.invitationId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invitation) throw new Error("Invito non trovato");
    if (invitation.status !== "in_attesa") throw new Error("L'invito non è più in attesa");

    const recipient = (invitation.email ?? "").trim();
    if (!recipient) {
      return { sent: false as const, reason: "no_email" as const };
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
            .select("legal_name")
            .eq("id", invitation.customer_record_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const origin = new URL(getRequest().url).origin;
    const { sendTemplateEmail } = await import("./email-templates/send-email");

    const result = await sendTemplateEmail("invito-collegamento", recipient, {
      templateData: {
        sellerName: seller?.legal_name ?? "Il tuo fornitore",
        recipientName: customer?.data?.legal_name ?? undefined,
        inviteLink: `${origin}/invito/${data.token}`,
        inviteCode: invitation.invite_code ?? undefined,
        expiresAt: new Date(invitation.expires_at).toLocaleDateString("it-IT"),
      },
      idempotencyKey: `invito-collegamento-${invitation.id}-${data.token.slice(0, 12)}`,
    });

    if (!result.sent) {
      return { sent: false as const, reason: "recipient_suppressed" as const };
    }
    return { sent: true as const };
  });
