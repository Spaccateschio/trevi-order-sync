import { createFileRoute } from "@tanstack/react-router";

import { PlatformUsagePanel } from "@/components/platform/platform-usage-mockup";

export const Route = createFileRoute("/piattaforma/statistiche")({
  head: () => ({
    meta: [
      { title: "Statistiche di utilizzo — Amministrazione piattaforma" },
      {
        name: "description",
        content: "Statistiche reali e suggerimenti per migliorare pagine, dispositivi e comandi dell'app.",
      },
      {
        property: "og:title",
        content: "Statistiche di utilizzo — Amministrazione piattaforma",
      },
      {
        property: "og:description",
        content: "Statistiche reali e suggerimenti per migliorare pagine, dispositivi e comandi dell'app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformUsagePanel,
});
