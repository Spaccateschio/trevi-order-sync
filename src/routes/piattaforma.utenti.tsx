import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MOCK_USERS } from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/utenti")({
  head: () => ({
    meta: [
      { title: "Utenti — Amministrazione piattaforma (mockup)" },
      {
        name: "description",
        content: "Elenco di tutti gli utenti registrati sulla piattaforma, con azienda e ultimo accesso.",
      },
      { property: "og:title", content: "Utenti — Amministrazione piattaforma (mockup)" },
      {
        property: "og:description",
        content: "Elenco di tutti gli utenti registrati sulla piattaforma, con azienda e ultimo accesso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformUsers,
});

function PlatformUsers() {
  const [query, setQuery] = useState("");
  const filtered = MOCK_USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.company.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold">Utenti ({MOCK_USERS.length})</h1>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per nome, email o azienda…"
        aria-label="Cerca utente"
      />
      <ul className="space-y-2">
        {filtered.map((user) => (
          <li key={user.id}>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{user.name}</p>
                    <Badge variant={user.status === "attivo" ? "default" : "secondary"}>
                      {user.status === "attivo" ? "Attivo" : "Disattivato"}
                    </Badge>
                    <Badge variant="outline">{user.role}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.company} · ultimo accesso {user.lastAccess}
                  </p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nessun utente trovato per «{query}».
        </p>
      )}
    </div>
  );
}
