import { createFileRoute } from "@tanstack/react-router";

import { ProductsWorkspace } from "@/components/products/products-workspace";

export const Route = createFileRoute("/_authenticated/acquisti_/prodotti")({
  head: () => ({
    meta: [
      { title: "Prodotti — Acquisti — Trevi Fruit" },
      { name: "description", content: "Gli stessi prodotti visti dal lato approvvigionamento: fornitori, referenze e costi." },
      { property: "og:title", content: "Prodotti — Acquisti — Trevi Fruit" },
      { property: "og:description", content: "Gli stessi prodotti visti dal lato approvvigionamento: fornitori, referenze e costi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { prodotto?: string } =>
    typeof search['prodotto'] === "string" && search['prodotto'] ? { prodotto: search['prodotto'] } : {},
  component: AcquistiProdottiPage,
});

function AcquistiProdottiPage() {
  const { prodotto } = Route.useSearch();
  return (
    <ProductsWorkspace
      gridKey="acquisti.prodotti"
      prodottoParam={prodotto}
      initialTab="acquisto"
      initialVisibleColumns={["description", "code", "danea_um", "supplier_name", "supplier_product_code", "category"]}
    />
  );
}
