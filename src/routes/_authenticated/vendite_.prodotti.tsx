import { createFileRoute } from "@tanstack/react-router";

import { ProductsWorkspace } from "@/components/products/products-workspace";
import { VIEW_INITIAL_COLUMNS } from "@/lib/products-view";

export const Route = createFileRoute("/_authenticated/vendite_/prodotti")({
  head: () => ({
    meta: [
      { title: "Prodotti — Vendite — Trevi Fruit" },
      { name: "description", content: "Catalogo prodotti nel contesto di vendita: listini, U.M. ordinabili e vetrina B2B." },
      { property: "og:title", content: "Prodotti — Vendite — Trevi Fruit" },
      { property: "og:description", content: "Catalogo prodotti nel contesto di vendita: listini, U.M. ordinabili e vetrina B2B." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { prodotto?: string } =>
    typeof search['prodotto'] === "string" && search['prodotto'] ? { prodotto: search['prodotto'] } : {},
  component: VenditeProdottiPage,
});

function VenditeProdottiPage() {
  const { prodotto } = Route.useSearch();
  return (
    <ProductsWorkspace
      gridKey="vendite.prodotti"
      prodottoParam={prodotto}
      initialTab="prodotto"
      view="vendite"
      initialVisibleColumns={VIEW_INITIAL_COLUMNS.vendite}
    />
  );
}
