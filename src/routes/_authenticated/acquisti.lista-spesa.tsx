import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ShoppingListPanel } from "@/components/shopping/shopping-list-panel";
import { activeCompany, companyBuys, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/acquisti/lista-spesa")({
  head: () => ({
    meta: [
      { title: "Lista della Spesa — Trevi Fruit" },
      {
        name: "description",
        content:
          "Quantità da acquistare, suggerimento del sistema e decisione dell'operatore, con ripartizione tra più fornitori.",
      },
      { property: "og:title", content: "Lista della Spesa — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Quantità da acquistare, suggerimento del sistema e decisione dell'operatore, con ripartizione tra più fornitori.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListaSpesa,
});

function ListaSpesa() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Lista della Spesa" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Lista della Spesa"
      description="Quello che serve e quello che compriamo davvero restano due numeri distinti."
    >
      {company ? <ShoppingListPanel companyId={company.companyId} /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
