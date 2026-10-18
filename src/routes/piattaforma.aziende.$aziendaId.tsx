import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPlatformCompanies, listPlatformUsers } from "@/lib/platform.functions";

export const Route = createFileRoute("/piattaforma/aziende/$aziendaId")({
  head: () => ({
    meta: [
      { title: "Dettaglio azienda — Amministrazione piattaforma" },
      {
        name: "description",
        content: "Dettaglio di una singola azienda: dati, utenti e attività recente.",
      },
      { property: "og:title", content: "Dettaglio azienda — Amministrazione piattaforma" },
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

const STATUS_LABELS: Record<string, string> = {
  attivo: "Attiva",
  disattivato: "Disattivata",
  revocato: "Revocata",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("it-IT");
}

function PlatformCompanyDetail() {
  const { aziendaId } = Route.useParams();
  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ["platform-companies"],
    queryFn: () => listPlatformCompanies(),
  });
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["platform-users"],
    queryFn: () => listPlatformUsers(),
  });

  if (loadingCompanies || loadingUsers || !companies || !users) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  const company = companies.find((c) => c.id === aziendaId);

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

  const companyUsers = users.filter((u) => u.company === company.name);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl font-semibold">{company.name}</h1>
        <Badge>{STATUS_LABELS[company.status] ?? company.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dati</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Città: {company.city || "—"}</p>
            <p>Profilo: {company.profile}</p>
            <p>Registrata il: {formatDate(company.registeredAt)}</p>
            <p>Ordini questo mese: {company.ordersMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utenti ({companyUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {companyUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{user.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {user.role || "—"} ·{" "}
                    {user.lastAccess
                      ? new Date(user.lastAccess).toLocaleDateString("it-IT")
                      : "mai entrato"}
                  </span>
                </li>
              ))}
              {companyUsers.length === 0 && (
                <li className="text-muted-foreground">Nessun utente.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

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
