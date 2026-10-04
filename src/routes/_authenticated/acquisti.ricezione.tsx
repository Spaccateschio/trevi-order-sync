import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { OrderReceivingPanel } from "@/components/purchase/order-receiving-panel";
import { activeCompany, companyBuys, useIdentity } from "@/hooks/use-identity";

const description = "Ordini inviati ai fornitori per cui aspettiamo ancora la merce.";

export const Route = createFileRoute("/_authenticated/acquisti/ricezione")({
  head: () => ({
    meta: [
      { title: "Ricezione ordini — Trevi Fruit" },
      { name: "description", content: description },
      { property: "og:title", content: "Ricezione ordini — Trevi Fruit" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ricezione,
});

function Ricezione() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Ricezione ordini" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">Il profilo di acquisto non è attivo per la tua azienda.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ricezione ordini" description="La giacenza aumenta solo quando confermi il carico merce.">
      {company ? <OrderReceivingPanel companyId={company.companyId} /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
