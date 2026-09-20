import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";

import { InventoryCountPanel } from "@/components/inventory/inventory-count-panel";
import { supabase } from "@/integrations/supabase/client";
import { activeCompany, companyBuys, hasRole, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/acquisti/inventario")({
  validateSearch: (search: Record<string, unknown>): { sezione?: "fabbisogno" } =>
    search["sezione"] === "fabbisogno" ? { sezione: "fabbisogno" } : {},
  head: () => ({
    meta: [
      { title: "Inventario — Trevi Fruit" },
      {
        name: "description",
        content:
          "Conteggio fisico per zona di magazzino, storico completo, rettifiche tracciate e fabbisogno calcolato.",
      },
      { property: "og:title", content: "Inventario — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Conteggio fisico per zona di magazzino, storico completo, rettifiche tracciate e fabbisogno calcolato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inventario,
});

function Inventario() {
  const { sezione } = Route.useSearch();
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");
  const archiveQuery = useQuery({
    queryKey: ["inventory-archive", company?.companyId],
    enabled: Boolean(company?.companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_archives")
        .select("id, name")
        .eq("company_id", company!.companyId)
        .order("created_at")
        .limit(1);
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },
  });

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Inventario" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Inventario"
      description="Conteggio fisico rapido per zona, con giacenza calcolata sempre visibile."
      wide
    >
      {!isLoading && company ? (
        <InventoryCountPanel
          companyId={company.companyId}
          archiveId={archiveQuery.data?.id ?? null}
          isAdmin={isAdmin}
          {...(sezione ? { initialTab: sezione } : {})}
        />
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
