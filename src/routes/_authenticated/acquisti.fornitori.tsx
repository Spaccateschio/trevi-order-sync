import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  activeCompany,
  companyBuys,
  hasRole,
  identityQueryKey,
  useIdentity,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/acquisti/fornitori")({
  head: () => ({
    meta: [
      { title: "Fornitori — Trevi Fruit" },
      {
        name: "description",
        content: "Scegli i fornitori con cui vuoi collegarti e controlla lo stato di ogni rapporto.",
      },
      { property: "og:title", content: "Fornitori — Trevi Fruit" },
      {
        property: "og:description",
        content: "Scegli i fornitori con cui vuoi collegarti e controlla lo stato di ogni rapporto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Fornitori,
});

const RELATION_LABEL: Record<string, string> = {
  in_attesa: "Richiesta in attesa di approvazione",
  attivo: "Collegamento attivo",
  sospeso: "Collegamento sospeso",
  revocato: "Collegamento revocato",
  rifiutato: "Richiesta rifiutata",
};

type Supplier = { id: string; legal_name: string; city: string | null; province: string | null };

function Fornitori() {
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  const suppliersQuery = useQuery({
    queryKey: ["available-suppliers"],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.rpc("available_suppliers");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
    enabled: Boolean(company),
  });

  const relations = identity?.relations.filter((r) => r.buyerCompanyId === company?.companyId) ?? [];
  const suppliers = (suppliersQuery.data ?? []).filter((s) => s.id !== company?.companyId);

  async function handleRequest(sellerCompanyId: string) {
    if (!company) return;
    setBusyId(sellerCompanyId);
    const { error } = await supabase.rpc("request_supplier_relation", {
      _seller_company_id: sellerCompanyId,
      _buyer_company_id: company.companyId,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Richiesta inviata. Attendi l'approvazione del fornitore.");
  }

  if (!companyBuys(identity)) {
    return (
      <AppShell title="Fornitori" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Fornitori"
      description="Puoi collegarti a più fornitori: ogni rapporto è indipendente."
    >
      <div className="space-y-4">
        {suppliersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : suppliers.length ? (
          suppliers.map((supplier) => {
            const relation = relations.find((r) => r.sellerCompanyId === supplier.id);
            return (
              <section
                key={supplier.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="font-display text-base font-semibold">{supplier.legal_name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[supplier.city, supplier.province].filter(Boolean).join(" · ") ||
                      "Sede non indicata"}
                  </p>
                  {relation ? (
                    <p className="mt-1 text-sm font-medium">
                      {RELATION_LABEL[relation.status] ?? relation.status}
                    </p>
                  ) : null}
                </div>
                {relation ? null : (
                  <Button
                    onClick={() => handleRequest(supplier.id)}
                    disabled={!isAdmin || busyId === supplier.id}
                  >
                    Richiedi collegamento
                  </Button>
                )}
              </section>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessun fornitore disponibile al momento sulla piattaforma.
          </p>
        )}

        {isAdmin ? null : (
          <p className="text-sm text-muted-foreground">
            Solo un amministratore della tua azienda può richiedere nuovi collegamenti.
          </p>
        )}
      </div>
    </AppShell>
  );
}
