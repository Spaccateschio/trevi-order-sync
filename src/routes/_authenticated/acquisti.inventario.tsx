import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { InventoryPanel } from "@/components/inventory/inventory-panel";
import { activeCompany, companyBuys, hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/acquisti/inventario")({
  head: () => ({
    meta: [
      { title: "Inventario — Trevi Fruit" },
      {
        name: "description",
        content:
          "Conteggio fisico per zona di magazzino, storico completo, rettifiche tracciate e fabbisogno calcolato.",
      },
      { property: "og:title", content: "Inventario — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Conteggio fisico per zona di magazzino, storico completo, rettifiche tracciate e fabbisogno calcolato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inventario,
});

function Inventario() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Inventario" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Inventario"
      description="La giacenza nasce dal conteggio fisico: zona per zona, con storico e rettifiche tracciate."
    >
      {company ? <InventoryPanel companyId={company.companyId} isAdmin={isAdmin} /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
