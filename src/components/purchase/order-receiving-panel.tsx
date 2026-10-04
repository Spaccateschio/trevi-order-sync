import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { PurchaseOrderDetail } from "./purchase-order-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deliveryDateLabel, localToday, timeRangeLabel, useDeliveryPreferences } from "@/lib/delivery-preferences";
import { qty, type LocationRow } from "@/lib/inventory";
import type { OrderOverviewRow } from "@/lib/purchase";

type Line = { order_id: string; product_name: string | null; product_code: string | null; purchase_quantity: number | null; purchase_unit_code: string | null; ordered_quantity: number; unit_code: string | null };

/**
 * Ricezione ordini: ordini inviati con merce ancora da ricevere.
 * Nessun nuovo stato: «in attesa» = stato ordine inviato senza carichi;
 * «parzialmente ricevuto» = stato parzialmente_consegnato oppure carico già aperto.
 * L'arrivo merce si registra nel dettaglio ordine esistente (stesso Carico Merce).
 */
export function OrderReceivingPanel({ companyId }: { companyId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const prefs = useDeliveryPreferences(companyId);
  const today = localToday(prefs.data?.timezone ?? "Europe/Rome");

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async (): Promise<OrderOverviewRow[]> => {
      const { data, error } = await supabase.rpc("purchase_order_overview", { _company_id: companyId });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OrderOverviewRow[];
    },
  });
  const pending = useMemo(
    () =>
      (ordersQuery.data ?? []).filter(
        (o) => o.send_status === "inviato" && (o.status === "inviato" || o.status === "parzialmente_consegnato"),
      ),
    [ordersQuery.data],
  );
  const ids = pending.map((o) => o.order_id);

  const detailsQuery = useQuery({
    queryKey: ["order-receiving-details", companyId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [lines, receipts] = await Promise.all([
        supabase
          .from("purchase_order_items")
          .select("order_id, product_name, product_code, purchase_quantity, purchase_unit_code, ordered_quantity, unit_code")
          .in("order_id", ids),
        supabase.from("goods_receipts").select("order_id").in("order_id", ids),
      ]);
      if (lines.error) throw new Error(lines.error.message);
      if (receipts.error) throw new Error(receipts.error.message);
      return {
        lines: (lines.data ?? []) as Line[],
        started: new Set((receipts.data ?? []).map((r) => r.order_id as string)),
      };
    },
  });

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", companyId],
    queryFn: async (): Promise<LocationRow[]> => {
      const { data, error } = await supabase
        .from("inventory_locations")
        .select("id, name, code, is_default, status, notes")
        .eq("company_id", companyId)
        .eq("status", "attivo")
        .order("is_default", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as LocationRow[];
    },
  });

  const current = (ordersQuery.data ?? []).find((o) => o.order_id === selected) ?? null;
  if (current) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Torna alla ricezione
        </Button>
        <PurchaseOrderDetail order={current} companyId={companyId} locations={locationsQuery.data ?? []} />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold">Ordini in attesa di merce — {pending.length}</h2>
      {ordersQuery.isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
      {!ordersQuery.isLoading && pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun ordine in attesa di merce.</p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {pending.map((order) => {
          const partial = order.status === "parzialmente_consegnato" || Boolean(detailsQuery.data?.started.has(order.order_id));
          const lines = (detailsQuery.data?.lines ?? []).filter((l) => l.order_id === order.order_id);
          return (
            <div key={order.order_id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{order.supplier_name}</span>
                <Badge variant={partial ? "default" : "secondary"}>{partial ? "PARZIALMENTE RICEVUTO" : "IN ATTESA"}</Badge>
              </div>
              <p className="text-sm font-medium">{order.number}</p>
              <p className="mt-1 text-sm">
                Consegna prevista: {deliveryDateLabel(order.delivery_date, today).replace(" — ", " · ")}
              </p>
              <p className="text-sm">{timeRangeLabel(order.delivery_time_from, order.delivery_time_to)}</p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {lines.map((l, i) => (
                  <li key={i}>
                    {l.product_name ?? l.product_code ?? "Prodotto"} —{" "}
                    {l.purchase_quantity != null && l.purchase_unit_code
                      ? `${qty(Number(l.purchase_quantity))} ${l.purchase_unit_code}`
                      : `${qty(Number(l.ordered_quantity))} ${l.unit_code ?? ""}`}
                  </li>
                ))}
              </ul>
              <Button size="sm" className="mt-2" onClick={() => setSelected(order.order_id)}>
                {partial ? "Continua ricezione" : "Registra arrivo merce"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
