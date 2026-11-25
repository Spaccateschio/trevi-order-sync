import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PurchaseOrdersPanel } from "@/components/purchase/purchase-orders-panel";
import { DirectPurchasesSection } from "@/components/purchase/direct-purchases-section";
import { OrderReceivingPanel } from "@/components/purchase/order-receiving-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { OrderOverviewRow } from "@/lib/purchase";
import { SentOrdersBanner } from "@/components/purchase/sent-orders-banner";
import { activeCompany, companyBuys, useIdentity } from "@/hooks/use-identity";

const description =
  "Ordini ai fornitori, consegne dichiarate, confronto con l'ordinato e carico merce in magazzino.";

export const Route = createFileRoute("/_authenticated/acquisti/ordini")({
  head: () => ({
    meta: [
      { title: "Ordini fornitore — Trevi Fruit" },
      { name: "description", content: description },
      { property: "og:title", content: "Ordini fornitore — Trevi Fruit" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdiniFornitore,
});

function OrdiniFornitore() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  // Scheda attiva: stato solo locale, si riparte sempre da «Ordini».
  const [tab, setTab] = useState("ordini");
  const companyId = company?.companyId ?? null;
  // Stessa lettura e stesso filtro di OrderReceivingPanel (cache condivisa).
  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<OrderOverviewRow[]> => {
      const { data, error } = await supabase.rpc("purchase_order_overview", { _company_id: companyId as string });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OrderOverviewRow[];
    },
  });
  const pendingCount = (ordersQuery.data ?? []).filter(
    (o) => o.send_status === "inviato" && (o.status === "inviato" || o.status === "parzialmente_consegnato"),
  ).length;

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Ordini fornitore" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Ordini fornitore"
      description="L'ordine non è giacenza: il magazzino si muove solo quando confermi il carico merce."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ordini">Ordini</TabsTrigger>
          <TabsTrigger value="ricevere">Da ricevere{ordersQuery.data ? ` (${pendingCount})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="ordini" className="space-y-4">
          {company ? <SentOrdersBanner companyId={company.companyId} measuredScroll /> : null}
          {company ? <PurchaseOrdersPanel companyId={company.companyId} /> : null}
          {company ? <DirectPurchasesSection companyId={company.companyId} /> : null}
        </TabsContent>
        <TabsContent value="ricevere">
          {company ? <OrderReceivingPanel companyId={company.companyId} /> : null}
        </TabsContent>
      </Tabs>
      {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
    </AppShell>
  );
}
