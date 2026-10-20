import { SELL_REQUEST_EMAILS_ENABLED } from "./sell-request-policy";

// Only called after the feature RPC has authorized and committed its event.
// No backfill/automatic replay of test emails when sending is later enabled.
export async function notifySellRequest(requestId: string, target: "admin" | "company") {
  if (!SELL_REQUEST_EMAILS_ENABLED) return { email: "blocked" as const };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: request, error } = await supabaseAdmin.from("company_sell_requests").select("*, companies(legal_name, email)").eq("id", requestId).single();
  if (error || !request) return { email: "failed" as const };
  if ((target === "admin" && request.admin_notified_at) || (target === "company" && request.company_notified_at)) return { email: "already_sent" as const };
  if (target === "company" && request.status !== "approvata" && request.status !== "rifiutata") return { email: "blocked" as const };
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(request.requested_by);
  const recipient = target === "admin" ? "amato3380@gmail.com" : request.companies?.email || user.user?.email;
  if (!recipient) return { email: "missing_recipient" as const };
  const template = target === "admin" ? "nuova-richiesta-vendo" : request.status === "approvata" ? "richiesta-vendo-approvata" : "richiesta-vendo-rifiutata";
  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const result = await sendTemplateEmail(template, recipient, { templateData: { companyName: request.companies?.legal_name, reason: request.decision_reason }, idempotencyKey: `${template}:${requestId}` });
    if (!result.sent) return { email: "suppressed" as const };
    const marked = await supabaseAdmin.rpc("mark_sell_request_notified", { _request_id: requestId, _target: target });
    if (marked.error) console.error("Sell request notification receipt failed", requestId);
    return { email: "sent" as const };
  } catch {
    // A committed request/decision must not be shown as failed because email failed.
    console.error("Sell request email outcome unknown", requestId);
    return { email: "unknown" as const };
  }
}