import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { CustomerRecordsPanel } from "@/components/companies/customer-records-panel";
import { ProposedUpdatesPanel } from "@/components/companies/proposed-updates-panel";
import { activeCompany, companySells, hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/vendite_/clienti")({
  head: () => ({
    meta: [
      { title: "Clienti — Trevi Fruit" },
      {
        name: "description",
        content:
          "L'anagrafica commerciale dei tuoi clienti: dati, contatti, indirizzi, destinazioni e riferimenti Danea.",
      },
      { property: "og:title", content: "Clienti — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "L'anagrafica commerciale dei tuoi clienti: dati, contatti, indirizzi, destinazioni e riferimenti Danea.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Clienti,
});

function Clienti() {
  const { data: identity, isLoading } = useIdentity();

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

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
      description="La tua anagrafica commerciale: un cliente esiste qui anche se non usa Trevi Fruit."
    >
      <div className="space-y-6">
        {company ? <ProposedUpdatesPanel companyId={company.companyId} isAdmin={isAdmin} /> : null}
        {company ? <CustomerRecordsPanel companyId={company.companyId} isAdmin={isAdmin} /> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
      </div>
    </AppShell>
  );
}
