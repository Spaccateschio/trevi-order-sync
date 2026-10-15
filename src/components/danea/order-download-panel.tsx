import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const DANEA_ORDERS_URL = "https://trevi-order-sync.lovable.app/api/public/danea/orders";

const CARD = "rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4 lg:col-span-3";
const OUTCOME: Record<string, string> = {
  scaricato: "Scaricato da Danea",
  nessun_ordine: "Nessun ordine da scaricare",
  fallito: "Errore",
};

const when = (v: string | null) => (v ? new Date(v).toLocaleString("it-IT") : "—");

type ExportedOrder = {
  id: string;
  number: string | null;
  status: string;
  danea_exported_at: string;
  customer_modified_at: string | null;
  cancelled_at: string | null;
  companies: { legal_name: string | null } | null;
};

/**
 * Scarico ordini B2B in Danea: indirizzo fisso, storico richieste,
 * ordini scaricati e comando amministrativo «Rimetti in scarico».
 */
export function DaneaOrderDownloadPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [requeue, setRequeue] = useState<ExportedOrder | null>(null);
  const [reason, setReason] = useState("");

  const exportsQuery = useQuery({
    queryKey: ["danea", "order-exports", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_order_exports")
        .select("id, outcome, order_count, excluded, error_message, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["danea", "exported-orders", companyId],
    queryFn: async (): Promise<ExportedOrder[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "id, number, status, danea_exported_at, customer_modified_at, cancelled_at, companies!purchase_orders_company_id_fkey(legal_name), supplier_customer_relations!inner(seller_company_id)",
        )
        .eq("supplier_customer_relations.seller_company_id", companyId)
        .not("danea_exported_at", "is", null)
        .order("danea_exported_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ExportedOrder[];
    },
  });

  const requeueMutation = useMutation({
    mutationFn: async (vars: { orderId: string; reason: string }) => {
      const { error } = await supabase.rpc("danea_requeue_order", {
        _order_id: vars.orderId,
        _reason: vars.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Ordine rimesso in scarico: Danea lo riceverà al prossimo «Scarica».");
      setRequeue(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["danea", "exported-orders", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastExcluded = (exportsQuery.data ?? []).find(
    (e) => Array.isArray(e.excluded) && e.excluded.length,
  );

  return (
    <section className={CARD}>
      <h2 className="font-display text-sm font-semibold sm:text-base">Scarico ordini in Danea</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        In Danea: Strumenti → Scarica ordini da e-commerce → Impostazioni. Inserisci questo
        indirizzo e utente e password di una postazione con uso «Scarico ordini». Escono solo gli
        ordini B2B inviati dai clienti, non annullati e non ancora scaricati.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] sm:text-xs">
          {DANEA_ORDERS_URL}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(DANEA_ORDERS_URL);
            toast.success("Indirizzo copiato.");
          }}
        >
          Copia
        </Button>
      </div>
      <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
        «Scaricato da Danea» significa che Trevi Fruit ha consegnato l'ordine a Danea: non prova
        che Danea l'abbia importato. Se in Danea l'ordine non compare, usa «Rimetti in scarico».
      </p>

      {lastExcluded ? (
        <div className="mt-3 rounded-md border border-destructive/40 p-2 text-xs">
          <p className="font-medium text-destructive">Ordini non scaricati per dati mancanti</p>
          <ul className="mt-1 grid gap-1">
            {(lastExcluded.excluded as { number: string | null; reasons: string[] }[]).map((x, i) => (
              <li key={i}>
                <span className="font-medium">{x.number ?? "Ordine"}</span>: {x.reasons.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Ultime richieste di Danea</h3>
      {exportsQuery.data?.length ? (
        <ul className="mt-1 grid gap-1 text-xs">
          {exportsQuery.data.map((e) => (
            <li key={e.id}>
              {when(e.created_at)} — {OUTCOME[e.outcome] ?? e.outcome}
              {e.outcome === "scaricato" ? ` (${e.order_count} ordini)` : ""}
              {e.error_message ? ` — ${e.error_message}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Nessuna richiesta ricevuta.</p>
      )}

      <h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Ordini scaricati da Danea</h3>
      {ordersQuery.data?.length ? (
        <ul className="mt-1 grid gap-1.5 text-xs">
          {ordersQuery.data.map((o) => {
            const cancelledAfter = o.status === "annullato";
            const modifiedAfter =
              !cancelledAfter &&
              o.customer_modified_at &&
              new Date(o.customer_modified_at) > new Date(o.danea_exported_at);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <span className="font-medium">{o.number}</span>
                <span>{o.companies?.legal_name ?? ""}</span>
                <span className="text-muted-foreground">Scaricato da Danea il {when(o.danea_exported_at)}</span>
                {modifiedAfter ? (
                  <span className="text-destructive">Ordine modificato dopo lo scarico in Danea</span>
                ) : null}
                {cancelledAfter ? (
                  <span className="text-destructive">
                    Ordine annullato dopo lo scarico in Danea: verificare e annullare anche in Danea
                  </span>
                ) : (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRequeue(o)}>
                    Rimetti in scarico
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Nessun ordine scaricato finora.</p>
      )}

      <Dialog open={Boolean(requeue)} onOpenChange={(v) => (!v ? setRequeue(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimettere in scarico {requeue?.number}?</DialogTitle>
            <DialogDescription>
              L'ordine verrà riproposto a Danea al prossimo «Scarica». Se in Danea l'ordine è già
              presente, si creerà un doppione: controlla prima in Danea. Quantità e prezzi non
              cambiano.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (es. importazione in Danea non riuscita)"
            maxLength={300}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRequeue(null)}>
              Annulla
            </Button>
            <Button
              disabled={!reason.trim() || requeueMutation.isPending}
              onClick={() => requeue && requeueMutation.mutate({ orderId: requeue.id, reason: reason.trim() })}
            >
              Rimetti in scarico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
