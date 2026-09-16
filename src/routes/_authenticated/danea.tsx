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
import {
  createDaneaConnection,
  revokeDaneaConnection,
  updateDaneaCredentials,
} from "@/lib/danea.functions";

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

const CARD = "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5";
const CARD_TITLE = "font-display text-sm font-semibold sm:text-base";

function DaneaPage() {
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const membership = identity?.memberships.find((m) => m.roles.includes("amministratore"));
  const companyId = membership?.companyId;
  const isAdmin = hasRole(identity, "amministratore");

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const create = useServerFn(createDaneaConnection);
  const revoke = useServerFn(revokeDaneaConnection);
  const updateCredentials = useServerFn(updateDaneaCredentials);

  const connection = useQuery({
    queryKey: ["danea", "connection", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_connections")
        .select("id, label, status, token_prefix, basic_login, basic_password_hash, detected_app_version, detected_creator, detected_default_price, detected_image_folder, last_success_at, created_at")
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
      setLoginTouched(false);
      toast.success("Nuovo indirizzo creato. Copialo e incollalo dentro Danea.");
      queryClient.invalidateQueries({ queryKey: ["danea", "connection", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const credentialsMutation = useMutation({
    mutationFn: async (input: { clear: boolean; connectionId: string }) =>
      await updateCredentials({
        data: input.clear
          ? { companyId: companyId!, connectionId: input.connectionId, clearCredentials: true }
          : {
              companyId: companyId!,
              connectionId: input.connectionId,
              ...(loginTouched ? { basicLogin: login } : {}),
              ...(password.trim() ? { basicPassword: password } : {}),
            },
      }),
    onSuccess: (_result, input) => {
      setPassword("");
      setLoginTouched(false);
      if (input.clear) setLogin("");
      toast.success(
        input.clear
          ? "Login e password rimossi. L'indirizzo non è cambiato."
          : "Login e password salvati. L'indirizzo non è cambiato.",
      );
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
  const hasCredentials = Boolean(active?.basic_login || active?.basic_password_hash);
  const canSaveCredentials = Boolean(active) && (loginTouched || password.trim().length > 0);

  return (
    <AppShell
      title="Collegamento gestionale"
      description="Ricezione dei prodotti dal gestionale Danea Easyfatt. Schermata tecnica di verifica."
    >
      <div className="grid gap-3 sm:gap-4">
        <section className={CARD}>
          <h2 className={CARD_TITLE}>Indirizzo di ricezione</h2>
          {freshUrl ? (
            <div className="mt-3 rounded-lg border border-accent bg-accent/10 p-3">
              <p className="text-sm font-medium">Copia questo indirizzo dentro Danea Easyfatt:</p>
              <p className="mt-2 break-all font-mono text-[11px] leading-snug sm:text-xs">
                {freshUrl}
              </p>
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
            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground sm:text-sm">
              <p>
                Collegamento attivo dal {new Date(active.created_at).toLocaleString("it-IT")} —
                riferimento <span className="font-mono">{active.token_prefix}…</span>
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
              <p>
                {hasCredentials
                  ? `Credenziali configurate${active.basic_login ? ` — login: ${active.basic_login}` : ""}`
                  : "Nessuna credenziale richiesta: l'indirizzo funziona senza login e password."}
              </p>
              {!freshUrl ? (
                <p>
                  L'indirizzo completo si vede solo al momento della creazione. Se l'hai perso,
                  rigenera il collegamento e reincolla il nuovo indirizzo dentro Danea.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nessun collegamento attivo.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className={CARD_TITLE}>Login e password del collegamento</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {active
              ? "Salvando le credenziali l'indirizzo resta lo stesso: non serve rifare nulla dentro Danea."
              : "Puoi indicarle subito: verranno salvate con il nuovo collegamento."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="danea-login">Login (facoltativa)</Label>
              <Input
                id="danea-login"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setLoginTouched(true);
                }}
                placeholder={active?.basic_login ?? "nessuna"}
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
                placeholder={active?.basic_password_hash ? "già impostata" : "nessuna"}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Lasciare vuoto non cancella la password salvata.
              </p>
            </div>
          </div>

          {active ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => credentialsMutation.mutate({ clear: false, connectionId: active.id })}
                disabled={!canSaveCredentials || credentialsMutation.isPending}
              >
                Salva login e password
              </Button>
              {hasCredentials ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={credentialsMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Rimuovere login e password? Il collegamento resterà attivo senza credenziali.",
                      )
                    ) {
                      credentialsMutation.mutate({ clear: true, connectionId: active.id });
                    }
                  }}
                >
                  Rimuovi credenziali
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                Crea collegamento
              </Button>
            </div>
          )}
        </section>

        {active ? (
          <section className={CARD}>
            <h2 className={CARD_TITLE}>Rigenera o revoca il collegamento</h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Rigenerando si ottiene un <strong>indirizzo nuovo</strong>: quello precedente viene
              revocato e va sostituito dentro Danea Easyfatt, altrimenti gli invii falliscono con
              l'errore «Collegamento Danea revocato». Usalo solo se hai perso l'indirizzo o vuoi
              invalidarlo.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={createMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Generare un nuovo indirizzo? Quello attuale smetterà di funzionare e dovrai aggiornarlo dentro Danea.",
                    )
                  ) {
                    createMutation.mutate();
                  }
                }}
              >
                Rigenera collegamento
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={revokeMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Revocare il collegamento? Danea non potrà più inviare prodotti finché non ne crei uno nuovo.",
                    )
                  ) {
                    revokeMutation.mutate(active.id);
                  }
                }}
              >
                Revoca collegamento
              </Button>
            </div>
          </section>
        ) : null}

        <section className={CARD}>
          <h2 className={CARD_TITLE}>Listini ricevuti da Danea</h2>
          {priceLists.data?.length ? (
            <ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-3 sm:text-sm">
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

        <section className={CARD}>
          <h2 className={CARD_TITLE}>Invii ricevuti</h2>
          {runs.data?.length ? (
            <div className="mt-3 -mx-4 max-w-full overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[36rem] text-left text-xs sm:text-sm">
                <thead className="text-[10px] uppercase text-muted-foreground sm:text-xs">
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
                      <td className="py-2 pr-3 whitespace-nowrap">
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

        <section className={CARD}>
          <h2 className={CARD_TITLE}>
            Prodotti ricevuti{" "}
            <span className="text-xs font-normal text-muted-foreground sm:text-sm">
              ({products.data?.published ?? 0} pubblicati)
            </span>
          </h2>
          {products.data?.sample.length ? (
            <>
              <div className="mt-3 -mx-4 max-w-full overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase text-muted-foreground sm:text-xs">
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
                        <td className="py-2 pr-3 font-mono text-[11px] sm:text-xs">
                          {product.code}
                        </td>
                        <td className="py-2 pr-3">{product.description ?? "—"}</td>
                        <td className="py-2 pr-3">{product.danea_um ?? "—"}</td>
                        <td className="py-2 pr-3">
                          {[product.category, product.subcategory].filter(Boolean).join(" › ") ||
                            "—"}
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
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Anteprima tecnica dei primi 20 prodotti. La pagina Prodotti definitiva arriverà dopo
                la verifica dei dati reali.
              </p>
            </>
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
