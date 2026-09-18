import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  activeCompany,
  companyBuys,
  isRelationOperational,
  useIdentity,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/acquisti/catalogo/")({
  head: () => ({
    meta: [
      { title: "Catalogo fornitori — Trevi Fruit" },
      {
        name: "description",
        content:
          "Le vetrine dei fornitori con cui hai un collegamento attivo: prodotti, foto, unità di misura e prezzi assegnati.",
      },
      { property: "og:title", content: "Catalogo fornitori — Trevi Fruit" },
      {
        property: "og:description",
        content: "Le vetrine dei fornitori con cui hai un collegamento attivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogoIndex,
});

function CatalogoIndex() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const buyerId = company?.companyId ?? null;

  const relations = (identity?.relations ?? []).filter((r) => r.buyerCompanyId === buyerId);
  const operational = relations.filter(isRelationOperational);
  const suspended = relations.filter(
    (r) => !isRelationOperational(r) && (r.status === "attivo" || r.status === "sospeso"),
  );
  const sellerIds = operational.map((r) => r.sellerCompanyId);

  const countsQuery = useQuery({
    queryKey: ["catalogo-conteggi", buyerId, sellerIds.join(",")],
    enabled: sellerIds.length > 0,
    queryFn: async () => {
      const counts = new Map<string, number>();
      for (const sellerId of sellerIds) {
        const { count, error } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("company_id", sellerId)
          .eq("publish_status", "pubblicato")
          .eq("b2b_visible", true);
        if (error) throw new Error(error.message);
        counts.set(sellerId, count ?? 0);
      }
      return counts;
    },
  });

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Catalogo" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda. Un amministratore può attivarlo
          dalla pagina Azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Catalogo" description="I fornitori collegati e i loro prodotti in vetrina.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : operational.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operational.map((relation) => (
            <Link
              key={relation.id}
              to="/acquisti/catalogo/$sellerId"
              params={{ sellerId: relation.sellerCompanyId }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-accent"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15">
                <Store className="h-4 w-4 text-accent" aria-hidden="true" />
              </span>
              <span className="mt-3 block font-semibold">
                {relation.sellerCompanyName ?? "Fornitore"}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {countsQuery.isLoading
                  ? "Conteggio prodotti…"
                  : `${countsQuery.data?.get(relation.sellerCompanyId) ?? 0} prodotti in vetrina`}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Non hai ancora fornitori collegati e operativi: il catalogo compare appena un
            collegamento è attivo dai due lati.
          </p>
          <Button asChild size="sm">
            <Link to="/collegamenti">Vai a Collegamenti</Link>
          </Button>
        </section>
      )}

      {suspended.length ? (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Cataloghi non disponibili</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {suspended.map((relation) => (
              <li key={relation.id}>
                {relation.sellerCompanyName ?? "Fornitore"} — collegamento sospeso da uno dei due
                lati
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
