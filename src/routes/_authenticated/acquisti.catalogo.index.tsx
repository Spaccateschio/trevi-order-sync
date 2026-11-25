import { createFileRoute } from "@tanstack/react-router";

import { SupplierCatalogView } from "@/components/catalog/supplier-catalog-view";

export const Route = createFileRoute("/_authenticated/acquisti/catalogo/")({
  head: () => ({
    meta: [
      { title: "Catalogo fornitori — Trevi Fruit" },
      {
        name: "description",
        content:
          "Le vetrine dei fornitori con cui hai un collegamento attivo e l'elenco unico di tutti i loro prodotti, con prezzi assegnati e preferiti.",
      },
      { property: "og:title", content: "Catalogo fornitori — Trevi Fruit" },
      {
        property: "og:description",
        content: "Vetrine dei fornitori collegati e catalogo unico di tutti i loro prodotti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SupplierCatalogView />,
});

