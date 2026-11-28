import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { DocumentsBalanceMockup } from "@/components/sales-mockup/documents-balance-mockup";

export const Route = createFileRoute("/_authenticated/vendite_/documenti-saldo")({
  head: () => ({
    meta: [
      { title: "Documenti e saldo clienti — Trevi Fruit" },
      {
        name: "description",
        content:
          "Documenti, saldi e incassi dei tuoi clienti: DDT e fatture con stato, totale da incassare e solleciti.",
      },
      { property: "og:title", content: "Documenti e saldo clienti — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Documenti, saldi e incassi dei tuoi clienti: DDT e fatture con stato, totale da incassare e solleciti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell
      title="Documenti e saldo clienti"
      description="Anteprima con dati finti: documenti, saldi e incassi dei clienti."
    >
      <DocumentsBalanceMockup />
    </AppShell>
  ),
});
