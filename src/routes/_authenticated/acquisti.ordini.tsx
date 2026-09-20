import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { PurchaseOrdersPanel } from "@/components/purchase/purchase-orders-panel";
import { activeCompany, companyBuys, useIdentity } from "@/hooks/use-identity";

const description =
  "Ordini ai fornitori, consegne dichiarate, confronto con l'ordinato e carico merce in magazzino.";

export const Route = createFileRoute("/_authenticated/acquisti/ordini")({
  head: () => ({
    meta: [
      { title: "Ordini fornitore — Trevi Fruit" },
      { name: "description", content: description },
      { property: "og:title", content: "Ordini fornitore — Trevi Fruit" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdiniFornitore,
});

function OrdiniFornitore() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Ordini fornitore" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Ordini fornitore"
      description="L'ordine non è giacenza: il magazzino si muove solo quando confermi il carico merce."
    >
      {company ? <PurchaseOrdersPanel companyId={company.companyId} /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
