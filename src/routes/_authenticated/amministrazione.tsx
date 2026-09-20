import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { AddressManager } from "@/components/companies/address-manager";
import { UnitCatalogue } from "@/components/company/unit-catalogue";
import { InventoryLocationsManager } from "@/components/inventory/inventory-locations-manager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activeCompany,
  hasRole,
  identityQueryKey,
  useIdentity,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/amministrazione")({
  validateSearch: (search: Record<string, unknown>): { sezione?: "magazzino" } =>
    search["sezione"] === "magazzino" ? { sezione: "magazzino" } : {},
  head: () => ({
    meta: [
      { title: "Azienda — Trevi Fruit" },
      {
        name: "description",
        content: "Impostazioni dell'azienda su Trevi Fruit: profilo di utilizzo, persone e rapporti.",
      },
      { property: "og:title", content: "Azienda — Trevi Fruit" },
      {
        property: "og:description",
        content: "Impostazioni dell'azienda su Trevi Fruit: profilo di utilizzo, persone e rapporti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Amministrazione,
});

function Amministrazione() {
  const { sezione } = Route.useSearch();
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const allowed = hasRole(identity, "amministratore");
  const company = activeCompany(identity);
  const buys = Boolean(company?.capabilities.buys);
  const sells = Boolean(company?.capabilities.sells);

  const profileLabel = buys && sells ? "Compro e vendo" : buys ? "Compro" : sells ? "Vendo" : "—";

  async function handleEnable(which: "buys" | "sells") {
    if (!company) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_company_capabilities", {
      _company_id: company.companyId,
      _can_buy: which === "buys" ? true : buys,
      _can_sell: which === "sells" ? true : sells,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success(
      which === "buys" ? "Profilo di acquisto attivato." : "Profilo di vendita attivato.",
    );
  }

  return (
    <AppShell
      title="Azienda"
      description="Profilo di utilizzo, persone e rapporti commerciali della tua azienda."
    >
      {allowed && company ? (
        <Tabs defaultValue={sezione ?? "generali"} className="space-y-4">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="generali">Dati generali</TabsTrigger>
            <TabsTrigger value="magazzino">Magazzino</TabsTrigger>
            <TabsTrigger value="preferenze">Preferenze</TabsTrigger>
          </TabsList>

          <TabsContent value="generali">
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:col-span-2">
                <h2 className="font-display text-base font-semibold">Come usi Trevi Fruit</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {company.companyName} — profilo attuale: <strong>{profileLabel}</strong>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Puoi attivare anche l'altra modalità in qualsiasi momento: la tua azienda resta la
                  stessa e nessun dato viene perso.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {buys ? null : (
                    <Button onClick={() => handleEnable("buys")} disabled={busy}>
                      Attiva anche COMPRO
                    </Button>
                  )}
                  {sells ? null : (
                    <Button onClick={() => handleEnable("sells")} disabled={busy}>
                      Attiva anche VENDO
                    </Button>
                  )}
                  {buys && sells ? (
                    <p className="text-sm text-muted-foreground">
                      Entrambe le modalità sono già attive.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:col-span-2">
                <h2 className="font-display text-base font-semibold">Indirizzi dell'azienda</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Puoi avere più sedi, più punti di consegna e più punti di ritiro. Ogni indirizzo è
                  visibile alle aziende collegate solo se lo attivi tu.
                </p>
                <div className="mt-4">
                  <AddressManager owner={{ companyId: company.companyId }} isAdmin={allowed} />
                </div>
              </section>

              {sells ? <UnitCatalogue companyId={company.companyId} /> : null}

              <PlaceholderCard
                title="In arrivo nelle prossime fasi"
                items={[
                  "Dati e impostazioni dell'azienda",
                  "Persone dell'azienda e inviti",
                  "Ruoli e permessi personalizzati",
                  "Approvazione dei rapporti commerciali",
                ]}
              />
              <PlaceholderCard
                title="Non ancora sviluppato"
                items={["Prodotti e listini di vendita", "Ordini", "Trasportatori"]}
              />
            </div>
          </TabsContent>

          <TabsContent value="magazzino">
            <InventoryLocationsManager companyId={company.companyId} isAdmin={allowed} />
          </TabsContent>

          <TabsContent value="preferenze">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-base font-semibold">Preferenze aziendali</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Questa sezione resta invariata. Il mockup riguarda esclusivamente la configurazione delle zone di magazzino.
              </p>
            </section>
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">
          Questa area è riservata agli amministratori dell'azienda.
        </p>
      )}
    </AppShell>
  );
}
