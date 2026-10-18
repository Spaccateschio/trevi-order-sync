import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import {
  PreparationMockup,
  PreparationGuideButton,
} from "@/components/preparation/preparation-mockup";
import { hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/operativo")({
  head: () => ({
    meta: [
      { title: "Preparazione — Trevi Fruit" },
      {
        name: "description",
        content:
          "Preparazione Trevi Fruit: mockup con quantità, pesi confermati e avanzamento degli ordini.",
      },
      { property: "og:title", content: "Preparazione — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Preparazione Trevi Fruit: mockup con quantità, pesi confermati e avanzamento degli ordini.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Operativo,
});

function Operativo() {
  const { data: identity } = useIdentity();
  const allowed = hasRole(identity, "operatore") || hasRole(identity, "amministratore");

  return (
    <AppShell title="Preparazione" actions={allowed ? <PreparationGuideButton /> : undefined}>
      {allowed ? (
        <PreparationMockup />
      ) : (
        <p className="text-sm text-muted-foreground">
          Questa area è riservata al personale operativo dell'azienda.
        </p>
      )}
    </AppShell>
  );
}
