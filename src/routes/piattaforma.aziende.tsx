import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MOCK_COMPANIES, type MockCompany } from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/aziende")({
  head: () => ({
    meta: [
      { title: "Aziende — Amministrazione piattaforma (mockup)" },
      {
        name: "description",
        content: "Elenco di tutte le aziende registrate sulla piattaforma, con stato e attività.",
      },
      { property: "og:title", content: "Aziende — Amministrazione piattaforma (mockup)" },
      {
        property: "og:description",
        content: "Elenco di tutte le aziende registrate sulla piattaforma, con stato e attività.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformCompanies,
});

const STATUS_LABELS: Record<MockCompany["status"], string> = {
  attiva: "Attiva",
  in_prova: "In prova",
  sospesa: "Sospesa",
};

const STATUS_VARIANTS: Record<MockCompany["status"], "default" | "secondary" | "destructive"> = {
  attiva: "default",
  in_prova: "secondary",
  sospesa: "destructive",
};

function PlatformCompanies() {
  const [query, setQuery] = useState("");
  const filtered = MOCK_COMPANIES.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">Aziende ({MOCK_COMPANIES.length})</h1>
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca azienda…"
        aria-label="Cerca azienda"
      />
      <ul className="space-y-2">
        {filtered.map((company) => (
          <li key={company.id}>
            <Link to="/piattaforma/aziende/$aziendaId" params={{ aziendaId: company.id }}>
              <Card className="transition-colors hover:border-accent">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{company.name}</p>
                      <Badge variant={STATUS_VARIANTS[company.status]}>
                        {STATUS_LABELS[company.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {company.city} · {company.profile} · {company.users} utenti ·{" "}
                      {company.ordersMonth} ordini/mese
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Registrata il {company.registeredAt} · ultima attività {company.lastActivity}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nessuna azienda trovata per «{query}».
        </p>
      )}
    </div>
  );
}
