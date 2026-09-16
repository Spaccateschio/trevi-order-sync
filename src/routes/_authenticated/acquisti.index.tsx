import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { activeCompany, companyBuys, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/acquisti/")({
  head: () => ({
    meta: [
      { title: "Acquisti — Trevi Fruit" },
      {
        name: "description",
        content: "Area acquisti: fornitori collegati, cataloghi, ordini di acquisto e consegne ricevute.",
      },
      { property: "og:title", content: "Acquisti — Trevi Fruit" },
      {
        property: "og:description",
        content: "Area acquisti: fornitori collegati, cataloghi, ordini di acquisto e consegne ricevute.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Acquisti,
});

const RELATION_LABEL: Record<string, string> = {
  in_attesa: "In attesa di approvazione",
  attivo: "Attivo",
  sospeso: "Sospeso",
  revocato: "Revocato",
  rifiutato: "Rifiutato",
};

function Acquisti() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const relations = identity?.relations.filter((r) => r.buyerCompanyId === company?.companyId) ?? [];

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Acquisti" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda. Un amministratore può attivarlo
          dalla pagina Azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Acquisti" description="I tuoi fornitori e i tuoi ordini di acquisto.">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Fornitori collegati</h2>
          {isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Caricamento…</p>
          ) : relations.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {relations.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.sellerCompanyName ?? "Fornitore"}</span>
                  <span className="block text-muted-foreground">
                    {RELATION_LABEL[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nessun fornitore collegato.{" "}
              <Link to="/acquisti/fornitori" className="underline underline-offset-4">
                Scegli un fornitore
              </Link>
              .
            </p>
          )}
        </section>

        <PlaceholderCard
          title="Non ancora sviluppato"
          items={[
            "Cataloghi dei fornitori",
            "Listini che ogni fornitore ti assegna",
            "Ordini di acquisto e loro stato",
            "Consegne ricevute",
          ]}
        />
      </div>
    </AppShell>
  );
}
