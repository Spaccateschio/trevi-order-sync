import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, parseQuantity, qty } from "@/lib/inventory";
import {
  DISPUTE_REASON_LABEL,
  LINE_STATUS_LABEL,
  LINE_TYPE_LABEL,
  OUTCOME_LABEL,
  outcomeTone,
  type ComparisonRow,
  type DisputeReason,
} from "@/lib/purchase";
import {
  acceptPurchaseDelivery,
  disputePurchaseDeliveryItem,
  resolvePurchaseDeliveryDispute,
} from "@/lib/purchase.functions";

type EventRow = {
  id: string;
  event_type: string;
  previous_quantity: number | null;
  new_quantity: number | null;
  reason: string | null;
  notes: string | null;
  actor_label: string | null;
  created_at: string;
};

/** Confronto ORDINATO ↔ DICHIARATO: l'ordine originale non viene mai riscritto. */
export function DeliveryComparisonPanel({
  deliveryId,
  canDecide,
}: {
  deliveryId: string;
  canDecide: boolean;
}) {
  const queryClient = useQueryClient();
  const runDispute = useServerFn(disputePurchaseDeliveryItem);
  const runResolve = useServerFn(resolvePurchaseDeliveryDispute);
  const runAccept = useServerFn(acceptPurchaseDelivery);

  const [disputeRow, setDisputeRow] = useState<ComparisonRow | null>(null);
  const [reason, setReason] = useState<DisputeReason>("quantita_inferiore");
  const [notes, setNotes] = useState("");
  const [resolveRow, setResolveRow] = useState<ComparisonRow | null>(null);
  const [resolution, setResolution] = useState<"accettata" | "rettificata" | "rifiutata">(
    "rettificata",
  );
  const [resolveQuantity, setResolveQuantity] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const rowsQuery = useQuery({
    queryKey: ["delivery-comparison", deliveryId],
    queryFn: async (): Promise<ComparisonRow[]> => {
      const { data, error } = await supabase.rpc("delivery_comparison", {
        _delivery_id: deliveryId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ComparisonRow[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["delivery-line-events", historyFor],
    enabled: Boolean(historyFor),
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from("purchase_delivery_line_events")
        .select("id, event_type, previous_quantity, new_quantity, reason, notes, actor_label, created_at")
        .eq("delivery_item_id", historyFor!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as EventRow[];
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["delivery-comparison", deliveryId] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["order-deliveries"] }),
    ]);
  };

  const dispute = useMutation({
    mutationFn: () =>
      runDispute({
        data: {
          deliveryItemId: disputeRow!.delivery_item_id,
          reason,
          notes: notes.trim() ? notes.trim() : null,
        },
      }),
    onSuccess: async () => {
      setDisputeRow(null);
      setNotes("");
      await refresh();
      toast.success("Contestazione registrata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolve = useMutation({
    mutationFn: () => {
      const quantity = parseQuantity(resolveQuantity);
      if (resolution === "rettificata" && quantity === null) {
        throw new Error("Indica la quantità rettificata");
      }
      return runResolve({
        data: {
          disputeId: resolveRow!.dispute_id!,
          resolution,
          acceptedQuantity: resolution === "rifiutata" ? null : quantity,
          notes: notes.trim() ? notes.trim() : null,
        },
      });
    },
    onSuccess: async () => {
      setResolveRow(null);
      setResolveQuantity("");
      setNotes("");
      await refresh();
      toast.success("Contestazione risolta");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accept = useMutation({
    mutationFn: () => runAccept({ data: { deliveryId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Consegna accettata: ora si può procedere al carico merce");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = rowsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="hidden text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_1.4fr_auto] sm:gap-2">
        <span>Prodotto</span>
        <span className="text-right">Ordinato</span>
        <span className="text-right">Dichiarato</span>
        <span className="text-right">Differenza</span>
        <span>Esito e nota</span>
        <span />
      </div>

      {rows.map((row) => (
        <div
          key={row.delivery_item_id}
          className="rounded-lg border border-border p-3 sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_1.4fr_auto] sm:items-center sm:gap-2 sm:p-2"
        >
          <div>
            <p className="font-medium">{row.code}</p>
            <p className="text-xs text-muted-foreground">{row.description}</p>
            {row.line_type !== "ordinata" ? (
              <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                {LINE_TYPE_LABEL[row.line_type]}
              </Badge>
            ) : null}
          </div>
          <span className="block text-sm sm:text-right">
            <span className="sm:hidden">Ordinato: </span>
            {row.line_type === "ordinata" ? qty(row.ordered) : "—"} {row.unit_code}
          </span>
          <span className="block text-sm sm:text-right">
            <span className="sm:hidden">Dichiarato: </span>
            {qty(row.declared)} {row.unit_code}
          </span>
          <span className={`block text-sm sm:text-right ${outcomeTone(row.outcome)}`}>
            <span className="sm:hidden">Differenza: </span>
            {row.line_type === "ordinata" ? qty(row.difference) : "—"}
          </span>
          <div className="text-xs">
            <p className={outcomeTone(row.outcome)}>{OUTCOME_LABEL[row.outcome]}</p>
            <p className="text-muted-foreground">{LINE_STATUS_LABEL[row.status]}</p>
            {row.missing_reason ? (
              <p className="text-muted-foreground">Motivo: {row.missing_reason}</p>
            ) : null}
            {row.declared_producer_lot ? (
              <p className="text-muted-foreground">Lotto dichiarato: {row.declared_producer_lot}</p>
            ) : null}
            {row.dispute_id && row.dispute_status === "aperta" ? (
              <p className="text-destructive">
                Contestata: {DISPUTE_REASON_LABEL[row.dispute_reason ?? "altro"]}
              </p>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
            <Button size="sm" variant="ghost" onClick={() => setHistoryFor(row.delivery_item_id)}>
              Storico
            </Button>
            {canDecide && (!row.dispute_id || row.dispute_status !== "aperta") ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDisputeRow(row);
                  setReason(
                    row.outcome === "superiore"
                      ? "quantita_superiore"
                      : row.outcome === "non_consegnata"
                        ? "non_consegnato"
                        : row.outcome === "aggiunta_fornitore"
                          ? "non_ordinato"
                          : "quantita_inferiore",
                  );
                }}
              >
                <AlertTriangle className="mr-1 h-4 w-4" /> Contesta
              </Button>
            ) : null}
            {canDecide && row.dispute_id && row.dispute_status === "aperta" ? (
              <Button
                size="sm"
                onClick={() => {
                  setResolveRow(row);
                  setResolveQuantity(String(row.declared));
                }}
              >
                Risolvi
              </Button>
            ) : null}
          </div>
        </div>
      ))}

      {canDecide ? (
        <Button onClick={() => accept.mutate()} disabled={accept.isPending || rows.length === 0}>
          <Check className="mr-1 h-4 w-4" /> Accetta la consegna
        </Button>
      ) : null}

      <Dialog open={Boolean(disputeRow)} onOpenChange={(open) => !open && setDisputeRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contesta la riga {disputeRow?.code}</DialogTitle>
          </DialogHeader>
          <Select value={reason} onValueChange={(value) => setReason(value as DisputeReason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DISPUTE_REASON_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Nota per il fornitore"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <DialogFooter>
            <Button onClick={() => dispute.mutate()} disabled={dispute.isPending}>
              Registra contestazione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolveRow)} onOpenChange={(open) => !open && setResolveRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Risolvi la contestazione {resolveRow?.code}</DialogTitle>
          </DialogHeader>
          <Select
            value={resolution}
            onValueChange={(value) =>
              setResolution(value as "accettata" | "rettificata" | "rifiutata")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accettata">Accetta come dichiarato</SelectItem>
              <SelectItem value="rettificata">Rettifica la quantità</SelectItem>
              <SelectItem value="rifiutata">Rifiuta la riga</SelectItem>
            </SelectContent>
          </Select>
          {resolution === "rettificata" ? (
            <Input
              inputMode="decimal"
              value={resolveQuantity}
              onChange={(event) => setResolveQuantity(event.target.value)}
              placeholder="Quantità concordata"
            />
          ) : null}
          <Textarea
            placeholder="Nota sulla risoluzione"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <DialogFooter>
            <Button onClick={() => resolve.mutate()} disabled={resolve.isPending}>
              Salva esito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyFor)} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Storico della riga</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {(historyQuery.data ?? []).map((event) => (
              <div key={event.id} className="rounded border border-border p-2">
                <p className="font-medium">{event.event_type}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTimeShort(event.created_at)}
                  {event.actor_label ? ` — ${event.actor_label}` : ""}
                </p>
                <p className="text-xs">
                  Da {qty(event.previous_quantity)} a {qty(event.new_quantity)}
                  {event.reason ? ` — ${event.reason}` : ""}
                </p>
                {event.notes ? <p className="text-xs text-muted-foreground">{event.notes}</p> : null}
              </div>
            ))}
            {(historyQuery.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">Nessun evento registrato.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
