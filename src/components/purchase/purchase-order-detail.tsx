import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, PackagePlus, Send, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DeliveryComparisonPanel } from "./delivery-comparison-panel";
import { DeliveryDeclarationPanel } from "./delivery-declaration-panel";
import { GoodsReceiptPanel } from "./goods-receipt-panel";
import { OrderDeliverySection } from "./order-delivery-section";
import { SendOrderDialog, type SendChannel } from "./send-order-dialog";
import { OrderShareDialog } from "./order-share-dialog";
import { hasRole, useIdentity } from "@/hooks/use-identity";
import { priceUnitDiffers } from "@/lib/order-sharing";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { PriceInfoNotice } from "@/components/pricing/price-info-notice";
import {
  DELIVERY_ORIGIN_LABEL,
  DELIVERY_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  SEND_STATUS_LABEL,
  orderPriceNote,
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
  getOrderShareHistory,
  undoNonB2bOrderSend,
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
  const runHistory = useServerFn(getOrderShareHistory);
  const runUndo = useServerFn(undoNonB2bOrderSend);
  const identity = useIdentity();
  const [resendOpen, setResendOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [undoKey, setUndoKey] = useState<string | null>(null);
  const history = useQuery({ queryKey: ["order-share-history", order.order_id], queryFn: () => runHistory({ data: { orderId: order.order_id } }) });

  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["order-items", order.order_id],
    queryFn: async (): Promise<OrderItemRow[]> => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(
          "id, product_id, ordered_quantity, unit_code, purchase_quantity, purchase_unit_code, unit_cost, price_unit_code, supplier_product_code, products(code, description), product_supplier_links(supplier_company_id)",
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

  // Stessa regola del database (manage_purchase_order): B2B solo se l'ordine ha un collegamento attivo.
  const relationQuery = useQuery({
    queryKey: ["order-relation", order.order_id],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("relation_id")
        .eq("id", order.order_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.relation_id);
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["order-items", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-deliveries", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-receipts", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-share-links", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-share-history", order.order_id] }),
      queryClient.invalidateQueries({ queryKey: ["order-stored-send-state", order.order_id] }),
    ]);
  };

  const storedSendState = useQuery({ queryKey: ["order-stored-send-state", order.order_id], queryFn: async () => {
    const { data, error } = await supabase.from("purchase_orders").select("send_status").eq("id", order.order_id).single();
    if (error) throw new Error(error.message);
    return data.send_status;
  } });

  const action = useMutation({
    mutationFn: (payload: {
      action: "send" | "set_destination" | "cancel" | "close";
      destinationLocationId?: string;
      sendChannel?: SendChannel | null;
    }) =>
      runOrder({
        data: {
          orderId: order.order_id,
          action: payload.action,
          destinationLocationId: payload.destinationLocationId ?? null,
          notes: null,
          sendChannel: payload.sendChannel ?? null,
        },
      }),
    onSuccess: async () => {
      setSendOpen(false);
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
      runShare({ data: { orderId: order.order_id, recipientLabel: null, validHours: 72, keepExisting: true } }),
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
  const undo = useMutation({
    mutationFn: () => {
      const key = undoKey ?? crypto.randomUUID();
      setUndoKey(key);
      return runUndo({ data: { orderId: order.order_id, reason: undoReason, key } });
    },
    onSuccess: async () => { setUndoOpen(false); setUndoReason(""); setUndoKey(null); await refresh(); toast.success("Conferma rettificata"); },
    onError: (e: Error) => toast.error(e.message),
  });
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
        {storedSendState.data && storedSendState.data !== "inviato" && order.status !== "bozza" && order.status !== "annullato" ? <span className="text-xs text-destructive">Incoerenza: stato invio {storedSendState.data === "da_inviare" ? "Da inviare" : "Errore invio"}</span> : null}
        {order.shopping_list_number ? (
          <span className="text-sm text-muted-foreground">da {order.shopping_list_number}</span>
        ) : null}
      </div>

      <OrderDeliverySection order={order} companyId={companyId} />

      {draft ? (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Destinazione di ricezione</p>
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
          <p className="mt-2 text-xs text-muted-foreground">
            Tutta la merce di questo ordine arriva qui.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-3 text-sm">
        <p className="text-xs text-muted-foreground">Quantità</p>
        <p className="mt-1">Ordinato: {qty(order.ordered_total)}</p>
        <p>Dichiarato: {qty(order.declared_total)}</p>
        <p>Caricato in magazzino: {qty(order.received_total)}</p>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Righe ordinate ({visibleItems.length}{itemFilter ? ` di ${items.length}` : ""}) {draft ? "" : "(congelate all'invio)"}
          </h3>
          {items.length > 5 ? (
            <Input
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              placeholder="Cerca codice o descrizione…"
              aria-label="Cerca nelle righe ordinate"
              className="h-8 w-full sm:w-64"
            />
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Codice</th>
                <th className="px-3 py-2 font-medium">Descrizione</th>
                <th className="px-3 py-2 text-right font-medium">Quantità</th>
                <th className="px-3 py-2 text-right font-medium">Prezzo indicativo</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const note = orderPriceNote({
                  unitCost: item.unit_cost,
                  priceUnitCode: item.price_unit_code,
                  purchaseUnitCode: item.purchase_unit_code ?? item.unit_code,
                  isB2b: Boolean(item.product_supplier_links?.supplier_company_id),
                });
                return (
                  <tr key={item.id} className="border-b border-border last:border-0 odd:bg-muted/20">
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                      {item.products?.code}
                      {item.supplier_product_code ? (
                        <span className="block text-xs">Forn.: {item.supplier_product_code}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top font-semibold">
                      {item.products?.description}
                    </td>
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      {/* Dato dell'ordine: quantità nella U.M. d'acquisto. */}
                      <span className="font-semibold">
                        {item.purchase_quantity !== null
                          ? `${qty(item.purchase_quantity)} ${item.purchase_unit_code}`
                          : `${qty(item.ordered_quantity)} ${item.unit_code}`}
                      </span>
                      {item.purchase_quantity !== null && item.purchase_unit_code !== item.unit_code ? (
                        <span className="block text-xs text-muted-foreground">
                          {item.ordered_quantity !== null
                            ? `≈ ${qty(item.ordered_quantity)} ${item.unit_code ?? ""}`
                            : "senza equivalente: peso al Carico Merce"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap text-muted-foreground">
                      {/* Prezzo fotografato sull'ordine, con la sua U.M. (indipendente dalla U.M. d'ordine). */}
                      {note ? (
                        <>
                          {note.price}
                          {note.weigh ? <span className="block text-xs font-medium text-foreground">Da pesare al carico</span> : null}
                        </>
                      ) : "—"}
                      {priceUnitDiffers(item.price_unit_code, item.purchase_unit_code ?? item.unit_code) ? (
                        <span className="block text-xs">U.M. prezzo diversa</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Nessuna riga corrisponde alla ricerca.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {relationQuery.data === true ? (
        <PriceInfoNotice
          sellerCompanyId={
            (itemsQuery.data ?? []).find((i) => i.product_supplier_links?.supplier_company_id)
              ?.product_supplier_links?.supplier_company_id ?? null
          }
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {draft ? (
          <>
            <Button onClick={() => setSendOpen(true)} disabled={action.isPending || relationQuery.data === undefined}>
              <Send className="mr-1 h-4 w-4" /> Invia l'ordine al fornitore
            </Button>
            <SendOrderDialog
              open={sendOpen}
              onOpenChange={setSendOpen}
              isB2b={relationQuery.data === true}
              orderId={order.order_id}
              onShared={async () => { setSendOpen(false); await refresh(); }}
              supplierName={order.supplier_name}
              orderNumber={order.number}
              pending={action.isPending}
              onConfirm={(channel) => action.mutate({ action: "send", sendChannel: channel })}
              sellerCompanyId={
                (itemsQuery.data ?? []).find((i) => i.product_supplier_links?.supplier_company_id)
                  ?.product_supplier_links?.supplier_company_id ?? null
              }
            />
          </>
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

      {relationQuery.data === false && ["inviato", "parzialmente_consegnato", "consegnato", "chiuso"].includes(order.status) ? <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setResendOpen(true)}><Send className="size-4" /> Rimanda ordine</Button>
        {order.status === "inviato" && hasRole(identity.data, "amministratore") ? <Button variant="outline" onClick={() => { setUndoKey(null); setUndoOpen(true); }}>Annulla conferma invio</Button> : null}
      </div> : null}
      {resendOpen ? <OrderShareDialog orderId={order.order_id} mode="resend" onClose={() => setResendOpen(false)} onConfirmed={async () => { await refresh(); }} /> : null}
      <Dialog open={undoOpen} onOpenChange={next => { if (!undo.isPending) setUndoOpen(next); }}><DialogContent><DialogHeader><DialogTitle>Annulla conferma invio</DialogTitle></DialogHeader><p className="text-sm">La rettifica non annulla eventuali messaggi già spediti. Le attività successive possono impedirla.</p><Textarea aria-label="Motivo della rettifica" value={undoReason} onChange={e => setUndoReason(e.target.value)} disabled={undo.isPending} /><Button disabled={!undoReason.trim() || undo.isPending} onClick={() => undo.mutate()}>Conferma rettifica</Button></DialogContent></Dialog>
      <section className="space-y-2"><h3 className="text-sm font-semibold">Storico condivisioni confermate</h3>
        {history.isError ? <p className="text-xs text-destructive">{history.error.message}</p> : history.isPending ? <p className="text-xs">Caricamento…</p> : !history.data?.length ? <p className="text-xs text-muted-foreground">Nessuna condivisione confermata registrata.</p> : history.data.map(event => <div key={event.id} className="border-b border-border py-2 text-xs"><p>{dateTimeShort(event.at)} · {event.actor} · {event.action === "purchase_order.send_confirmation_undone" ? "Rettifica" : event.detail?.mode === "resend" ? "Reinvio" : "Primo invio"}</p><p>{event.detail?.channel ?? "—"} · {event.detail?.recipient ?? "Destinatario non registrato"}</p>{event.detail?.reason ? <p>{event.detail.reason}</p> : null}</div>)}
      </section>

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
