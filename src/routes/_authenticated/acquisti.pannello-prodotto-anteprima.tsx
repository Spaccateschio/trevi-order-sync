import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ProductDetailPanelMockup } from "@/components/products/product-detail-panel-mockup";

export const Route = createFileRoute("/_authenticated/acquisti_/pannello-prodotto-anteprima")({
  head: () => ({
    meta: [
      { title: "Pannello prodotto — Proposta pagina Prodotti — Trevi Fruit" },
      { name: "description", content: "Proposta visiva della scheda prodotto sempre attiva accanto all'elenco su computer, con dati di esempio e nessun salvataggio." },
      { property: "og:title", content: "Pannello prodotto — Proposta pagina Prodotti — Trevi Fruit" },
      { property: "og:description", content: "Proposta visiva della scheda prodotto sempre attiva accanto all'elenco su computer, con dati di esempio e nessun salvataggio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell title="Pannello prodotto — anteprima">
      <ProductDetailPanelMockup />
    </AppShell>
  ),
});
