import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, parseQuantity, qty } from "@/lib/inventory";
import type { LotReconciliationRow, LotRow } from "@/lib/purchase";
import { openLotReconciliation, resolveLotReconciliation } from "@/lib/purchase.functions";

/** Provenienze del prodotto: giacenza totale e per singolo carico, nessuna attribuzione automatica. */
export function ProductProvenancePanel({
  productId,
  editable,
}: {
  productId: string;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const runOpen = useServerFn(openLotReconciliation);
  const runResolve = useServerFn(resolveLotReconciliation);
  const [dialogFor, setDialogFor] = useState<LotReconciliationRow | null>(null);
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");

  const lotsQuery = useQuery({
    queryKey: ["product-lots", productId],
    queryFn: async (): Promise<LotRow[]> => {
      const { data, error } = await supabase.rpc("product_lot_availability", {
        _product_id: productId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LotRow[];
    },
  });

  const reconciliationQuery = useQuery({
    queryKey: ["product-lot-reconciliation", productId],
    queryFn: async (): Promise<LotReconciliationRow[]> => {
      const { data, error } = await supabase.rpc("product_lot_reconciliation", {
        _product_id: productId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LotReconciliationRow[];
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["product-lots", productId] }),
      queryClient.invalidateQueries({ queryKey: ["product-lot-reconciliation", productId] }),
      queryClient.invalidateQueries({ queryKey: ["product-stock", productId] }),
    ]);
  };

  const attribute = useMutation({
    mutationFn: async () => {
      const value = parseQuantity(quantity);
      if (!lotId || value === null || value === 0) throw new Error("Scegli provenienza e quantità");
      const { reconciliationId } = await runOpen({
        data: { productId, locationId: dialogFor!.location_id, notes: null },
      });
      await runResolve({
        data: {
          reconciliationId,
          action: "attribute",
          stockLotId: lotId,
          quantity: value,
          notes: null,
        },
      });
    },
    onSuccess: async () => {
      setDialogFor(null);
      setLotId("");
      setQuantity("");
      await refresh();
      toast.success("Differenza attribuita alla provenienza scelta");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lots = lotsQuery.data ?? [];
  const anomalies = (reconciliationQuery.data ?? []).filter(
    (row) => Math.abs(Number(row.difference)) > 0.0001,
  );
  const totalRemaining = lots.reduce((sum, lot) => sum + Number(lot.remaining_quantity), 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Provenienze</h3>
        <span className="text-xs text-muted-foreground">
          Totale dai carichi: {qty(totalRemaining)}
        </span>
      </div>

      {anomalies.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive">
            Differenza fra conteggio fisico e provenienze: nessuna attribuzione automatica
          </p>
          {anomalies.map((row) => (
            <div key={row.location_id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                {row.location_name}: conteggio {qty(row.physical)} · provenienze{" "}
                {qty(row.lots_theoretical)} ·{" "}
                <strong>{Number(row.difference) > 0 ? "+" : ""}{qty(row.difference)} non attribuiti</strong>
              </span>
              {editable && lots.some((lot) => lot.location_id === row.location_id) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDialogFor(row);
                    setQuantity(String(row.difference));
                  }}
                >
                  Riconcilia
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {lots.map((lot) => (
          <div key={lot.lot_id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{lot.supplier_name ?? "Fornitore non indicato"}</span>
              <span>
                {qty(lot.remaining_quantity)} {lot.unit_code} di {qty(lot.initial_quantity)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Lotto interno {lot.internal_code} · {lot.location_name} · caricato il{" "}
              {dateTimeShort(lot.entered_at)}
            </p>
            <p className="text-xs text-muted-foreground">
              Lotto del produttore:{" "}
              {lot.producer_lot_code ? lot.producer_lot_code : "non comunicato"}
              {lot.producer_name ? ` · ${lot.producer_name}` : ""}
            </p>
            {lot.status !== "disponibile" ? (
              <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                {lot.status}
              </Badge>
            ) : null}
          </div>
        ))}
        {lots.length === 0 && !lotsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Nessun carico merce registrato per questo prodotto.
          </p>
        ) : null}
      </div>

      <Dialog open={Boolean(dialogFor)} onOpenChange={(open) => !open && setDialogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attribuisci la differenza — {dialogFor?.location_name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Scegli tu la provenienza: il sistema non decide mai al posto tuo.
          </p>
          <Select value={lotId} onValueChange={setLotId}>
            <SelectTrigger>
              <SelectValue placeholder="Provenienza" />
            </SelectTrigger>
            <SelectContent>
              {lots
                .filter((lot) => lot.location_id === dialogFor?.location_id)
                .map((lot) => (
                  <SelectItem key={lot.lot_id} value={lot.lot_id}>
                    {lot.internal_code} — {lot.supplier_name ?? "senza fornitore"} (
                    {qty(lot.remaining_quantity)})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="Quantità (può essere negativa)"
          />
          <DialogFooter>
            <Button onClick={() => attribute.mutate()} disabled={attribute.isPending}>
              Registra riconciliazione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
