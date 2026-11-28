import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { CustomerDocumentsPage } from "@/components/purchase-documents/customer-documents-page";

export const Route = createFileRoute("/_authenticated/acquisti/documenti-saldo")({
  head: () => ({
    meta: [
      { title: "I tuoi documenti e saldo — Trevi Fruit" },
      { name: "description", content: "Consulta i tuoi documenti, le scadenze e il saldo da pagare ai fornitori." },
      { property: "og:title", content: "I tuoi documenti e saldo — Trevi Fruit" },
      { property: "og:description", content: "Consulta i tuoi documenti, le scadenze e il saldo da pagare ai fornitori." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell title="Documenti e saldo">
      <CustomerDocumentsPage />
    </AppShell>
  ),
});