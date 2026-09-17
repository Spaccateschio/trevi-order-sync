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
  createDaneaArchive,
  createDaneaStation,
  moveDaneaStation,
  regenerateDaneaStationPassword,
  renameDaneaArchive,
  revokeDaneaStation,
} from "@/lib/danea.functions";

export const Route = createFileRoute("/_authenticated/danea")({
  head: () => ({
    meta: [
      { title: "Collegamento gestionale — Trevi Fruit" },
      {
        name: "description",
        content:
          "Postazioni Danea Easyfatt collegate a Trevi Fruit: indirizzo fisso, credenziali, invii ricevuti e prodotti.",
      },
      { property: "og:title", content: "Collegamento gestionale — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Postazioni Danea Easyfatt collegate a Trevi Fruit: indirizzo fisso, credenziali, invii ricevuti e prodotti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DaneaPage,
});

const OUTCOME_LABEL: Record<string, string> = {
  in_corso: "In corso",
  completato: "Completato",
  fallito: "Fallito",
};

const AUTH_LABEL: Record<string, string> = {
  ok: "Connessione riuscita",
  password_errata: "Password errata",
  postazione_revocata: "Postazione revocata",
  credenziali_assenti: "Credenziali non inviate",
  uso_non_consentito: "Uso non consentito",
};

const MAX_STATIONS = 5;
const DANEA_PRODUCTS_URL = "https://trevi-order-sync.lovable.app/api/public/danea/products";
const REGENERATE_WARNING =
  "La password attuale smetterà immediatamente di funzionare. Dopo la rigenerazione dovrai inserire la nuova password anche in Danea Easyfatt. Continuare?";
const MOVE_WARNING =
  "Spostando la postazione in un altro archivio, i prossimi invii aggiorneranno il catalogo di quell'archivio. Un invio completo (FULL) riconcilierà solo il nuovo archivio. Utente, password e indirizzo non cambiano. Continuare?";
const CARD = "rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4";
const CARD_TITLE = "font-display text-sm font-semibold sm:text-base";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("it-IT") : "—";
}

function DaneaPage() {
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const membership = identity?.memberships.find((m) => m.roles.includes("amministratore"));
  const companyId = membership?.companyId;
  const isAdmin = hasRole(identity, "amministratore");

  const [name, setName] = useState("");
  const [stationArchiveId, setStationArchiveId] = useState("");
  const [newArchiveName, setNewArchiveName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [fresh, setFresh] = useState<{ username: string; password: string } | null>(null);

  const createStation = useServerFn(createDaneaStation);
  const regenerate = useServerFn(regenerateDaneaStationPassword);
  const revoke = useServerFn(revokeDaneaStation);
  const createArchive = useServerFn(createDaneaArchive);
  const renameArchive = useServerFn(renameDaneaArchive);
  const moveStation = useServerFn(moveDaneaStation);

  const archives = useQuery({
    queryKey: ["danea", "archives", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_archives")
        .select("id, name, notes, is_default, status, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const stations = useQuery({
    queryKey: ["danea", "stations", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_stations")
        .select(
          "id, archive_id, name, username, status, last_auth_at, last_auth_outcome, last_success_at, detected_creator, detected_app_version, created_at",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
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
          "id, mode, source, outcome, received_count, created_count, updated_count, unpublished_count, skipped_count, duplicate_payload, error_message, started_at",
        )
        .eq("company_id", companyId!)
        .order("started_at", { ascending: false })
        .limit(10);
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

  const refreshStations = () =>
    queryClient.invalidateQueries({ queryKey: ["danea", "stations", companyId] });
  const refreshArchives = () =>
    queryClient.invalidateQueries({ queryKey: ["danea", "archives", companyId] });

  const createArchiveMutation = useMutation({
    mutationFn: async () =>
      await createArchive({ data: { companyId: companyId!, name: newArchiveName } }),
    onSuccess: () => {
      setNewArchiveName("");
      toast.success("Archivio Danea creato.");
      refreshArchives();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const renameArchiveMutation = useMutation({
    mutationFn: async (vars: { archiveId: string; name: string }) =>
      await renameArchive({ data: { companyId: companyId!, ...vars } }),
    onSuccess: () => {
      setRenamingId(null);
      toast.success("Archivio rinominato.");
      refreshArchives();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveStationMutation = useMutation({
    mutationFn: async (vars: { stationId: string; archiveId: string }) =>
      await moveStation({ data: { companyId: companyId!, ...vars } }),
    onSuccess: () => {
      toast.success("Postazione spostata. Utente, password e indirizzo non cambiano.");
      refreshStations();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      await createStation({ data: { companyId: companyId!, archiveId: stationArchiveId, name } }),
    onSuccess: (result) => {
      setFresh({ username: result.username, password: result.password });
      setName("");
      toast.success("Postazione creata. Copia utente e password: la password si vede una volta.");
      refreshStations();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (stationId: string) =>
      await regenerate({ data: { companyId: companyId!, stationId } }),
    onSuccess: (result) => {
      setFresh({ username: result.username, password: result.password });
      toast.success("Nuova password generata. L'indirizzo e l'utente non cambiano.");
      refreshStations();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (stationId: string) =>
      await revoke({ data: { companyId: companyId!, stationId } }),
    onSuccess: () => {
      toast.success("Postazione revocata. Le altre postazioni continuano a funzionare.");
      refreshStations();
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

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiato.`);
  };

  const handleRegenerate = (stationId: string) => {
    if (window.confirm(REGENERATE_WARNING)) {
      regenerateMutation.mutate(stationId);
    }
  };

  const list = stations.data ?? [];
  const activeCount = list.filter((s) => s.status === "attivo").length;
  const archiveList = archives.data ?? [];
  const activeArchives = archiveList.filter((a) => a.status === "attivo");
  const defaultArchiveId =
    activeArchives.find((a) => a.is_default)?.id ?? activeArchives[0]?.id ?? "";
  const chosenArchiveId = stationArchiveId || defaultArchiveId;
  const archiveNameById = new Map(archiveList.map((a) => [a.id, a.name]));

  return (
    <AppShell
      title="Collegamento gestionale"
      description="Ricezione dei prodotti da Danea Easyfatt tramite postazioni con utente e password."
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`}>
          <h2 className={CARD_TITLE}>Indirizzo prodotti (fisso)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Uguale per tutte le aziende e sempre lo stesso: non cambia creando, rigenerando o
            revocando una postazione. Dentro Danea si aggiornano solo utente e password.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-snug sm:text-xs">
              {DANEA_PRODUCTS_URL}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copy(DANEA_PRODUCTS_URL, "Indirizzo")}
            >
              Copia
            </Button>
          </div>
        </section>

        <section className={CARD}>
          <h2 className={CARD_TITLE}>Aggiungi postazione</h2>
          <div className="mt-2 grid gap-2">
            <Label htmlFor="station-name" className="text-xs">
              Nome postazione
            </Label>
            <Input
              id="station-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PC Ufficio"
              maxLength={60}
            />
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={
                !name.trim() || createMutation.isPending || activeCount >= MAX_STATIONS
              }
            >
              Aggiungi postazione
            </Button>
            <p className="text-xs text-muted-foreground">
              {activeCount}/{MAX_STATIONS} postazioni attive.
            </p>
          </div>
        </section>

        {fresh ? (
          <section className="rounded-xl border border-accent bg-accent/10 p-3 lg:col-span-3">
            <h2 className={CARD_TITLE}>Credenziali della postazione</h2>
            <p className="mt-1 text-xs font-medium">
              La password è visibile una sola volta: copiala subito dentro Danea Easyfatt.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-card px-2 py-1.5 font-mono text-xs">
                  {fresh.username}
                </code>
                <Button size="sm" variant="secondary" onClick={() => copy(fresh.username, "Utente")}>
                  Copia utente
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-card px-2 py-1.5 font-mono text-xs">
                  {fresh.password}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copy(fresh.password, "Password")}
                >
                  Copia password
                </Button>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFresh(null)}>
              Ho copiato, nascondi
            </Button>
          </section>
        ) : null}

        <section className={`${CARD} lg:col-span-3`}>
          <h2 className={CARD_TITLE}>Postazioni Danea</h2>
          {list.length ? (
            <>
              {/* Telefono: schede al posto della tabella */}
              <ul className="mt-2 grid gap-2 md:hidden">
                {list.map((station) => (
                  <li key={station.id} className="rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{station.name}</span>
                      <span className="text-muted-foreground">
                        {station.status === "attivo" ? "Attiva" : "Revocata"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px]">{station.username}</p>
                    <p className="mt-1 text-muted-foreground">
                      Ultima connessione: {when(station.last_auth_at)}
                      {station.last_auth_outcome
                        ? ` — ${AUTH_LABEL[station.last_auth_outcome] ?? station.last_auth_outcome}`
                        : ""}
                    </p>
                    <p className="text-muted-foreground">
                      Ultimo invio: {when(station.last_success_at)}
                    </p>
                    {station.status === "attivo" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={regenerateMutation.isPending}
                          onClick={() => handleRegenerate(station.id)}
                        >
                          Rigenera password
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={revokeMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Revocare la postazione "${station.name}"?`)) {
                              revokeMutation.mutate(station.id);
                            }
                          }}
                        >
                          Revoca
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="mt-2 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[46rem] text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase text-muted-foreground sm:text-xs">
                    <tr>
                      <th className="py-1.5 pr-3">Postazione</th>
                      <th className="py-1.5 pr-3">Utente</th>
                      <th className="py-1.5 pr-3">Stato</th>
                      <th className="py-1.5 pr-3">Ultima connessione</th>
                      <th className="py-1.5 pr-3">Ultimo esito</th>
                      <th className="py-1.5 pr-3">Ultimo invio</th>
                      <th className="py-1.5">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((station) => (
                      <tr key={station.id} className="border-t border-border">
                        <td className="py-1.5 pr-3">{station.name}</td>
                        <td className="py-1.5 pr-3 font-mono text-[11px] sm:text-xs">
                          {station.username}
                        </td>
                        <td className="py-1.5 pr-3">
                          {station.status === "attivo" ? "Attiva" : "Revocata"}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {when(station.last_auth_at)}
                        </td>
                        <td className="py-1.5 pr-3">
                          {station.last_auth_outcome
                            ? (AUTH_LABEL[station.last_auth_outcome] ?? station.last_auth_outcome)
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {when(station.last_success_at)}
                        </td>
                        <td className="py-1.5">
                          {station.status === "attivo" ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={regenerateMutation.isPending}
                                onClick={() => handleRegenerate(station.id)}
                              >
                                Rigenera password
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={revokeMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Revocare la postazione "${station.name}"?`)) {
                                    revokeMutation.mutate(station.id);
                                  }
                                }}
                              >
                                Revoca
                              </Button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nessuna postazione: aggiungine una e inserisci utente e password dentro Danea.
            </p>
          )}
        </section>

        <section className={CARD}>
          <h2 className={CARD_TITLE}>Listini ricevuti</h2>
          {priceLists.data?.length ? (
            <ul className="mt-2 grid gap-1 text-xs">
              {priceLists.data.map((item) => (
                <li key={item.list_number} className="text-muted-foreground">
                  Listino {item.list_number}:{" "}
                  <span className="text-foreground">
                    {item.display_name ?? item.danea_name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Compariranno dopo il primo invio da Danea.
            </p>
          )}
        </section>

        <section className={`${CARD} lg:col-span-2`}>
          <h2 className={CARD_TITLE}>Invii ricevuti</h2>
          {runs.data?.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead className="text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">Data</th>
                    <th className="py-1.5 pr-3">Tipo</th>
                    <th className="py-1.5 pr-3">Origine</th>
                    <th className="py-1.5 pr-3">Esito</th>
                    <th className="py-1.5 pr-3">Ricevuti</th>
                    <th className="py-1.5 pr-3">Nuovi</th>
                    <th className="py-1.5 pr-3">Aggiornati</th>
                    <th className="py-1.5 pr-3">Depubblicati</th>
                    <th className="py-1.5">Segnalazioni</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{when(run.started_at)}</td>
                      <td className="py-1.5 pr-3">
                        {run.mode === "full" ? "Completo" : "Incrementale"}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {run.source === "manuale" ? "Importazione manuale" : "Postazione Danea"}
                      </td>
                      <td className="py-1.5 pr-3">
                        {OUTCOME_LABEL[run.outcome] ?? run.outcome}
                        {run.duplicate_payload ? " (doppione)" : ""}
                      </td>
                      <td className="py-1.5 pr-3">{run.received_count}</td>
                      <td className="py-1.5 pr-3">{run.created_count}</td>
                      <td className="py-1.5 pr-3">{run.updated_count}</td>
                      <td className="py-1.5 pr-3">{run.unpublished_count}</td>
                      <td className="py-1.5">{run.skipped_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nessun invio ricevuto finora.</p>
          )}
        </section>

        <section className={`${CARD} lg:col-span-3`}>
          <h2 className={CARD_TITLE}>
            Prodotti ricevuti{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({products.data?.published ?? 0} pubblicati)
            </span>
          </h2>
          {products.data?.sample.length ? (
            <>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3">Codice</th>
                      <th className="py-1.5 pr-3">Descrizione</th>
                      <th className="py-1.5 pr-3">U.M.</th>
                      <th className="py-1.5 pr-3">Categoria</th>
                      <th className="py-1.5 pr-3">IVA</th>
                      <th className="py-1.5">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.data.sample.map((product) => (
                      <tr key={product.id} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-mono text-[11px]">{product.code}</td>
                        <td className="py-1.5 pr-3">{product.description ?? "—"}</td>
                        <td className="py-1.5 pr-3">{product.danea_um ?? "—"}</td>
                        <td className="py-1.5 pr-3">
                          {[product.category, product.subcategory].filter(Boolean).join(" › ") ||
                            "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {product.vat_perc !== null ? `${product.vat_perc}%` : "—"}
                        </td>
                        <td className="py-1.5">
                          {product.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Anteprima tecnica dei primi 20 prodotti: la pagina Prodotti definitiva arriverà più
                avanti.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nessun prodotto ricevuto: esegui un invio completo da Danea.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
