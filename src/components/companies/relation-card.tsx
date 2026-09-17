import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  identityQueryKey,
  isRelationOperational,
  type Relation,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export type RelationSide = "venditore" | "acquirente";

type Props = {
  relation: Relation;
  /** Lato dal quale l'azienda dell'utente guarda il rapporto. */
  side: RelationSide;
  isAdmin: boolean;
};

function statusLabel(relation: Relation, side: RelationSide) {
  if (relation.status === "in_attesa") {
    const waitingOnMe =
      (relation.origin === "richiesta_cliente" && side === "venditore") ||
      (relation.origin === "invito_fornitore" && side === "acquirente");
    return waitingOnMe ? "In attesa della tua risposta" : "In attesa di risposta";
  }
  if (relation.status === "rifiutato") return "Richiesta rifiutata";
  if (relation.status === "revocato") return "Collegamento chiuso";
  if (relation.status === "sospeso") return "Collegamento sospeso";
  if (isRelationOperational(relation)) return "Collegamento attivo";
  if (!relation.sellerEnabled && !relation.buyerEnabled) return "Sospeso da entrambe le aziende";
  return relation.sellerEnabled ? "Sospeso dal cliente" : "Sospeso dal fornitore";
}

export function RelationCard({ relation, side, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const partnerName =
    side === "venditore"
      ? relation.buyerCompanyName ?? "Cliente"
      : relation.sellerCompanyName ?? "Fornitore";

  const myEnabled = side === "venditore" ? relation.sellerEnabled : relation.buyerEnabled;
  const canDecide =
    relation.status === "in_attesa" &&
    ((relation.origin === "richiesta_cliente" && side === "venditore") ||
      (relation.origin === "invito_fornitore" && side === "acquirente"));

  async function run(action: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success(ok);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold">{partnerName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{statusLabel(relation, side)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canDecide && isAdmin ? (
          <>
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
          </>
        ) : null}

        {relation.status === "attivo" ? (
          <label className="flex items-center gap-2 text-sm">
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
            <span className="text-muted-foreground">Il mio lato</span>
          </label>
        ) : null}
      </div>
    </section>
  );
}
