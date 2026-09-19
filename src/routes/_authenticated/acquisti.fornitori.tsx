import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { SupplierRecordsPanel } from "@/components/companies/supplier-records-panel";
import { activeCompany, companyBuys, hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/acquisti/fornitori")({
  head: () => ({
    meta: [
      { title: "Fornitori — Trevi Fruit" },
      {
        name: "description",
        content:
          "L'anagrafica commerciale dei tuoi fornitori: dati, contatti, indirizzi, punti di ritiro e riferimenti Danea.",
      },
      { property: "og:title", content: "Fornitori — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "L'anagrafica commerciale dei tuoi fornitori: dati, contatti, indirizzi, punti di ritiro e riferimenti Danea.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Fornitori,
});

function Fornitori() {
  const { data: identity, isLoading } = useIdentity();

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Fornitori" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Fornitori"
      description="La tua anagrafica commerciale: un fornitore esiste qui anche se non usa Trevi Fruit."
    >
      <div className="space-y-6">
        {company ? <SupplierRecordsPanel companyId={company.companyId} isAdmin={isAdmin} /> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
      </div>
    </AppShell>
  );
}
