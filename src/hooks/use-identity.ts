import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "amministratore" | "operatore" | "trasportatore";
export type RelationStatus = "in_attesa" | "attivo" | "sospeso" | "revocato" | "rifiutato";

/** Capacità dell'azienda sulla piattaforma: separata dai ruoli delle persone. */
export type CompanyCapabilities = { buys: boolean; sells: boolean };

export type Membership = {
  memberId: string;
  companyId: string;
  companyName: string;
  capabilities: CompanyCapabilities;
  roles: AppRole[];
};

export type RelationOrigin = "invito_fornitore" | "richiesta_cliente";

export type Relation = {
  id: string;
  sellerCompanyId: string;
  sellerCompanyName: string | null;
  buyerCompanyId: string;
  buyerCompanyName: string | null;
  status: RelationStatus;
  origin: RelationOrigin;
  /** Doppio consenso: il rapporto è operativo solo se entrambi i lati sono attivi. */
  sellerEnabled: boolean;
  buyerEnabled: boolean;
  /** Cliente d'anagrafica collegato, quando presente: nessun dato duplicato. */
  customerRecordId: string | null;
  /** Fornitore d'anagrafica del lato acquirente, quando presente. */
  supplierRecordId: string | null;
};

/** Unico punto di calcolo: rapporto realmente utilizzabile. */
export function isRelationOperational(relation: Relation) {
  return relation.status === "attivo" && relation.sellerEnabled && relation.buyerEnabled;
}

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
  relations: Relation[];
};

const ACTIVE_COMPANY_KEY = "trevi-fruit-active-company";

export const identityQueryKey = ["identity"] as const;

async function fetchIdentity(): Promise<Identity | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [profileRes, membersRes, relationsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("company_members")
      .select(
        "id, company_id, status, companies(legal_name, can_buy, can_sell), company_member_roles(role)",
      )
      .eq("user_id", user.id)
      .eq("status", "attivo"),
    supabase
      .from("supplier_customer_relations")
      .select(
        "id, seller_company_id, buyer_company_id, status, origin, seller_enabled, buyer_enabled, customer_record_id, supplier_record_id, seller:companies!supplier_customer_relations_company_id_fkey(legal_name), buyer:companies!relations_buyer_fkey(legal_name)",
      ),
  ]);

  let profile = profileRes.data
    ? {
        id: profileRes.data.id,
        firstName: profileRes.data.first_name,
        lastName: profileRes.data.last_name,
        phone: profileRes.data.phone,
      }
    : null;

  // Il profilo persona viene creato al primo accesso con i dati inseriti in registrazione.
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaFirstName = typeof metadata["first_name"] === "string" ? metadata["first_name"] : null;
  const metaLastName = typeof metadata["last_name"] === "string" ? metadata["last_name"] : null;
  const metaPhone = typeof metadata["phone"] === "string" ? metadata["phone"] : null;

  if (!profile) {
    const created = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        first_name: metaFirstName,
        last_name: metaLastName,
        phone: metaPhone,
      })
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
  } else if (
    (!profile.firstName && metaFirstName) ||
    (!profile.lastName && metaLastName) ||
    (!profile.phone && metaPhone)
  ) {
    // Profilo già esistente ma incompleto: completa con i dati della registrazione.
    const patched = await supabase
      .from("profiles")
      .update({
        first_name: profile.firstName ?? metaFirstName,
        last_name: profile.lastName ?? metaLastName,
        phone: profile.phone ?? metaPhone,
      })
      .eq("id", profile.id)
      .select("id, first_name, last_name, phone")
      .maybeSingle();
    if (patched.data) {
      profile = {
        id: patched.data.id,
        firstName: patched.data.first_name,
        lastName: patched.data.last_name,
        phone: patched.data.phone,
      };
    }
  }

  const memberships: Membership[] = (membersRes.data ?? []).map((row) => {
    const company = row.companies as
      | { legal_name: string; can_buy: boolean; can_sell: boolean }
      | null;
    return {
      memberId: row.id,
      companyId: row.company_id,
      companyName: company?.legal_name ?? "Azienda",
      capabilities: { buys: Boolean(company?.can_buy), sells: Boolean(company?.can_sell) },
      roles: ((row.company_member_roles ?? []) as { role: AppRole }[]).map((r) => r.role),
    };
  });

  const relations: Relation[] = (relationsRes.data ?? []).map((row) => ({
    id: row.id,
    sellerCompanyId: row.seller_company_id,
    sellerCompanyName: (row.seller as { legal_name: string } | null)?.legal_name ?? null,
    buyerCompanyId: row.buyer_company_id,
    buyerCompanyName: (row.buyer as { legal_name: string } | null)?.legal_name ?? null,
    status: row.status as RelationStatus,
    origin: row.origin as RelationOrigin,
    sellerEnabled: row.seller_enabled,
    buyerEnabled: row.buyer_enabled,
    customerRecordId: row.customer_record_id ?? null,
    supplierRecordId: row.supplier_record_id ?? null,
  }));

  const selectedCompanyId = typeof window === "undefined"
    ? null
    : window.localStorage.getItem(`${ACTIVE_COMPANY_KEY}:${user.id}`);
  const activeMembership = memberships.find((membership) => membership.companyId === selectedCompanyId);
  const orderedMemberships = activeMembership
    ? [activeMembership, ...memberships.filter((membership) => membership.companyId !== activeMembership.companyId)]
    : memberships;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    memberships: orderedMemberships,
    relations,
  };
}

export function useIdentity() {
  return useQuery({ queryKey: identityQueryKey, queryFn: fetchIdentity });
}

export function selectActiveCompany(userId: string, companyId: string) {
  window.localStorage.setItem(`${ACTIVE_COMPANY_KEY}:${userId}`, companyId);
}

/** L'azienda della persona che ha effettuato l'accesso. */
export function activeCompany(identity: Identity | null | undefined) {
  return identity?.memberships[0] ?? null;
}

export function hasRole(identity: Identity | null | undefined, role: AppRole) {
  return Boolean(activeCompany(identity)?.roles.includes(role));
}

export function companyBuys(identity: Identity | null | undefined) {
  return Boolean(activeCompany(identity)?.capabilities.buys);
}

export function companySells(identity: Identity | null | undefined) {
  return Boolean(activeCompany(identity)?.capabilities.sells);
}

export function hasCompany(identity: Identity | null | undefined) {
  return Boolean(identity?.memberships.length);
}
