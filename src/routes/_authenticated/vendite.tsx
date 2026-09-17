import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { activeCompany, companySells, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/vendite")({
  head: () => ({
    meta: [
      { title: "Vendite — Trevi Fruit" },
      {
        name: "description",
        content: "Area vendite: clienti, prodotti, listini, ordini ricevuti, preparazione e consegne.",
      },
      { property: "og:title", content: "Vendite — Trevi Fruit" },
      {
        property: "og:description",
        content: "Area vendite: clienti, prodotti, listini, ordini ricevuti, preparazione e consegne.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Vendite,
});

function Vendite() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const relations =
    identity?.relations.filter((r) => r.sellerCompanyId === company?.companyId) ?? [];

  if (!isLoading && !companySells(identity)) {
    return (
      <AppShell title="Vendite" description="Area riservata alle aziende che vendono.">
        <p className="text-sm text-muted-foreground">
          Il profilo di vendita non è attivo per la tua azienda. Un amministratore può attivarlo
          dalla pagina Azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Vendite" description="I tuoi clienti e gli ordini che ricevi.">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Clienti collegati</h2>
          {isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Caricamento…</p>
          ) : relations.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {relations.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">Richiesta di collegamento</span>
                  <span className="block text-muted-foreground">
                    {RELATION_LABEL[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nessun cliente collegato per ora.
            </p>
          )}
        </section>

        <PlaceholderCard
          title="Non ancora sviluppato"
          items={[
            "Anagrafica clienti e inviti",
            "Prodotti e listini di vendita",
            "Ordini ricevuti",
            "Trasportatori",
          ]}
        />
      </div>
    </AppShell>
  );
}
