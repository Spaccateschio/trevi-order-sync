import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasRole, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { createDaneaConnection, revokeDaneaConnection } from "@/lib/danea.functions";

export const Route = createFileRoute("/_authenticated/danea")({
  head: () => ({
    meta: [
      { title: "Collegamento gestionale — Trevi Fruit" },
      {
        name: "description",
        content:
          "Collegamento tra il gestionale Danea Easyfatt e Trevi Fruit: stato, invii ricevuti e prodotti.",
      },
      { property: "og:title", content: "Collegamento gestionale — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Collegamento tra il gestionale Danea Easyfatt e Trevi Fruit: stato, invii ricevuti e prodotti.",
      },
    ],
  }),
  component: DaneaPage,
});

const OUTCOME_LABEL: Record<string, string> = {
  in_corso: "In corso",
  completato: "Completato",
  fallito: "Fallito",
};

function DaneaPage() {
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const membership = identity?.memberships.find((m) => m.roles.includes("amministratore"));
  const companyId = membership?.companyId;
  const isAdmin = hasRole(identity, "amministratore");

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const create = useServerFn(createDaneaConnection);
  const revoke = useServerFn(revokeDaneaConnection);

  const connection = useQuery({
    queryKey: ["danea", "connection", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_connections")
        .select("id, label, status, token_prefix, basic_login, detected_app_version, detected_creator, detected_default_price, detected_image_folder, last_success_at, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const priceLists = useQuery({
    queryKey: ["danea", "price-lists", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_price_lists")
        .select("list_number, danea_name, display_name")
        .eq("company_id", companyId!)
        .order("list_number");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const runs = useQuery({
    queryKey: ["danea", "runs", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_sync_runs")
        .select(
          "id, mode, outcome, received_count, created_count, updated_count, unpublished_count, skipped_count, duplicate_payload, error_message, started_at, finished_at",
        )
        .eq("company_id", companyId!)
        .order("started_at", { ascending: false })
        .limit(15);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const products = useQuery({
    queryKey: ["danea", "products", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const [countRes, sampleRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("publish_status", "pubblicato"),
        supabase
          .from("products")
          .select("id, code, description, danea_um, category, subcategory, vat_perc, publish_status")
          .eq("company_id", companyId!)
          .order("code")
          .limit(20),
      ]);
      if (sampleRes.error) throw new Error(sampleRes.error.message);
      return { published: countRes.count ?? 0, sample: sampleRes.data ?? [] };
    },
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      await create({
        data: {
          companyId: companyId!,
          basicLogin: login.trim() || undefined,
          basicPassword: password.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      setFreshUrl(`${window.location.origin}${result.path}`);
      setPassword("");
      toast.success("Collegamento creato. Copia subito l'indirizzo: non sarà più visibile.");
      queryClient.invalidateQueries({ queryKey: ["danea", "connection", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (connectionId: string) =>
      await revoke({ data: { companyId: companyId!, connectionId } }),
    onSuccess: () => {
      setFreshUrl(null);
      toast.success("Collegamento revocato.");
      queryClient.invalidateQueries({ queryKey: ["danea", "connection", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin || !companyId) {
    return (
      <AppShell title="Collegamento gestionale">
        <p className="text-sm text-muted-foreground">
          Questa area è riservata agli amministratori dell'azienda.
        </p>
      </AppShell>
    );
  }

  const active = connection.data?.status === "attivo" ? connection.data : null;

  return (
    <AppShell
      title="Collegamento gestionale"
      description="Ricezione dei prodotti dal gestionale Danea Easyfatt. Schermata tecnica di verifica."
    >
      <div className="grid gap-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Indirizzo di ricezione</h2>
          {freshUrl ? (
            <div className="mt-3 rounded-lg border border-accent bg-accent/10 p-3">
              <p className="text-sm font-medium">Copia questo indirizzo dentro Danea Easyfatt:</p>
              <p className="mt-2 break-all font-mono text-xs">{freshUrl}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  navigator.clipboard.writeText(freshUrl);
                  toast.success("Indirizzo copiato.");
                }}
              >
                Copia indirizzo
              </Button>
            </div>
          ) : null}

          {active ? (
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                Collegamento attivo dal{" "}
                {new Date(active.created_at).toLocaleString("it-IT")} — riferimento{" "}
                <span className="font-mono">{active.token_prefix}…</span>
              </p>
              <p>
                Ultimo invio ricevuto:{" "}
                {active.last_success_at
                  ? new Date(active.last_success_at).toLocaleString("it-IT")
                  : "nessuno"}
              </p>
              {active.detected_creator ? (
                <p>
                  Rilevato da Danea: {active.detected_creator} (protocollo{" "}
                  {active.detected_app_version ?? "n.d."}, listino predefinito{" "}
                  {active.detected_default_price ?? "n.d."})
                </p>
              ) : null}
              {active.basic_login ? <p>Login richiesta: {active.basic_login}</p> : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => revokeMutation.mutate(active.id)}
                disabled={revokeMutation.isPending}
              >
                Revoca collegamento
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nessun collegamento attivo.</p>
          )}

          <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="danea-login">Login (facoltativa)</Label>
              <Input
                id="danea-login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="danea-password">Password (facoltativa)</Label>
              <Input
                id="danea-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {active ? "Rigenera collegamento" : "Crea collegamento"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Rigenerando, il collegamento precedente viene revocato.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Listini ricevuti da Danea</h2>
          {priceLists.data?.length ? (
            <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-3">
              {priceLists.data.map((list) => (
                <li key={list.list_number} className="text-muted-foreground">
                  Listino {list.list_number}:{" "}
                  <span className="text-foreground">
                    {list.display_name ?? list.danea_name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nessun listino ricevuto: compariranno dopo il primo invio.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Invii ricevuti</h2>
          {runs.data?.length ? (
            <div className="mt-3 -mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Esito</th>
                    <th className="py-2 pr-3">Ricevuti</th>
                    <th className="py-2 pr-3">Nuovi</th>
                    <th className="py-2 pr-3">Aggiornati</th>
                    <th className="py-2 pr-3">Depubblicati</th>
                    <th className="py-2 pr-3">Segnalazioni</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="py-2 pr-3">
                        {new Date(run.started_at).toLocaleString("it-IT")}
                      </td>
                      <td className="py-2 pr-3">
                        {run.mode === "full" ? "Completo" : "Incrementale"}
                      </td>
                      <td className="py-2 pr-3">
                        {OUTCOME_LABEL[run.outcome] ?? run.outcome}
                        {run.duplicate_payload ? " (doppione)" : ""}
                      </td>
                      <td className="py-2 pr-3">{run.received_count}</td>
                      <td className="py-2 pr-3">{run.created_count}</td>
                      <td className="py-2 pr-3">{run.updated_count}</td>
                      <td className="py-2 pr-3">{run.unpublished_count}</td>
                      <td className="py-2 pr-3">{run.skipped_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nessun invio ricevuto finora.</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">
            Prodotti ricevuti{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({products.data?.published ?? 0} pubblicati)
            </span>
          </h2>
          {products.data?.sample.length ? (
            <div className="mt-3 -mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Codice</th>
                    <th className="py-2 pr-3">Descrizione</th>
                    <th className="py-2 pr-3">U.M.</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3">IVA</th>
                    <th className="py-2 pr-3">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {products.data.sample.map((product) => (
                    <tr key={product.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono text-xs">{product.code}</td>
                      <td className="py-2 pr-3">{product.description ?? "—"}</td>
                      <td className="py-2 pr-3">{product.danea_um ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {[product.category, product.subcategory].filter(Boolean).join(" › ") || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {product.vat_perc !== null ? `${product.vat_perc}%` : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {product.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Anteprima tecnica dei primi 20 prodotti. La pagina Prodotti definitiva arriverà dopo
                la verifica dei dati reali.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nessun prodotto ricevuto: comparirà dopo il primo invio da Danea.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
