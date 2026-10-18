import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_COMPANIES, MOCK_EVENTS, MOCK_USERS } from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/aziende/$aziendaId")({
  head: () => ({
    meta: [
      { title: "Dettaglio azienda — Amministrazione piattaforma (mockup)" },
      {
        name: "description",
        content: "Dettaglio di una singola azienda: dati, utenti e attività recente.",
      },
      { property: "og:title", content: "Dettaglio azienda — Amministrazione piattaforma (mockup)" },
      {
        property: "og:description",
        content: "Dettaglio di una singola azienda: dati, utenti e attività recente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformCompanyDetail,
});

function PlatformCompanyDetail() {
  const { aziendaId } = Route.useParams();
  const company = MOCK_COMPANIES.find((c) => c.id === aziendaId);

  if (!company) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="py-8 text-center text-sm text-muted-foreground">
          Azienda non trovata.
        </p>
      </div>
    );
  }

  const users = MOCK_USERS.filter((u) => u.company === company.name);
  const events = MOCK_EVENTS.filter((e) => e.company === company.name);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl font-semibold">{company.name}</h1>
        <Badge>{company.status === "attiva" ? "Attiva" : company.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dati</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Città: {company.city}</p>
            <p>Profilo: {company.profile}</p>
            <p>Registrata il: {company.registeredAt}</p>
            <p>Ultima attività: {company.lastActivity}</p>
            <p>Ordini questo mese: {company.ordersMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utenti ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {users.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{user.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {user.role} · {user.lastAccess}
                  </span>
                </li>
              ))}
              {users.length === 0 && (
                <li className="text-muted-foreground">Nessun utente.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attività recente</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{event.action}</p>
                  <p className="truncate text-sm text-muted-foreground">{event.detail}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{event.at}</p>
              </li>
            ))}
            {events.length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">Nessuna attività recente.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Vista in sola lettura: i dati dell'azienda possono essere modificati solo dall'azienda
        stessa.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/piattaforma/aziende"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Tutte le aziende
    </Link>
  );
}
