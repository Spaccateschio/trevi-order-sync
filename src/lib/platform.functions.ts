import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformSection =
  | "aziende"
  | "utenti"
  | "registro"
  | "assistenza"
  | "impostazioni";

export type PlatformPermission = "nessuno" | "vedi" | "modifica";

export type PlatformAccess = {
  isAdmin: boolean;
  isSuper: boolean;
  permissions: Record<PlatformSection, PlatformPermission>;
};

const SECTIONS: PlatformSection[] = [
  "aziende",
  "utenti",
  "registro",
  "assistenza",
  "impostazioni",
];

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
};

async function requirePlatformAdmin(supabase: unknown) {
  const { data } = await (supabase as RpcClient).rpc("is_platform_admin");
  if (data !== true) throw new Error("Accesso riservato al team interno");
}

export const getPlatformAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformAccess> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (isAdmin !== true) {
      return {
        isAdmin: false,
        isSuper: false,
        permissions: {
          aziende: "nessuno",
          utenti: "nessuno",
          registro: "nessuno",
          assistenza: "nessuno",
          impostazioni: "nessuno",
        },
      };
    }
    const { data: member } = await supabase
      .from("platform_team_members")
      .select(
        "is_super, perm_aziende, perm_utenti, perm_registro, perm_assistenza, perm_impostazioni",
      )
      .eq("user_id", userId)
      .eq("status", "attivo")
      .maybeSingle();
    const isSuper = member?.is_super === true;
    const permissions = Object.fromEntries(
      SECTIONS.map((section) => {
        if (isSuper) return [section, "modifica"];
        const key = `perm_${section}` as keyof typeof member;
        return [section, (member?.[key] as PlatformPermission) ?? "nessuno"];
      }),
    ) as Record<PlatformSection, PlatformPermission>;
    return { isAdmin: true, isSuper, permissions };
  });

export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [companies, activeCompanies, profiles, ordersMonth, ordersToday] =
      await Promise.all([
        supabaseAdmin.from("companies").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("status", "attivo"),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStart.toISOString()),
        supabaseAdmin
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString()),
      ]);

    return {
      companies: companies.count ?? 0,
      activeCompanies: activeCompanies.count ?? 0,
      users: profiles.count ?? 0,
      ordersMonth: ordersMonth.count ?? 0,
      ordersToday: ordersToday.count ?? 0,
    };
  });

export const listPlatformCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("id, legal_name, city, status, can_buy, can_sell, created_at")
      .order("legal_name");
    const { data: members } = await supabaseAdmin
      .from("company_members")
      .select("company_id");
    const { data: orders } = await supabaseAdmin
      .from("purchase_orders")
      .select("buyer_company_id, created_at")
      .gte("created_at", monthStart.toISOString());

    const usersByCompany = new Map<string, number>();
    for (const m of members ?? []) {
      usersByCompany.set(m.company_id, (usersByCompany.get(m.company_id) ?? 0) + 1);
    }
    const ordersByCompany = new Map<string, number>();
    let lastActivity: string | null = null;
    for (const o of orders ?? []) {
      if (o.buyer_company_id) {
        ordersByCompany.set(
          o.buyer_company_id,
          (ordersByCompany.get(o.buyer_company_id) ?? 0) + 1,
        );
      }
      if (!lastActivity || o.created_at > lastActivity) lastActivity = o.created_at;
    }

    return (companies ?? []).map((c) => ({
      id: c.id,
      name: c.legal_name,
      city: c.city ?? "",
      profile: c.can_buy && c.can_sell ? "Compra e vende" : c.can_sell ? "Vende" : "Compra",
      status: c.status as string,
      users: usersByCompany.get(c.id) ?? 0,
      ordersMonth: ordersByCompany.get(c.id) ?? 0,
      registeredAt: c.created_at,
      lastActivity,
    }));
  });

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, membersRes, companiesRes, rolesRes, authRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("user_id, first_name, last_name, status, created_at"),
      supabaseAdmin.from("company_members").select("user_id, company_id"),
      supabaseAdmin.from("companies").select("id, legal_name"),
      supabaseAdmin.from("company_member_roles").select("member_id, role"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    const companyById = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));
    const companyByUser = new Map(
      (membersRes.data ?? []).map((m) => [m.user_id, m.company_id]),
    );
    const memberIdByUser = new Map(
      (membersRes.data ?? []).map((m) => [m.user_id, m.user_id]),
    );
    void memberIdByUser;
    const emailByUser = new Map(
      (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
    );
    const lastAccessByUser = new Map(
      (authRes.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
    );
    const roleByUser = new Map<string, string>();
    for (const r of rolesRes.data ?? []) {
      if (!roleByUser.has(r.member_id)) roleByUser.set(r.member_id, r.role as string);
    }

    return (profilesRes.data ?? []).map((p) => {
      const companyId = companyByUser.get(p.user_id);
      return {
        id: p.user_id,
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Senza nome",
        email: emailByUser.get(p.user_id) ?? "",
        company: companyId ? (companyById.get(companyId) ?? "") : "",
        role: roleByUser.get(p.user_id) ?? "",
        lastAccess: lastAccessByUser.get(p.user_id) ?? null,
        status: p.status as string,
      };
    });
  });

export const listPlatformEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context.supabase);
    const { data } = await context.supabase
      .from("platform_audit_log")
      .select("id, actor_user_id, section, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const listPlatformTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context.supabase);
    const { data: members } = await context.supabase
      .from("platform_team_members")
      .select(
        "id, user_id, is_super, status, perm_aziende, perm_utenti, perm_registro, perm_assistenza, perm_impostazioni, created_at",
      )
      .order("created_at");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profilesRes, authRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, first_name, last_name"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const nameByUser = new Map(
      (profilesRes.data ?? []).map((p) => [
        p.user_id,
        [p.first_name, p.last_name].filter(Boolean).join(" "),
      ]),
    );
    const emailByUser = new Map(
      (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
    );
    return (members ?? []).map((m) => ({
      ...m,
      name: nameByUser.get(m.user_id) || "Senza nome",
      email: emailByUser.get(m.user_id) ?? "",
    }));
  });

export const findPlatformUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const found = (users?.users ?? []).find(
      (u) => u.email?.toLowerCase() === data.email.trim().toLowerCase(),
    );
    if (!found) return null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", found.id)
      .maybeSingle();
    return {
      userId: found.id,
      email: found.email ?? "",
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
    };
  });

export const managePlatformTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      action: "aggiungi" | "modifica" | "disattiva";
      memberId?: string;
      userId?: string;
      permAziende?: PlatformPermission;
      permUtenti?: PlatformPermission;
      permRegistro?: PlatformPermission;
      permAssistenza?: PlatformPermission;
      permImpostazioni?: PlatformPermission;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const args = {
      _action: data.action as string,
      ...(data.memberId ? { _member_id: data.memberId } : {}),
      ...(data.userId ? { _user_id: data.userId } : {}),
      ...(data.permAziende ? { _perm_aziende: data.permAziende } : {}),
      ...(data.permUtenti ? { _perm_utenti: data.permUtenti } : {}),
      ...(data.permRegistro ? { _perm_registro: data.permRegistro } : {}),
      ...(data.permAssistenza ? { _perm_assistenza: data.permAssistenza } : {}),
      ...(data.permImpostazioni ? { _perm_impostazioni: data.permImpostazioni } : {}),
    };
    const { data: id, error } = await context.supabase.rpc(
      "manage_platform_team_member",
      args,
    );
    if (error) throw new Error(error.message);
    return { id };
  });
