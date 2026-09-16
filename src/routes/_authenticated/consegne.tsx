import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/consegne")({
  head: () => ({
    meta: [
      { title: "Consegne — Trevi Fruit" },
      { name: "description", content: "Area trasportatore di Trevi Fruit: consegne assegnate." },
      { property: "og:title", content: "Consegne — Trevi Fruit" },
      {
        property: "og:description",
        content: "Area trasportatore di Trevi Fruit: consegne assegnate.",
      },
    ],
  }),
  component: Consegne,
});

function Consegne() {
  const { data: identity } = useIdentity();
  const allowed = hasRole(identity, "trasportatore") || hasRole(identity, "amministratore");

  return (
    <AppShell title="Consegne" description="Le consegne assegnate e il loro stato.">
      {allowed ? (
        <PlaceholderCard
          title="In arrivo nelle prossime fasi"
          items={[
            "Consegne assegnate al trasportatore",
            "Conferma di consegna",
            "Note e problemi in consegna",
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Questa area è riservata a chi effettua le consegne.
        </p>
      )}
    </AppShell>
  );
}
