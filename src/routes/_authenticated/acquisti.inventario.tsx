import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { MockInventoryPanel } from "@/components/inventory/mock-inventory-panel";
import { companyBuys, useIdentity } from "@/hooks/use-identity";

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
      description="Conteggio fisico rapido per zona, con giacenza calcolata sempre visibile."
      wide
    >
      {!isLoading ? <MockInventoryPanel /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
