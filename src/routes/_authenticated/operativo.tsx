import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import {
  PreparationPanel,
  RealPreparationGuideButton,
} from "@/components/preparation/preparation-panel";
import { activeCompany, hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/operativo")({
  head: () => ({
    meta: [
      { title: "Preparazione — Trevi Fruit" },
      {
        name: "description",
        content:
          "Preparazione degli ordini ricevuti: quantità e pesi confermati, preparatori, storico e stampa.",
      },
      { property: "og:title", content: "Preparazione — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Preparazione degli ordini ricevuti: quantità e pesi confermati, preparatori, storico e stampa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Operativo,
});

function Operativo() {
  const { data: identity } = useIdentity();
  const company = activeCompany(identity);
  const allowed = hasRole(identity, "operatore") || hasRole(identity, "amministratore");

  return (
    <AppShell title="Preparazione" actions={allowed ? <RealPreparationGuideButton /> : undefined}>
      {allowed && company && identity ? (
        <PreparationPanel
          key={`${identity.userId}:${company.memberId}`}
          memberId={company.memberId}
          userId={identity.userId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Questa area è riservata al personale operativo dell'azienda.
        </p>
      )}
    </AppShell>
  );
}
