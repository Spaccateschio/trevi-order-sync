import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/piattaforma/impostazioni")({
  head: () => ({
    meta: [
      { title: "Impostazioni piattaforma — Amministrazione (mockup)" },
      {
        name: "description",
        content: "Impostazioni generali della piattaforma: registrazioni, prove e avvisi.",
      },
      { property: "og:title", content: "Impostazioni piattaforma — Amministrazione (mockup)" },
      {
        property: "og:description",
        content: "Impostazioni generali della piattaforma: registrazioni, prove e avvisi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformSettings,
});

function PlatformSettings() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold">Impostazioni piattaforma</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrazioni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="s1">Nuove registrazioni aperte</Label>
              <p className="text-xs text-muted-foreground">
                Se spento, nessuna nuova azienda può registrarsi da sola.
              </p>
            </div>
            <Switch id="s1" defaultChecked />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="s2">Approvazione manuale delle nuove aziende</Label>
              <p className="text-xs text-muted-foreground">
                Le nuove aziende restano «in prova» finché non le approvi tu.
              </p>
            </div>
            <Switch id="s2" defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avvisi al super amministratore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="s3">Avvisami quando si registra una nuova azienda</Label>
            </div>
            <Switch id="s3" defaultChecked />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="s4">Avvisami in caso di errori ripetuti</Label>
              <p className="text-xs text-muted-foreground">
                Per esempio sincronizzazioni Danea fallite più volte di seguito.
              </p>
            </div>
            <Switch id="s4" defaultChecked />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Queste impostazioni sono dimostrative: nel mockup non salvano nulla.
      </p>
    </div>
  );
}
