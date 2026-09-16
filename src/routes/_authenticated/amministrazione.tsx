import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/amministrazione")({
  head: () => ({
    meta: [
      { title: "Amministrazione — Trevi Fruit" },
      {
        name: "description",
        content: "Area amministratore di Trevi Fruit: azienda, personale, clienti e rapporti.",
      },
      { property: "og:title", content: "Amministrazione — Trevi Fruit" },
      {
        property: "og:description",
        content: "Area amministratore di Trevi Fruit: azienda, personale, clienti e rapporti.",
      },
    ],
  }),
  component: Amministrazione,
});

function Amministrazione() {
  const { data: identity } = useIdentity();
  const allowed = hasRole(identity, "amministratore");

  return (
    <AppShell
      title="Amministrazione"
      description="Gestione dell'azienda, delle persone e dei rapporti con i clienti."
    >
      {allowed ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <PlaceholderCard
            title="In arrivo nelle prossime fasi"
            items={[
              "Dati e impostazioni dell'azienda",
              "Personale e ruoli",
              "Anagrafica clienti e inviti",
              "Approvazione dei rapporti commerciali",
            ]}
          />
          <PlaceholderCard
            title="Non ancora sviluppato"
            items={[
              "Catalogo prodotti",
              "Listini e condizioni commerciali",
              "Collegamento con il gestionale",
            ]}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Questa area è riservata agli amministratori dell'azienda.
        </p>
      )}
    </AppShell>
  );
}
