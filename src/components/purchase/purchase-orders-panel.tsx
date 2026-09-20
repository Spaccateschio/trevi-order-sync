import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FilePlus2 } from "lucide-react";
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
import { dateTimeShort, qty, type LocationRow } from "@/lib/inventory";
import { ORDER_STATUS_LABEL, type OrderOverviewRow } from "@/lib/purchase";
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
  const locations = locationsQuery.data ?? [];
  const current = useMemo(
    () => orders.find((order) => order.order_id === selected) ?? null,
    [orders, selected],
  );

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

      <section className="space-y-2">
        {orders.map((order) => (
          <button
            key={order.order_id}
            type="button"
            onClick={() => setSelected(order.order_id)}
            className="w-full rounded-lg border border-border p-3 text-left transition hover:border-primary"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{order.number}</span>
              <Badge variant="outline">{ORDER_STATUS_LABEL[order.status]}</Badge>
              {order.open_disputes > 0 ? (
                <Badge variant="destructive">{order.open_disputes} da risolvere</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm">{order.supplier_name}</p>
            <p className="text-xs text-muted-foreground">
              {order.lines} righe · ordinato {qty(order.ordered_total)} · dichiarato{" "}
              {qty(order.declared_total)} · caricato {qty(order.received_total)} ·{" "}
              {order.destination_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.sent_at
                ? `Inviato il ${dateTimeShort(order.sent_at)}`
                : `Creato il ${dateTimeShort(order.created_at)}`}
            </p>
          </button>
        ))}
        {orders.length === 0 && !ordersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Nessun ordine fornitore.</p>
        ) : null}
      </section>
    </div>
  );
}
