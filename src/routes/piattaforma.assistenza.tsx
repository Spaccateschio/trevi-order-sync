import { createFileRoute } from "@tanstack/react-router";
import { Eye, Search } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MOCK_COMPANIES, MOCK_USERS, type MockUser } from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/assistenza")({
  head: () => ({
    meta: [
      { title: "Assistenza — Amministrazione piattaforma (mockup)" },
      {
        name: "description",
        content: "Assistenza agli utenti: cerca un utente o un'azienda e vedi cosa vede, in sola lettura.",
      },
      { property: "og:title", content: "Assistenza — Amministrazione piattaforma (mockup)" },
      {
        property: "og:description",
        content: "Assistenza agli utenti: cerca un utente o un'azienda e vedi cosa vede, in sola lettura.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformSupport,
});

function PlatformSupport() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MockUser | null>(null);

  const results = query.trim()
    ? MOCK_USERS.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase()) ||
          u.company.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const company = selected
    ? MOCK_COMPANIES.find((c) => c.name === selected.company)
    : null;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold">Assistenza utenti</h1>
      <p className="text-sm text-muted-foreground">
        Cerca un utente o un'azienda per vedere cosa vede e aiutarlo. La vista è in sola
        lettura: non puoi modificare i suoi dati.
      </p>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Cerca utente o azienda…"
          aria-label="Cerca utente o azienda"
          className="pl-9"
        />
      </div>

      {results.length > 0 && !selected && (
        <ul className="space-y-2">
          {results.map((user) => (
            <li key={user.id}>
              <Card>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email} · {user.company}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelected(user)}>
                    <Eye className="h-4 w-4" aria-hidden />
                    Assisti
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {query.trim() && results.length === 0 && !selected && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nessun utente trovato per «{query}».
        </p>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                Stai assistendo: {selected.name}
              </CardTitle>
              <Badge variant="secondary">Sola lettura</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {selected.email} · {selected.company} · ruolo {selected.role}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Ultimo accesso:</span> {selected.lastAccess}
            </p>
            {company && (
              <>
                <p>
                  <span className="font-medium">Stato azienda:</span> {company.status}
                </p>
                <p>
                  <span className="font-medium">Ordini questo mese:</span>{" "}
                  {company.ordersMonth}
                </p>
              </>
            )}
            <p className="rounded-md bg-muted p-3 text-muted-foreground">
              Qui comparirà la schermata che l'utente sta vedendo, in sola lettura, per
              guidarlo passo passo al telefono. Ogni apertura di questa vista verrà
              registrata nel registro eventi.
            </p>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Termina assistenza
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
