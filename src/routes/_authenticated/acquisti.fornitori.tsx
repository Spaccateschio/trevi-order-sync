import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/acquisti/fornitori")({
  head: () => ({
    meta: [
      { title: "Fornitori — Trevi Fruit" },
      {
        name: "description",
        content:
          "I rapporti con i fornitori si gestiscono nella pagina Collegamenti, insieme a tutti i collegamenti tra aziende.",
      },
      { property: "og:title", content: "Fornitori — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "I rapporti con i fornitori si gestiscono nella pagina Collegamenti, insieme a tutti i collegamenti tra aziende.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Fornitori,
});

function Fornitori() {
  return (
    <AppShell
      title="Fornitori"
      description="I rapporti tra aziende si gestiscono ora in un unico posto."
    >
      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Fornitori collegati, richieste inviate e ricevute, sospensione e riattivazione sono nella
          pagina Collegamenti.
        </p>
        <Button asChild size="sm">
          <Link to="/collegamenti">Vai a Collegamenti</Link>
        </Button>
      </section>
    </AppShell>
  );
}
