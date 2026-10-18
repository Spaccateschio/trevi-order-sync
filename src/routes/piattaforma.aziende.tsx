import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPlatformCompanies } from "@/lib/platform.functions";

export const Route = createFileRoute("/piattaforma/aziende")({
  head: () => ({
    meta: [
      { title: "Aziende — Amministrazione piattaforma" },
      {
        name: "description",
        content: "Elenco di tutte le aziende registrate sulla piattaforma, con stato e attività.",
      },
      { property: "og:title", content: "Aziende — Amministrazione piattaforma" },
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

const STATUS_LABELS: Record<string, string> = {
  attivo: "Attiva",
  disattivato: "Disattivata",
  revocato: "Revocata",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  attivo: "default",
  disattivato: "secondary",
  revocato: "destructive",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("it-IT");
}

function PlatformCompanies() {
  const [query, setQuery] = useState("");
  const { data: companies, isLoading } = useQuery({
    queryKey: ["platform-companies"],
    queryFn: () => listPlatformCompanies(),
  });

  if (isLoading || !companies) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">Aziende ({companies.length})</h1>
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
                      <Badge variant={STATUS_VARIANTS[company.status] ?? "secondary"}>
                        {STATUS_LABELS[company.status] ?? company.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {company.city} · {company.profile} · {company.users} utenti ·{" "}
                      {company.ordersMonth} ordini/mese
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Registrata il {formatDate(company.registeredAt)}
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
