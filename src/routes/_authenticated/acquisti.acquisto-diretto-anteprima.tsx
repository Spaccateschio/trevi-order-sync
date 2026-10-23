import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { DirectPurchaseMockup } from "@/components/products/direct-purchase-mockup";

export const Route = createFileRoute("/_authenticated/acquisti/acquisto-diretto-anteprima")({
  head: () => ({
    meta: [
      { title: "Acquisto diretto — Proposta scheda prodotto — Trevi Fruit" },
      { name: "description", content: "Proposta visiva dell'acquisto personale nella scheda prodotto Trevi Fruit, con dati di esempio e nessun salvataggio." },
      { property: "og:title", content: "Acquisto diretto — Proposta scheda prodotto — Trevi Fruit" },
      { property: "og:description", content: "Proposta visiva dell'acquisto personale nella scheda prodotto Trevi Fruit, con dati di esempio e nessun salvataggio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell title="Acquisto diretto — anteprima">
      <DirectPurchaseMockup />
    </AppShell>
  ),
});