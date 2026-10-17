import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ReceivedOrdersPanel, SupplierOrderConsultation } from "@/components/sales/received-orders-panel";
import { sharedOrderId } from "@/lib/b2b-order-sharing";
import { activeCompany, companySells, useIdentity } from "@/hooks/use-identity";

const description = "Ordini inviati dai tuoi clienti B2B, con prodotti, quantità e consegna richiesta.";

export const Route = createFileRoute("/_authenticated/vendite_/ordini-clienti")({
  validateSearch: (search: Record<string, unknown>): { ordine?: string | undefined } => ({ ordine: typeof search['ordine'] === 'string' ? sharedOrderId(search['ordine']) ?? 'invalid' : undefined }),
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
  const { ordine } = Route.useSearch();
  const { user } = Route.useRouteContext();
  // A shared consultation must not depend on the currently selected company's navigation capabilities.
  return ordine ? <main className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6"><h1 className="font-display text-2xl font-semibold">Trevi Fruit — Consultazione ordine</h1><SupplierOrderConsultation orderId={ordine} userId={user.id} /></main> : <OrdiniClientiOperativi />;
}

function OrdiniClientiOperativi() {
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
