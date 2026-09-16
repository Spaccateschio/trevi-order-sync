import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/operativo")({
  head: () => ({
    meta: [
      { title: "Operativo — Trevi Fruit" },
      {
        name: "description",
        content: "Area operatore di Trevi Fruit: ordini in lavorazione e preparazione.",
      },
      { property: "og:title", content: "Operativo — Trevi Fruit" },
      {
        property: "og:description",
        content: "Area operatore di Trevi Fruit: ordini in lavorazione e preparazione.",
      },
    ],
  }),
  component: Operativo,
});

function Operativo() {
  const { data: identity } = useIdentity();
  const allowed = hasRole(identity, "operatore") || hasRole(identity, "amministratore");

  return (
    <AppShell title="Operativo" description="Il lavoro quotidiano di ordini e preparazione.">
      {allowed ? (
        <PlaceholderCard
          title="In arrivo nelle prossime fasi"
          items={[
            "Elenco ordini ricevuti",
            "Preparazione da telefono e tablet",
            "Quantità e pesi effettivi",
            "Mancanti e sostituzioni",
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Questa area è riservata al personale operativo dell'azienda.
        </p>
      )}
    </AppShell>
  );
}
