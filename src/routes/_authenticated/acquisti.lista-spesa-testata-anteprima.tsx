import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { HeaderVariantsMockup } from "@/components/shopping-mockup/header-variants-mockup";

export const Route = createFileRoute("/_authenticated/acquisti/lista-spesa-testata-anteprima")({
  head: () => ({
    meta: [
      { title: "Anteprima testata — Lista della Spesa" },
      { name: "description", content: "Tre proposte per la parte alta della Lista della Spesa sul cellulare." },
      { property: "og:title", content: "Anteprima testata — Lista della Spesa" },
      { property: "og:description", content: "Tre proposte per la parte alta della Lista della Spesa sul cellulare." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell title="Anteprima testata" description="Dati finti, nessun salvataggio.">
      <HeaderVariantsMockup />
    </AppShell>
  ),
});
