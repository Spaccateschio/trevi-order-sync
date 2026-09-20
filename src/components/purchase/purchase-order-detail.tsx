import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, PackagePlus, Send, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeliveryComparisonPanel } from "./delivery-comparison-panel";
import { DeliveryDeclarationPanel } from "./delivery-declaration-panel";
import { GoodsReceiptPanel } from "./goods-receipt-panel";
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
import { dateTimeShort, qty } from "@/lib/inventory";
import type { LocationRow } from "@/lib/inventory";
import {
  DELIVERY_ORIGIN_LABEL,
  DELIVERY_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  type DeliveryRow,
  type OrderItemRow,
  type OrderOverviewRow,
  type ReceiptRow,
} from "@/lib/purchase";
import {
  createOrderShareLink,
  managePurchaseOrder,
  openGoodsReceipt,
  openPurchaseDelivery,
  revokeOrderShareLink,
} from "@/lib/purchase.functions";

type ShareLink = {
  id: string;
  recipient_label: string | null;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  last_access_at: string | null;
};

/** Scheda ordine: quantità ordinate congelate, dichiarazioni, confronto e carico merce. */
export function PurchaseOrderDetail({
  order,
  companyId,
  locations,
}: {
  order: OrderOverviewRow;
  companyId: string;
  locations: LocationRow[];
}) {
  const queryClient = useQueryClient();
  const runOrder = useServerFn(managePurchaseOrder);
  const runOpenDelivery = useServerFn(openPurchaseDelivery);
  const runOpenReceipt = useServerFn(openGoodsReceipt);
  const runShare = useServerFn(createOrderShareLink);
  const runRevoke = useServerFn(revokeOrderShareLink);

  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["order-items", order.order_id],
    queryFn: async (): Promise<OrderItemRow[]> => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(
          "id, product_id, ordered_quantity, unit_code, purchase_quantity, purchase_unit_code, unit_cost, supplier_product_code, products(code, description)",
        )
        .eq("order_id", order.order_id)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OrderItemRow[];
    },
  });

  const deliveriesQuery = useQuery({
    queryKey: ["order-deliveries", order.order_id],
    queryFn: async (): Promise<DeliveryRow[]> => {
      const { data, error } = await supabase
        .from("purchase_deliveries")
        .select(
          "id, sequence, origin, status, notes, declared_by_name, declared_at, accepted_at, created_at",
        )
        .eq("order_id", order.order_id)
        .order("sequence");
      if (error) throw new Error(error.message);
      return (data ?? []) as DeliveryRow[];
    },
  });

  const receiptsQuery = useQuery({
    queryKey: ["order-receipts", order.order_id],
    queryFn: async (): Promise<ReceiptRow[]> => {
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("id, number, status, location_id, received_at, confirmed_at, delivery_id")
        .eq("order_id", order.order_id)
        .order("received_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as ReceiptRow[];
    },
  });

  const linksQuery = useQuery({
    queryKey: ["order-share-links", order.order_id],
    queryFn: async (): Promise<ShareLink[]> => {
      const { data, error } = await supabase
        .from("purchase_order_share_links")
        .select("id, recipient_label, expires_at, revoked_at, access_count, last_access_at")
        .eq("order_id", order.order_id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShareLink[];
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["order-items", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-deliveries", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-receipts", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-share-links", order.order_id] }),
    ]);
  };

  const action = useMutation({
    mutationFn: (payload: {
      action: "send" | "set_destination" | "cancel" | "close";
      destinationLocationId?: string;
    }) =>
      runOrder({
        data: {
          orderId: order.order_id,
          action: payload.action,
          destinationLocationId: payload.destinationLocationId ?? null,
          notes: null,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Ordine aggiornato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const newDelivery = useMutation({
    mutationFn: () =>
      runOpenDelivery({
        data: { orderId: order.order_id, origin: "operatore_interno", declaredByName: null },
      }),
    onSuccess: async (result) => {
      await refresh();
      setOpenDeliveryId(result.deliveryId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const newReceipt = useMutation({
    mutationFn: (deliveryId: string) => runOpenReceipt({ data: { deliveryId } }),
    onSuccess: async (result) => {
      await refresh();
      setReceiptId(result.receiptId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const share = useMutation({
    mutationFn: () =>
      runShare({ data: { orderId: order.order_id, recipientLabel: null, validHours: 72 } }),
    onSuccess: async (result) => {
      setToken(result.token);
      await refresh();
      toast.success("Link creato: copialo ora, non sarà più visibile");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => runRevoke({ data: { linkId } }),
    onSuccess: async () => {
      setToken(null);
      await refresh();
      toast.success("Link revocato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = itemsQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const receipts = receiptsQuery.data ?? [];
  const links = linksQuery.data ?? [];
  const activeLink = links.find((link) => !link.revoked_at);
  const draft = order.status === "bozza";
  const shareUrl = token ? `${window.location.origin}/consegna/${token}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{order.number}</span>
        <Badge variant="outline">{ORDER_STATUS_LABEL[order.status]}</Badge>
        <span className="text-sm text-muted-foreground">{order.supplier_name}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Destinazione di ricezione</p>
          {draft ? (
            <Select
              value={order.destination_location_id}
              onValueChange={(value) =>
                action.mutate({ action: "set_destination", destinationLocationId: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="mt-1 font-medium">{order.destination_name}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Tutta la merce di questo ordine arriva qui.
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Quantità</p>
          <p className="mt-1">Ordinato: {qty(order.ordered_total)}</p>
          <p>Dichiarato: {qty(order.declared_total)}</p>
          <p>Caricato in magazzino: {qty(order.received_total)}</p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Righe ordinate {draft ? "" : "(congelate all'invio)"}
        </h3>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <div>
              <p className="font-medium">{item.products?.code}</p>
              <p className="text-xs text-muted-foreground">{item.products?.description}</p>
              {item.supplier_product_code ? (
                <p className="text-xs text-muted-foreground">
                  Codice fornitore: {item.supplier_product_code}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p>
                {qty(item.ordered_quantity)} {item.unit_code}
              </p>
              {item.purchase_quantity ? (
                <p className="text-xs text-muted-foreground">
                  In acquisto: {qty(item.purchase_quantity)} {item.purchase_unit_code}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {draft ? (
          <Button onClick={() => action.mutate({ action: "send" })} disabled={action.isPending}>
            <Send className="mr-1 h-4 w-4" /> Invia l'ordine al fornitore
          </Button>
        ) : null}
        {order.status === "inviato" || order.status === "parzialmente_consegnato" ? (
          <>
            <Button variant="secondary" onClick={() => newDelivery.mutate()}>
              <Truck className="mr-1 h-4 w-4" /> Registra consegna dichiarata
            </Button>
            <Button variant="outline" onClick={() => share.mutate()}>
              <Link2 className="mr-1 h-4 w-4" /> Crea link per fornitore esterno
            </Button>
          </>
        ) : null}
        {draft ? (
          <Button variant="ghost" onClick={() => action.mutate({ action: "cancel" })}>
            Annulla ordine
          </Button>
        ) : null}
      </div>

      {shareUrl ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Invia questo indirizzo al fornitore: vale solo per questo ordine.
          </p>
          <p className="mt-1 break-all font-mono text-xs">{shareUrl}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl);
              toast.success("Indirizzo copiato");
            }}
          >
            <Copy className="mr-1 h-4 w-4" /> Copia
          </Button>
        </div>
      ) : null}

      {activeLink ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs">
          <span>
            Link attivo fino al {dateTimeShort(activeLink.expires_at)} · aperture:{" "}
            {activeLink.access_count}
          </span>
          <Button size="sm" variant="ghost" onClick={() => revoke.mutate(activeLink.id)}>
            Revoca
          </Button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Consegne</h3>
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Consegna {delivery.sequence}</span>
              <Badge variant="outline">{DELIVERY_STATUS_LABEL[delivery.status]}</Badge>
              <span className="text-xs text-muted-foreground">
                {DELIVERY_ORIGIN_LABEL[delivery.origin]}
              </span>
              {delivery.declared_at ? (
                <span className="text-xs text-muted-foreground">
                  Dichiarata il {dateTimeShort(delivery.declared_at)}
                  {delivery.declared_by_name ? ` da ${delivery.declared_by_name}` : ""}
                </span>
              ) : null}
            </div>

            {delivery.status === "bozza" ? (
              <div className="mt-3">
                {openDeliveryId === delivery.id ? (
                  <DeliveryDeclarationPanel
                    deliveryId={delivery.id}
                    companyId={companyId}
                    archiveId={order.archive_id}
                    onDone={() => {
                      setOpenDeliveryId(null);
                      void refresh();
                    }}
                  />
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setOpenDeliveryId(delivery.id)}>
                    Compila il dichiarato
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <DeliveryComparisonPanel
                  deliveryId={delivery.id}
                  canDecide={delivery.status === "dichiarata" || delivery.status === "in_contestazione"}
                />
                {delivery.status === "accettata" || delivery.status === "chiusa_con_rifiuti" ? (
                  (() => {
                    const receipt = receipts.find((row) => row.delivery_id === delivery.id);
                    if (receipt && (receiptId === receipt.id || receipt.status === "confermato")) {
                      return <GoodsReceiptPanel receiptId={receipt.id} />;
                    }
                    return (
                      <Button
                        size="sm"
                        onClick={() =>
                          receipt ? setReceiptId(receipt.id) : newReceipt.mutate(delivery.id)
                        }
                      >
                        <PackagePlus className="mr-1 h-4 w-4" /> Apri il carico merce
                      </Button>
                    );
                  })()
                ) : null}
              </div>
            )}
          </div>
        ))}
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna consegna registrata.</p>
        ) : null}
      </section>
    </div>
  );
}
