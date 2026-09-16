import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { activeCompany, companyBuys, companySells, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Panoramica — Trevi Fruit" },
      { name: "description", content: "Panoramica della tua azienda, del tuo ruolo e dei collegamenti su Trevi Fruit." },
      { property: "og:title", content: "Panoramica — Trevi Fruit" },
      {
        property: "og:description",
        content: "Panoramica della tua azienda, del tuo ruolo e dei collegamenti su Trevi Fruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const RELATION_LABEL: Record<string, string> = {
  in_attesa: "In attesa di approvazione",
  attivo: "Attivo",
  sospeso: "Sospeso",
  revocato: "Revocato",
  rifiutato: "Rifiutato",
};

function Dashboard() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const buys = companyBuys(identity);
  const sells = companySells(identity);

  const purchaseRelations =
    identity?.relations.filter((r) => r.buyerCompanyId === company?.companyId) ?? [];
  const salesRelations =
    identity?.relations.filter((r) => r.sellerCompanyId === company?.companyId) ?? [];

  const profileLabel = buys && sells ? "Compro e vendo" : buys ? "Compro" : sells ? "Vendo" : "—";

  return (
    <AppShell title="Panoramica" description="La tua azienda, il tuo ruolo e i tuoi collegamenti.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold">Persona</h2>
            <p className="mt-2 text-sm text-muted-foreground">{identity?.email}</p>
            {identity?.profile?.firstName || identity?.profile?.lastName ? (
              <p className="text-sm text-muted-foreground">
                {[identity?.profile?.firstName, identity?.profile?.lastName]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold">Azienda</h2>
            {company ? (
              <>
                <p className="mt-2 text-sm font-medium">{company.companyName}</p>
                <p className="text-sm text-muted-foreground">Profilo: {profileLabel}</p>
                <p className="text-sm text-muted-foreground">
                  Ruoli: {company.roles.length ? company.roles.join(", ") : "nessuno assegnato"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nessuna azienda collegata.</p>
            )}
          </section>

          {buys ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-base font-semibold">Acquisti</h2>
              {purchaseRelations.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {purchaseRelations.map((r) => (
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
          ) : null}

          {sells ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-base font-semibold">Vendite</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {salesRelations.length
                  ? `${salesRelations.length} richieste o collegamenti con clienti`
                  : "Nessun cliente collegato per ora."}
              </p>
              <Link to="/danea" className="mt-2 inline-block text-sm underline underline-offset-4">
                Collegamento al gestionale
              </Link>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
