import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, PauseCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CompanyAvatar,
  RelationPill,
  StatusPill,
  type ConnectionRow,
} from "@/components/companies/connections-table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { identityQueryKey } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  row: ConnectionRow | null;
  isAdmin: boolean;
  dates: { requestedAt: string | null; acceptedAt: string | null; updatedAt: string | null } | null;
  onClose: () => void;
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

export function ConnectionDetail({ row, isAdmin, dates, onClose }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    await queryClient.invalidateQueries({ queryKey: ["relation-meta"] });
    toast.success(ok);
    return true;
  }

  if (!row) return null;
  const relation = row.relation;
  const partnerEnabled = row.partnerSideEnabled;
  const canDecide =
    relation.status === "in_attesa" &&
    ((relation.origin === "richiesta_cliente" && row.side === "venditore") ||
      (relation.origin === "invito_fornitore" && row.side === "acquirente"));
  const canClose = isAdmin && (relation.status === "attivo" || relation.status === "sospeso");

  /** Cronologia derivata dalle date già presenti sul rapporto: nessun dato nuovo. */
  const events = [
    { label: "Richiesta di collegamento", date: dates?.requestedAt ?? null },
    { label: "Collegamento accettato", date: dates?.acceptedAt ?? null },
    { label: "Ultima attività", date: dates?.updatedAt ?? null },
  ].filter((event) => event.date);

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-0">
          <div className="flex items-start gap-3">
            <CompanyAvatar className="size-12" />
            <div className="min-w-0">
              <SheetTitle className="truncate text-left">{row.partnerName}</SheetTitle>
              <div className="mt-1">
                <StatusPill row={row} />
              </div>
              {row.partnerVat ? (
                <p className="mt-1 text-sm text-muted-foreground">P.IVA {row.partnerVat}</p>
              ) : null}
              {row.partnerPlace ? (
                <p className="text-sm text-muted-foreground">{row.partnerPlace}</p>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="dettagli" className="mt-4 flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dettagli">Dettagli</TabsTrigger>
            <TabsTrigger value="note">Note</TabsTrigger>
            <TabsTrigger value="cronologia">Cronologia</TabsTrigger>
          </TabsList>

          <TabsContent value="dettagli" className="mt-2">
            <div>
              <Field label="Rapporto" value={<RelationPill label={row.relationshipLabel} />} />
              <Field label="Stato" value={<StatusPill row={row} />} />
              <Field
                label="Il mio lato"
                value={
                  relation.status === "attivo" ? (
                    <span className="flex items-center gap-2">
                      <Switch
                        checked={row.mySideEnabled}
                        disabled={busy || !isAdmin}
                        aria-label="Il mio lato"
                        onCheckedChange={(value) =>
                          void run(
                            () =>
                              supabase.rpc("set_relation_side_enabled", {
                                _relation_id: relation.id,
                                _enabled: value,
                              }),
                            value ? "Il tuo lato è attivo." : "Il tuo lato è sospeso.",
                          )
                        }
                      />
                      {row.mySideEnabled ? "Attivo" : "Sospeso"}
                    </span>
                  ) : row.mySideEnabled ? (
                    "Attivo"
                  ) : (
                    "Sospeso"
                  )
                }
              />
              <Field
                label="Lato partner"
                value={
                  <span className="flex items-center gap-2" title="Gestito dall'azienda partner">
                    <Switch checked={partnerEnabled} disabled aria-label="Lato partner" />
                    {partnerEnabled ? "Attivo" : "Sospeso"}
                  </span>
                }
              />
              <Field
                label="Origine"
                value={
                  relation.origin === "invito_fornitore"
                    ? "Invito da Trevi Fruit"
                    : "Richiesta dell'acquirente"
                }
              />
              <Field label="Richiesta" value={formatDate(dates?.requestedAt ?? null)} />
              <Field label="Accettazione" value={formatDate(dates?.acceptedAt ?? null)} />
              <Field label="Ultima attività" value={formatDate(dates?.updatedAt ?? null)} />
            </div>

            {relation.customerRecordId ? (
              <div className="mt-5 rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cliente associato
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{row.partnerName}</span>
                  <Link
                    to="/vendite/clienti"
                    className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline"
                  >
                    Vai alla scheda <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="note" className="mt-2">
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Le note sul collegamento arriveranno prossimamente.
            </p>
          </TabsContent>

          <TabsContent value="cronologia" className="mt-2">
            {events.length ? (
              <ol className="space-y-0">
                {events.map((event, index) => (
                  <li key={event.label} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className="flex flex-col items-center">
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                      {index < events.length - 1 ? (
                        <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                      ) : null}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{event.label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {formatDate(event.date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nessun evento registrato per questo collegamento.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-6 space-y-2">
          {canDecide && isAdmin ? (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      supabase.rpc("decide_company_relation", {
                        _relation_id: relation.id,
                        _accept: true,
                      }),
                    "Collegamento attivato.",
                  )
                }
              >
                Accetta
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      supabase.rpc("decide_company_relation", {
                        _relation_id: relation.id,
                        _accept: false,
                      }),
                    "Richiesta rifiutata.",
                  )
                }
              >
                Rifiuta
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {relation.status === "attivo" && isAdmin ? (
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      supabase.rpc("set_relation_side_enabled", {
                        _relation_id: relation.id,
                        _enabled: !row.mySideEnabled,
                      }),
                    row.mySideEnabled ? "Il tuo lato è sospeso." : "Il tuo lato è attivo.",
                  )
                }
              >
                <PauseCircle className="size-4" />
                {row.mySideEnabled ? "Sospendi il mio lato" : "Riattiva il mio lato"}
              </Button>
            ) : null}
            {canClose ? (
              <Button
                variant="outline"
                className="flex-1 border-destructive/40 text-destructive"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Chiudere il collegamento con ${row.partnerName}? Non si perde nessun dato: potrai ricollegarti con un nuovo invito.`,
                    )
                  )
                    return;
                  void run(
                    () => supabase.rpc("revoke_company_relation", { _relation_id: relation.id }),
                    "Collegamento chiuso.",
                  ).then((ok) => (ok ? onClose() : undefined));
                }}
              >
                <Trash2 className="size-4" />
                Chiudi collegamento
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
