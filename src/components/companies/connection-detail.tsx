import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { ConnectionRow } from "@/components/companies/connections-table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { identityQueryKey } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  row: ConnectionRow | null;
  isAdmin: boolean;
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
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function ConnectionDetail({ row, isAdmin, onClose }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const relation = row?.relation ?? null;

  const details = useQuery({
    queryKey: ["relation-detail", relation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_customer_relations")
        .select("requested_at, accepted_at, decided_at")
        .eq("id", relation!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(relation),
  });

  const partnerId = row
    ? row.side === "venditore"
      ? row.relation.buyerCompanyId
      : row.relation.sellerCompanyId
    : null;

  const partner = useQuery({
    queryKey: ["relation-partner", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("legal_name, vat_number, city, province")
        .eq("id", partnerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(partnerId),
  });

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    await queryClient.invalidateQueries({ queryKey: ["relation-detail"] });
    toast.success(ok);
  }

  if (!row || !relation) return null;

  const myEnabled = row.side === "venditore" ? relation.sellerEnabled : relation.buyerEnabled;
  const partnerEnabled = row.side === "venditore" ? relation.buyerEnabled : relation.sellerEnabled;
  const canDecide =
    relation.status === "in_attesa" &&
    ((relation.origin === "richiesta_cliente" && row.side === "venditore") ||
      (relation.origin === "invito_fornitore" && row.side === "acquirente"));
  const canClose = isAdmin && (relation.status === "attivo" || relation.status === "sospeso");

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.partnerName}</SheetTitle>
          <SheetDescription>{row.relationshipLabel} · {row.statusLabel}</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <Field label="Ragione sociale" value={partner.data?.legal_name ?? row.partnerName} />
          <Field label="Partita IVA" value={partner.data?.vat_number ?? "Non visibile"} />
          <Field
            label="Sede"
            value={[partner.data?.city, partner.data?.province].filter(Boolean).join(" · ")}
          />
          <Field label="Rapporto" value={row.relationshipLabel} />
          <Field label="Stato" value={row.statusLabel} />
          <Field label="Il mio lato" value={myEnabled ? "Attivo" : "Sospeso"} />
          <Field label="Lato partner" value={partnerEnabled ? "Attivo" : "Sospeso"} />
          <Field
            label="Origine"
            value={
              relation.origin === "invito_fornitore"
                ? "Invito inviato dal venditore"
                : "Richiesta inviata dall'acquirente"
            }
          />
          <Field label="Richiesta del" value={formatDate(details.data?.requested_at ?? null)} />
          <Field label="Collegato dal" value={formatDate(details.data?.accepted_at ?? null)} />
          <Field label="Decisione del" value={formatDate(details.data?.decided_at ?? null)} />
          {relation.customerRecordId ? (
            <Field
              label="Cliente d'anagrafica collegato"
              value={
                <Link to="/vendite/clienti" className="underline">
                  Apri la scheda cliente
                </Link>
              }
            />
          ) : null}
        </div>

        <div className="mt-6 space-y-3">
          {canDecide && isAdmin ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
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
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
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

          {relation.status === "attivo" ? (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <span>
                Il mio lato
                <span className="block text-xs text-muted-foreground">
                  Sospendendolo il rapporto resta, ma non è operativo.
                </span>
              </span>
              <Switch
                checked={myEnabled}
                disabled={busy || !isAdmin}
                onCheckedChange={(value) =>
                  run(
                    () =>
                      supabase.rpc("set_relation_side_enabled", {
                        _relation_id: relation.id,
                        _enabled: value,
                      }),
                    value ? "Il tuo lato è attivo." : "Il tuo lato è sospeso.",
                  )
                }
              />
            </label>
          ) : null}

          {canClose ? (
            <Button
              variant="outline"
              className="w-full text-destructive"
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
                ).then(onClose);
              }}
            >
              Chiudi collegamento
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
