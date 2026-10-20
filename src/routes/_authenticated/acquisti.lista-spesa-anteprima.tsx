import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { CompactCardMockup } from "@/components/shopping-mockup/compact-card-mockup";

export const Route = createFileRoute("/_authenticated/acquisti/lista-spesa-anteprima")({
  head: () => ({
    meta: [
      { title: "Anteprima card compatte — Lista della Spesa" },
      { name: "description", content: "Prova delle card compatte della Lista della Spesa con prodotti finti." },
      { property: "og:title", content: "Anteprima card compatte — Lista della Spesa" },
      { property: "og:description", content: "Prova delle card compatte della Lista della Spesa con prodotti finti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell title="Anteprima card compatte" description="Prodotti finti, nessun salvataggio.">
      <CompactCardMockup />
    </AppShell>
  ),
});
