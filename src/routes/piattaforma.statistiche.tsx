import { createFileRoute } from "@tanstack/react-router";

import { PlatformUsageMockup } from "@/components/platform/platform-usage-mockup";

export const Route = createFileRoute("/piattaforma/statistiche")({
  head: () => ({
    meta: [
      { title: "Statistiche di utilizzo — Amministrazione piattaforma" },
      {
        name: "description",
        content:
          "Mockup delle statistiche sulle pagine più visitate e sui comandi più cliccati nell'app.",
      },
      {
        property: "og:title",
        content: "Statistiche di utilizzo — Amministrazione piattaforma",
      },
      {
        property: "og:description",
        content:
          "Mockup delle statistiche sulle pagine più visitate e sui comandi più cliccati nell'app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformUsageMockup,
});
