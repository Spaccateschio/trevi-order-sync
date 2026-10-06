import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FilePlus2, Lock, Pencil, Trash2 } from "lucide-react";
import { OrderEditDialog, OrderCancelDialog } from "./order-customer-actions";
import { managePurchaseOrder } from "@/lib/purchase.functions";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PurchaseOrderDetail } from "./purchase-order-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { deliveryDateLabel, localToday, timeRangeLabel, useDeliveryPreferences } from "@/lib/delivery-preferences";
import { dateTimeShort, qty, type LocationRow } from "@/lib/inventory";
import { ORDER_STATUS_LABEL, SEND_STATUS_LABEL, type OrderOverviewRow } from "@/lib/purchase";
import { createPurchaseOrdersFromList } from "@/lib/purchase.functions";

type ConfirmedList = { id: string; name: string; confirmed_at: string | null };

/** Ordini fornitore: l'ordine non è giacenza, la giacenza arriva solo col carico merce. */
export function PurchaseOrdersPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const runCreate = useServerFn(createPurchaseOrdersFromList);
  const [selected, setSelected] = useState<string | null>(null);
  const [listId, setListId] = useState("");
  const [locationId, setLocationId] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async (): Promise<OrderOverviewRow[]> => {
      const { data, error } = await supabase.rpc("purchase_order_overview", {
        _company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OrderOverviewRow[];
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

  const listsQuery = useQuery({
    queryKey: ["confirmed-shopping-lists", companyId],
    queryFn: async (): Promise<ConfirmedList[]> => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("id, name, confirmed_at")
        .eq("company_id", companyId)
        .eq("status", "confermata")
        .order("confirmed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ConfirmedList[];
    },
  });

  const create = useMutation({
    mutationFn: () => {
      if (!listId) throw new Error("Scegli una lista confermata");
      return runCreate({
        data: {
          companyId,
          listId,
          destinationLocationId: locationId || null,
        },
      });
    },
    onSuccess: async (result) => {
      setListId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["confirmed-shopping-lists", companyId] }),
      ]);
      toast.success(
        result.orderIds.length === 1
          ? "Ordine creato in bozza"
          : `${result.orderIds.length} ordini creati in bozza`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const orders = ordersQuery.data ?? [];

  // Ordini B2B (con rapporto) e data di presa in carico del fornitore.
  const seenQuery = useQuery({
    queryKey: ["purchase-orders-seen", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, relation_id, seen_by_supplier_at")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const seenMap = new Map<string, string | null>();
  const seenRelation = new Set<string>();
  for (const r of seenQuery.data ?? []) {
    seenMap.set(r.id, r.seen_by_supplier_at);
    if (r.relation_id) seenRelation.add(r.id);
  }
  const [editing, setEditing] = useState<OrderOverviewRow | null>(null);
  const [cancelling, setCancelling] = useState<OrderOverviewRow | null>(null);
  const runOrder = useServerFn(managePurchaseOrder);
  const refreshOrders = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-orders-seen", companyId] }),
    ]);
  const cancelOrder = useMutation({
    mutationFn: (o: OrderOverviewRow) =>
      runOrder({ data: { orderId: o.order_id, action: "cancel", destinationLocationId: null, notes: null } }),
    onSuccess: async () => {
      setCancelling(null);
      await refreshOrders();
      toast.success("Ordine annullato: il fornitore riceve la notifica");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const locations = locationsQuery.data ?? [];
  const prefs = useDeliveryPreferences(companyId);
  const today = localToday(prefs.data?.timezone ?? "Europe/Rome");
  const current = useMemo(
    () => orders.find((order) => order.order_id === selected) ?? null,
    [orders, selected],
  );
  // Raggruppamento per stato di invio; ordini annullati restano tra gli inviati/storico.
  const groups = useMemo(() => {
    const live = orders.filter((o) => o.status !== "annullato");
    return [
      { key: "da_inviare", title: "Ordini da inviare", rows: live.filter((o) => o.send_status === "da_inviare") },
      { key: "errore_invio", title: "Errore invio", rows: live.filter((o) => o.send_status === "errore_invio") },
      { key: "inviato", title: "Inviati", rows: live.filter((o) => o.send_status === "inviato") },
      { key: "annullati", title: "Annullati", rows: orders.filter((o) => o.status === "annullato") },
    ];
  }, [orders]);

  if (current) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Torna agli ordini
        </Button>
        <PurchaseOrderDetail order={current} companyId={companyId} locations={locations} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-dashed border-border p-3">
        <p className="text-sm font-medium">Genera gli ordini da una Lista della Spesa confermata</p>
        <p className="text-xs text-muted-foreground">
          Un ordine per fornitore, con una sola destinazione di ricezione.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger>
              <SelectValue placeholder="Lista confermata" />
            </SelectTrigger>
            <SelectContent>
              {(listsQuery.data ?? []).map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Destinazione" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <FilePlus2 className="mr-1 h-4 w-4" /> Genera
          </Button>
        </div>
      </section>

      {groups.map((group) =>
        group.rows.length || group.key === "da_inviare" ? (
          <section
            key={group.key}
            className={
              group.key === "da_inviare"
                ? "space-y-2 rounded-lg border-2 border-primary bg-primary/5 p-3"
                : group.key === "errore_invio"
                  ? "space-y-2 rounded-lg border-2 border-destructive p-3"
                  : "space-y-2"
            }
          >
            <h2 className="text-base font-bold">
              {group.title} — {group.rows.length}
            </h2>
            {group.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun ordine da inviare.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {group.rows.map((order) => (
                  <div key={order.order_id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{order.supplier_name}</span>
                      {(() => {
                        const s = orderLabel(order, seenMap.get(order.order_id) ?? null);
                        return (
                          <Badge variant={s.variant}>
                            {s.locked ? <Lock className="mr-1 h-3 w-3" /> : null}
                            {s.label}
                          </Badge>
                        );
                      })()}
                      {order.open_disputes > 0 ? (
                        <Badge variant="destructive">{order.open_disputes} da risolvere</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm">
                      {order.number} · {order.lines} prodotti
                      {order.shopping_list_number ? ` · da ${order.shopping_list_number}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      Consegna: {deliveryDateLabel(order.delivery_date, today).replace(" — ", " · ")}
                    </p>
                    <p className="text-sm font-medium">{timeRangeLabel(order.delivery_time_from, order.delivery_time_to)}</p>
                    <p className="text-sm">{order.delivery_address_text || "Luogo non indicato"}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.sent_at ? `Inviato il ${dateTimeShort(order.sent_at)}` : `Creato il ${dateTimeShort(order.created_at)}`}
                      {order.status !== "bozza" ? ` · ordinato ${qty(order.ordered_total)} · caricato ${qty(order.received_total)}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(order.order_id)}>
                        Visualizza ordine
                      </Button>
                      {order.status === "inviato" && seenRelation.has(order.order_id) ? (
                        seenMap.get(order.order_id) ? (
                          <p className="text-xs text-muted-foreground">
                            <Lock className="mr-1 inline h-3 w-3" />
                            Il fornitore ha già preso in carico l'ordine: per annullare o modificare chiama il fornitore.
                          </p>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setEditing(order)}>
                              <Pencil className="mr-1 h-4 w-4" /> Modifica
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              aria-label="Annulla ordine"
                              onClick={() => setCancelling(order)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null,
      )}
      {orders.length === 0 && !ordersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Nessun ordine fornitore.</p>
      ) : null}
    </div>
  );
}
