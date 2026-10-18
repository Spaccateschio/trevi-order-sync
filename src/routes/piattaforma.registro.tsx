import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { listPlatformEvents } from "@/lib/platform.functions";

export const Route = createFileRoute("/piattaforma/registro")({
  head: () => ({
    meta: [
      { title: "Registro eventi — Amministrazione piattaforma" },
      {
        name: "description",
        content: "Registro delle azioni compiute nell'area di amministrazione della piattaforma.",
      },
      { property: "og:title", content: "Registro eventi — Amministrazione piattaforma" },
      {
        property: "og:description",
        content: "Registro delle azioni compiute nell'area di amministrazione della piattaforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformEvents,
});

function PlatformEvents() {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string>("tutti");
  const { data: events, isLoading } = useQuery({
    queryKey: ["platform-events"],
    queryFn: () => listPlatformEvents(),
  });

  if (isLoading || !events) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  const sections = [...new Set(events.map((e) => e.section))];
  const filtered = events.filter((event) => {
    if (section !== "tutti" && event.section !== section) return false;
    const q = query.toLowerCase();
    return (
      event.action.toLowerCase().includes(q) ||
      event.section.toLowerCase().includes(q) ||
      JSON.stringify(event.details ?? {}).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold">Registro eventi</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per azione o dettaglio…"
          aria-label="Cerca nel registro"
          className="flex-1"
        />
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger className="sm:w-48" aria-label="Filtra per sezione">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutte le sezioni</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
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
                    <Badge variant="outline">{event.section}</Badge>
                  </div>
                  {event.details != null && (
                    <p className="truncate text-sm text-muted-foreground">
                      {JSON.stringify(event.details)}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString("it-IT")}
                </p>
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
