import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOCK_EVENTS, type MockEvent } from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/registro")({
  head: () => ({
    meta: [
      { title: "Registro eventi — Amministrazione piattaforma (mockup)" },
      {
        name: "description",
        content: "Registro di tutte le azioni sulla piattaforma, con filtri per azienda, utente e tipo.",
      },
      { property: "og:title", content: "Registro eventi — Amministrazione piattaforma (mockup)" },
      {
        property: "og:description",
        content: "Registro di tutte le azioni sulla piattaforma, con filtri per azienda, utente e tipo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformEvents,
});

const KIND_LABELS: Record<MockEvent["kind"], string> = {
  ordine: "Ordine",
  consegna: "Consegna",
  accesso: "Accesso",
  anagrafica: "Anagrafica",
  sistema: "Sistema",
};

function PlatformEvents() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("tutti");

  const filtered = MOCK_EVENTS.filter((event) => {
    if (kind !== "tutti" && event.kind !== kind) return false;
    const q = query.toLowerCase();
    return (
      event.company.toLowerCase().includes(q) ||
      event.user.toLowerCase().includes(q) ||
      event.action.toLowerCase().includes(q) ||
      event.detail.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold">Registro eventi</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per azienda, utente o azione…"
          aria-label="Cerca nel registro"
          className="flex-1"
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="sm:w-48" aria-label="Filtra per tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i tipi</SelectItem>
            {Object.entries(KIND_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul className="space-y-2">
        {filtered.map((event) => (
          <li key={event.id}>
            <Card>
              <CardContent className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{event.action}</p>
                    <Badge variant="outline">{KIND_LABELS[event.kind]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{event.detail}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.company} · {event.user}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{event.at}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nessun evento trovato con questi filtri.
        </p>
      )}
    </div>
  );
}
