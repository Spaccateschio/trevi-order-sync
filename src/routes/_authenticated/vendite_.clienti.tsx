import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { RelationCard } from "@/components/companies/relation-card";
import { Button } from "@/components/ui/button";
import {
  activeCompany,
  companySells,
  hasRole,
  identityQueryKey,
  useIdentity,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vendite_/clienti")({
  head: () => ({
    meta: [
      { title: "Clienti — Trevi Fruit" },
      {
        name: "description",
        content:
          "Collegamenti con i tuoi clienti: inviti, richieste da approvare e sospensione del tuo lato.",
      },
      { property: "og:title", content: "Clienti — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Collegamenti con i tuoi clienti: inviti, richieste da approvare e sospensione del tuo lato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Clienti,
});

type Buyer = { id: string; legal_name: string; city: string | null; province: string | null };

function Clienti() {
  const { data: identity, isLoading } = useIdentity();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  const buyersQuery = useQuery({
    queryKey: ["available-buyers"],
    queryFn: async (): Promise<Buyer[]> => {
      const { data, error } = await supabase.rpc("available_buyers");
      if (error) throw error;
      return (data ?? []) as Buyer[];
    },
    enabled: Boolean(company) && companySells(identity),
  });

  const relations =
    identity?.relations.filter((r) => r.sellerCompanyId === company?.companyId) ?? [];
  const linkedIds = new Set(relations.map((r) => r.buyerCompanyId));
  const invitable = (buyersQuery.data ?? []).filter(
    (b) => b.id !== company?.companyId && !linkedIds.has(b.id),
  );

  async function invite(buyerCompanyId: string) {
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

  if (!isLoading && !companySells(identity)) {
    return (
      <AppShell title="Clienti" description="Area riservata alle aziende che vendono.">
        <p className="text-sm text-muted-foreground">
          Il profilo di vendita non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Clienti"
      description="Ogni collegamento è indipendente e resta valido solo se entrambe le aziende lo mantengono attivo."
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Collegamenti
          </h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : relations.length ? (
            relations.map((relation) => (
              <RelationCard
                key={relation.id}
                relation={relation}
                side="venditore"
                isAdmin={isAdmin}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nessun cliente collegato per ora.</p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Aziende che acquistano
          </h2>
          {buyersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : invitable.length ? (
            invitable.map((buyer) => (
              <section
                key={buyer.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="font-display text-base font-semibold">{buyer.legal_name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[buyer.city, buyer.province].filter(Boolean).join(" · ") ||
                      "Sede non indicata"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!isAdmin || busyId === buyer.id}
                  onClick={() => invite(buyer.id)}
                >
                  Invita
                </Button>
              </section>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessuna nuova azienda da invitare al momento.
            </p>
          )}
        </div>

        {isAdmin ? null : (
          <p className="text-sm text-muted-foreground">
            Solo un amministratore della tua azienda può gestire i collegamenti.
          </p>
        )}
      </div>
    </AppShell>
  );
}
