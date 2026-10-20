import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { AddressManager } from "@/components/companies/address-manager";
import { DeliveryPreferencesForm } from "@/components/company/delivery-preferences-form";
import { OperationalSchedulesForm } from "@/components/company/operational-schedules-form";
import { SellerPriceInfoForm } from "@/components/company/seller-price-info-form";
import { CompanyPhoneForm } from "@/components/company/company-phone-form";
import { CompanyProfile } from "@/components/company/company-profile";
import { UnitCatalogue } from "@/components/company/unit-catalogue";
import { InventoryLocationsManager } from "@/components/inventory/inventory-locations-manager";
import { TeamMockup } from "@/components/team-mockup/team-mockup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activeCompany,
  hasRole,
  useIdentity,
} from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/amministrazione")({
  validateSearch: (search: Record<string, unknown>): { sezione?: "magazzino" | "preferenze" } =>
    search["sezione"] === "magazzino" || search["sezione"] === "preferenze"
      ? { sezione: search["sezione"] as "magazzino" | "preferenze" }
      : {},
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
  const allowed = hasRole(identity, "amministratore");
  const company = activeCompany(identity);
  const sells = Boolean(company?.capabilities.sells);

  return (
    <AppShell
      title="Azienda"
      description="Profilo di utilizzo, persone e rapporti commerciali della tua azienda."
    >
      {allowed && company ? (
        <Tabs defaultValue={sezione ?? "generali"} className="space-y-4">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="generali">Dati generali</TabsTrigger>
            <TabsTrigger value="profilo">Profilo</TabsTrigger>
            <TabsTrigger value="magazzino">Magazzino</TabsTrigger>
            <TabsTrigger value="preferenze">Preferenze</TabsTrigger>
            <TabsTrigger value="collaboratori">Collaboratori (anteprima)</TabsTrigger>
          </TabsList>

          <TabsContent value="collaboratori">
            <TeamMockup />
          </TabsContent>

          <TabsContent value="profilo">
            <CompanyProfile company={company} />
          </TabsContent>

          <TabsContent value="generali">
            <div className="grid gap-4 sm:grid-cols-2">

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

              <CompanyPhoneForm companyId={company.companyId} isAdmin={allowed} />

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
            <DeliveryPreferencesForm companyId={company.companyId} />
            <OperationalSchedulesForm companyId={company.companyId} isAdmin={allowed} />
            {sells ? <SellerPriceInfoForm companyId={company.companyId} isAdmin={allowed} /> : null}
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
