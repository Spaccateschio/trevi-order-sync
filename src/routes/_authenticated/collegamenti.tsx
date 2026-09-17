import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { RelationCard } from "@/components/companies/relation-card";
import { Button } from "@/components/ui/button";
import {
  activeCompany,
  companyBuys,
  companySells,
  hasRole,
  identityQueryKey,
  useIdentity,
  type Relation,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/collegamenti")({
  head: () => ({
    meta: [
      { title: "Collegamenti — Trevi Fruit" },
      {
        name: "description",
        content:
          "I rapporti tra la tua azienda e le altre aziende Trevi Fruit: clienti, fornitori, richieste e inviti.",
      },
      { property: "og:title", content: "Collegamenti — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "I rapporti tra la tua azienda e le altre aziende Trevi Fruit: clienti, fornitori, richieste e inviti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Collegamenti,
});

type CompanyOption = {
  id: string;
  legal_name: string;
  city: string | null;
  province: string | null;
};

type PendingInvitation = {
  id: string;
  email: string;
  expires_at: string;
  resend_count: number;
  customer_legal_name: string | null;
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Collegamenti() {
  const { data: identity, isLoading } = useIdentity();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");
  const sells = companySells(identity);
  const buys = companyBuys(identity);

  const relations = identity?.relations ?? [];
  const asSeller = relations.filter((r) => r.sellerCompanyId === company?.companyId);
  const asBuyer = relations.filter((r) => r.buyerCompanyId === company?.companyId);

  const decided = (r: Relation) => r.status !== "in_attesa";
  const waitingOnMe = (r: Relation, side: "venditore" | "acquirente") =>
    r.status === "in_attesa" &&
    ((r.origin === "richiesta_cliente" && side === "venditore") ||
      (r.origin === "invito_fornitore" && side === "acquirente"));

  const incoming = [
    ...asSeller.filter((r) => waitingOnMe(r, "venditore")).map((r) => ({ r, side: "venditore" as const })),
    ...asBuyer.filter((r) => waitingOnMe(r, "acquirente")).map((r) => ({ r, side: "acquirente" as const })),
  ];
  const outgoing = [
    ...asSeller
      .filter((r) => r.status === "in_attesa" && !waitingOnMe(r, "venditore"))
      .map((r) => ({ r, side: "venditore" as const })),
    ...asBuyer
      .filter((r) => r.status === "in_attesa" && !waitingOnMe(r, "acquirente"))
      .map((r) => ({ r, side: "acquirente" as const })),
  ];

  const invitationsQuery = useQuery({
    queryKey: ["pending-invitations", company?.companyId],
    queryFn: async (): Promise<PendingInvitation[]> => {
      const { data, error } = await supabase
        .from("company_invitations")
        .select("id, email, expires_at, resend_count, customer_records(legal_name)")
        .eq("seller_company_id", company!.companyId)
        .eq("status", "in_attesa")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        expires_at: row.expires_at,
        resend_count: row.resend_count,
        customer_legal_name:
          (row.customer_records as { legal_name: string } | null)?.legal_name ?? null,
      }));
    },
    enabled: Boolean(company) && sells,
  });

  const buyersQuery = useQuery({
    queryKey: ["available-buyers"],
    queryFn: async (): Promise<CompanyOption[]> => {
      const { data, error } = await supabase.rpc("available_buyers");
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
    enabled: Boolean(company) && sells,
  });

  const suppliersQuery = useQuery({
    queryKey: ["available-suppliers"],
    queryFn: async (): Promise<CompanyOption[]> => {
      const { data, error } = await supabase.rpc("available_suppliers");
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
    enabled: Boolean(company) && buys,
  });

  const linkedBuyerIds = new Set(asSeller.map((r) => r.buyerCompanyId));
  const linkedSellerIds = new Set(asBuyer.map((r) => r.sellerCompanyId));
  const invitableBuyers = (buyersQuery.data ?? []).filter(
    (b) => b.id !== company?.companyId && !linkedBuyerIds.has(b.id),
  );
  const invitableSuppliers = (suppliersQuery.data ?? []).filter(
    (s) => s.id !== company?.companyId && !linkedSellerIds.has(s.id),
  );

  async function refreshInvitations() {
    await queryClient.invalidateQueries({ queryKey: ["pending-invitations"] });
  }

  async function inviteBuyer(buyerCompanyId: string) {
    if (!company) return;
    setBusyId(buyerCompanyId);
    const { error } = await supabase.rpc("invite_customer_relation", {
      _seller_company_id: company.companyId,
      _buyer_company_id: buyerCompanyId,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Invito inviato. Attendi la risposta del cliente.");
  }

  async function requestSupplier(sellerCompanyId: string) {
    if (!company) return;
    setBusyId(sellerCompanyId);
    const { error } = await supabase.rpc("request_supplier_relation", {
      _seller_company_id: sellerCompanyId,
      _buyer_company_id: company.companyId,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Richiesta inviata. Attendi l'approvazione del fornitore.");
  }

  async function resendInvitation(invitationId: string) {
    const { error } = await supabase.rpc("resend_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshInvitations();
    toast.success("Invito rinnovato: genera di nuovo il link dalla scheda cliente.");
  }

  async function cancelInvitation(invitationId: string) {
    const { error } = await supabase.rpc("cancel_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshInvitations();
    toast.success("Invito annullato.");
  }

  const pendingInvitations = invitationsQuery.data ?? [];

  return (
    <AppShell
      title="Collegamenti"
      description="I rapporti tra la tua azienda e le altre aziende Trevi Fruit. L'anagrafica dei clienti resta nella pagina Clienti."
    >
      <div className="space-y-8">
        {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}

        {incoming.length ? (
          <Section title="Richieste da approvare" hint="Aspettano una tua decisione.">
            {incoming.map(({ r, side }) => (
              <RelationCard key={r.id} relation={r} side={side} isAdmin={isAdmin} />
            ))}
          </Section>
        ) : null}

        {outgoing.length ? (
          <Section title="Richieste inviate" hint="In attesa della risposta dell'altra azienda.">
            {outgoing.map(({ r, side }) => (
              <RelationCard key={r.id} relation={r} side={side} isAdmin={isAdmin} />
            ))}
          </Section>
        ) : null}

        {sells ? (
          <Section title="Clienti collegati">
            {asSeller.filter(decided).length ? (
              asSeller
                .filter(decided)
                .map((r) => (
                  <RelationCard key={r.id} relation={r} side="venditore" isAdmin={isAdmin} />
                ))
            ) : (
              <p className="text-sm text-muted-foreground">Nessun cliente collegato per ora.</p>
            )}
          </Section>
        ) : null}

        {buys ? (
          <Section title="Fornitori collegati">
            {asBuyer.filter(decided).length ? (
              asBuyer
                .filter(decided)
                .map((r) => (
                  <RelationCard key={r.id} relation={r} side="acquirente" isAdmin={isAdmin} />
                ))
            ) : (
              <p className="text-sm text-muted-foreground">Nessun fornitore collegato per ora.</p>
            )}
          </Section>
        ) : null}

        {sells ? (
          <Section
            title="Inviti in attesa"
            hint="Clienti invitati per email che non hanno ancora completato la registrazione."
          >
            {invitationsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : pendingInvitations.length ? (
              pendingInvitations.map((invitation) => (
                <section
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold">
                      {invitation.customer_legal_name ?? invitation.email}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {invitation.email} · scade il{" "}
                      {new Date(invitation.expires_at).toLocaleDateString("it-IT")}
                      {invitation.resend_count ? ` · reinvii: ${invitation.resend_count}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isAdmin}
                      onClick={() => resendInvitation(invitation.id)}
                    >
                      Rinnova
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!isAdmin}
                      onClick={() => cancelInvitation(invitation.id)}
                    >
                      Annulla
                    </Button>
                  </div>
                </section>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun invito in attesa. Gli inviti si generano dalla scheda del cliente.
              </p>
            )}
          </Section>
        ) : null}

        {sells ? (
          <Section
            title="Aziende che acquistano"
            hint="Aziende già presenti su Trevi Fruit a cui puoi proporre un collegamento."
          >
            {buyersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : invitableBuyers.length ? (
              invitableBuyers.map((buyer) => (
                <CompanyRow
                  key={buyer.id}
                  option={buyer}
                  actionLabel="Invita"
                  disabled={!isAdmin || busyId === buyer.id}
                  onAction={() => inviteBuyer(buyer.id)}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessuna nuova azienda da invitare al momento.
              </p>
            )}
          </Section>
        ) : null}

        {buys ? (
          <Section
            title="Aziende che vendono"
            hint="Fornitori a cui puoi chiedere il collegamento."
          >
            {suppliersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : invitableSuppliers.length ? (
              invitableSuppliers.map((supplier) => (
                <CompanyRow
                  key={supplier.id}
                  option={supplier}
                  actionLabel="Richiedi collegamento"
                  disabled={!isAdmin || busyId === supplier.id}
                  onAction={() => requestSupplier(supplier.id)}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun fornitore disponibile al momento.
              </p>
            )}
          </Section>
        ) : null}

        {isAdmin ? null : (
          <p className="text-sm text-muted-foreground">
            Solo un amministratore della tua azienda può gestire i collegamenti.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function CompanyRow({
  option,
  actionLabel,
  disabled,
  onAction,
}: {
  option: CompanyOption;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold">{option.legal_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {[option.city, option.province].filter(Boolean).join(" · ") || "Sede non indicata"}
        </p>
      </div>
      <Button size="sm" disabled={disabled} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}
