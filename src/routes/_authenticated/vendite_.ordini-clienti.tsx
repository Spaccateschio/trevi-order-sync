import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ReceivedOrdersPanel } from "@/components/sales/received-orders-panel";
import { activeCompany, companySells, useIdentity } from "@/hooks/use-identity";

const description = "Ordini inviati dai tuoi clienti B2B, con prodotti, quantità e consegna richiesta.";

export const Route = createFileRoute("/_authenticated/vendite/ordini-clienti")({
  head: () => ({
    meta: [
      { title: "Ordini clienti — Trevi Fruit" },
      { name: "description", content: description },
      { property: "og:title", content: "Ordini clienti — Trevi Fruit" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdiniClienti,
});

function OrdiniClienti() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);

  if (!isLoading && !companySells(identity)) {
    return (
      <AppShell title="Ordini clienti" description="Area riservata alle aziende che vendono.">
        <p className="text-sm text-muted-foreground">
          Il profilo di vendita non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ordini clienti" description={description}>
      {company ? <ReceivedOrdersPanel companyId={company.companyId} /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
