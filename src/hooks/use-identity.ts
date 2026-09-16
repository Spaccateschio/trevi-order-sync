import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "amministratore" | "operatore" | "trasportatore";
export type CustomerRole = "owner" | "member";
export type RelationStatus = "in_attesa" | "attivo" | "sospeso" | "revocato" | "rifiutato";

export type Membership = {
  memberId: string;
  companyId: string;
  companyName: string;
  roles: AppRole[];
};

export type CustomerLink = {
  customerCompanyId: string;
  customerCompanyName: string;
  role: CustomerRole;
};

export type Relation = {
  id: string;
  companyId: string;
  companyName: string | null;
  customerCompanyId: string;
  status: RelationStatus;
};

export type Identity = {
  userId: string;
  email: string | null;
  profile: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
  memberships: Membership[];
  customerLinks: CustomerLink[];
  relations: Relation[];
};

export const identityQueryKey = ["identity"] as const;

async function fetchIdentity(): Promise<Identity | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [profileRes, membersRes, customerRes, relationsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("company_members")
      .select("id, company_id, status, companies(legal_name), company_member_roles(role)")
      .eq("user_id", user.id)
      .eq("status", "attivo"),
    supabase
      .from("customer_company_users")
      .select("customer_company_id, role, status, customer_companies(legal_name)")
      .eq("user_id", user.id)
      .eq("status", "attivo"),
    supabase
      .from("supplier_customer_relations")
      .select("id, company_id, customer_company_id, status, companies(legal_name)"),
  ]);

  let profile = profileRes.data
    ? {
        id: profileRes.data.id,
        firstName: profileRes.data.first_name,
        lastName: profileRes.data.last_name,
        phone: profileRes.data.phone,
      }
    : null;

  // Il profilo persona viene creato al primo accesso.
  if (!profile) {
    const created = await supabase
      .from("profiles")
      .insert({ user_id: user.id })
      .select("id, first_name, last_name, phone")
      .maybeSingle();
    if (created.data) {
      profile = {
        id: created.data.id,
        firstName: created.data.first_name,
        lastName: created.data.last_name,
        phone: created.data.phone,
      };
    }
  }

  const memberships: Membership[] = (membersRes.data ?? []).map((row) => ({
    memberId: row.id,
    companyId: row.company_id,
    companyName:
      (row.companies as { legal_name: string } | null)?.legal_name ?? "Azienda",
    roles: ((row.company_member_roles ?? []) as { role: AppRole }[]).map((r) => r.role),
  }));

  const customerLinks: CustomerLink[] = (customerRes.data ?? []).map((row) => ({
    customerCompanyId: row.customer_company_id,
    customerCompanyName:
      (row.customer_companies as { legal_name: string } | null)?.legal_name ?? "Azienda cliente",
    role: row.role as CustomerRole,
  }));

  const relations: Relation[] = (relationsRes.data ?? []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    companyName: (row.companies as { legal_name: string } | null)?.legal_name ?? null,
    customerCompanyId: row.customer_company_id,
    status: row.status as RelationStatus,
  }));

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    memberships,
    customerLinks,
    relations,
  };
}

export function useIdentity() {
  return useQuery({ queryKey: identityQueryKey, queryFn: fetchIdentity });
}

export function hasRole(identity: Identity | null | undefined, role: AppRole) {
  return Boolean(identity?.memberships.some((m) => m.roles.includes(role)));
}

export function isCustomer(identity: Identity | null | undefined) {
  return Boolean(identity?.customerLinks.length);
}

export function isStaff(identity: Identity | null | undefined) {
  return Boolean(identity?.memberships.length);
}
