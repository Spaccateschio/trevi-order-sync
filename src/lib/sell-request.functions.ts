import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { notifySellRequest } from "./sell-request-email.server";

const memberInput = z.object({ memberId: z.string().uuid() });
async function resolveCompany(supabase: SupabaseClient<Database>, userId: string, memberId: string) {
  const { data: member, error } = await supabase.from("company_members").select("company_id").eq("id", memberId).eq("user_id", userId).eq("status", "attivo").single();
  if (error || !member) throw new Error("Appartenenza aziendale non valida");
  const admin = await supabase.rpc("is_company_admin", { _company_id: member.company_id });
  if (admin.error || admin.data !== true) throw new Error("Operazione riservata agli amministratori dell'azienda");
  return member.company_id;
}
export const getCompanySellRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => memberInput.parse(input)).handler(async ({ data, context }) => {
  const companyId = await resolveCompany(context.supabase, context.userId, data.memberId);
  const result = await context.supabase.from("company_sell_requests").select("id, status, decision_reason, created_at, decided_at").eq("company_id", companyId).order("created_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return result.data;
});
export const requestCompanySell = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => memberInput.parse(input)).handler(async ({ data, context }) => {
  const companyId = await resolveCompany(context.supabase, context.userId, data.memberId);
  const result = await context.supabase.rpc("request_company_sell", { _company_id: companyId });
  if (result.error) throw new Error(result.error.message);
  return { id: result.data, ...await notifySellRequest(result.data, "admin") };
});
export const cancelCompanySellRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input)).handler(async ({ data, context }) => {
  const result = await context.supabase.rpc("cancel_company_sell_request", { _request_id: data.requestId });
  if (result.error) throw new Error(result.error.message);
  return { ok: true };
});
export const setCompanyProfile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => memberInput.extend({ buys: z.boolean(), sells: z.boolean() }).parse(input)).handler(async ({ data, context }) => {
  const companyId = await resolveCompany(context.supabase, context.userId, data.memberId);
  const result = await context.supabase.rpc("set_company_capabilities", { _company_id: companyId, _can_buy: data.buys, _can_sell: data.sells });
  if (result.error) throw new Error(result.error.message);
  return { ok: true };
});
export const getPlatformSellRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const result = await context.supabase.rpc("platform_sell_requests");
  if (result.error) throw new Error(result.error.message);
  return result.data;
});
export const decideCompanySellRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ requestId: z.string().uuid(), approve: z.boolean(), reason: z.string().max(500).optional() }).parse(input)).handler(async ({ data, context }) => {
  const result = await context.supabase.rpc("decide_company_sell_request", { _request_id: data.requestId, _approve: data.approve, ...(data.reason !== undefined ? { _reason: data.reason } : {}) });
  if (result.error) throw new Error(result.error.message);
  return { ok: true, ...await notifySellRequest(data.requestId, "company") };
});
// After registration, reads only the authenticated registrant's pending request.
export const notifyRegistrationSellRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const result = await context.supabase.from("company_sell_requests").select("id").eq("requested_by", context.userId).eq("origin", "registrazione").eq("status", "in_attesa").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? notifySellRequest(result.data.id, "admin") : { email: "not_required" as const };
});