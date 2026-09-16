import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Panoramica — Trevi Fruit" },
      { name: "description", content: "Panoramica del tuo accesso e del tuo ruolo su Trevi Fruit." },
      { property: "og:title", content: "Panoramica — Trevi Fruit" },
      {
        property: "og:description",
        content: "Panoramica del tuo accesso e del tuo ruolo su Trevi Fruit.",
      },
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

  return (
    <AppShell title="Panoramica" description="Il tuo accesso, la tua azienda e il tuo ruolo.">
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
            <h2 className="font-display text-base font-semibold">Ruoli in azienda</h2>
            {identity?.memberships.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {identity.memberships.map((m) => (
                  <li key={m.companyId}>
                    <span className="font-medium">{m.companyName}</span>
                    <span className="block text-muted-foreground">
                      {m.roles.length ? m.roles.join(", ") : "nessun ruolo assegnato"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Non fai parte del personale di un'azienda fornitrice.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:col-span-2">
            <h2 className="font-display text-base font-semibold">Attività cliente</h2>
            {identity?.customerLinks.length ? (
              <ul className="mt-2 space-y-3 text-sm">
                {identity.customerLinks.map((link) => {
                  const rel = identity.relations.filter(
                    (r) => r.customerCompanyId === link.customerCompanyId,
                  );
                  return (
                    <li key={link.customerCompanyId}>
                      <span className="font-medium">{link.customerCompanyName}</span>
                      <span className="block text-muted-foreground">
                        {link.role === "owner" ? "Titolare" : "Utente"}
                      </span>
                      {rel.map((r) => (
                        <span key={r.id} className="block text-muted-foreground">
                          Rapporto con {r.companyName ?? "fornitore"}:{" "}
                          {RELATION_LABEL[r.status] ?? r.status}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Nessuna attività collegata a questo accesso.
              </p>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
