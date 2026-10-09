import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, MessageSquare, TriangleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { supabase } from "@/integrations/supabase/client";
import { orderPriceNote } from "@/lib/purchase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type OrderRow = {
  id: string;
  number: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  delivery_date: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  delivery_address_text: string | null;
  notes: string | null;
  buyer: string;
  modified_at: string | null;
  seen_at: string | null;
  danea_exported_at: string | null;
  cancel_reason: string | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_name: string | null;
  product_code: string | null;
  purchase_quantity: number | null;
  purchase_unit_code: string | null;
  ordered_quantity: number | null;
  unit_code: string | null;
  unit_cost: number | null;
  price_unit_code: string | null;
  notes: string | null;
  previous_quantity: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  inviato: "Ricevuto",
  parzialmente_consegnato: "Parzialmente consegnato",
  consegnato: "Consegnato",
  chiuso: "Chiuso",
  annullato: "Annullato",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  inviato: "default",
  parzialmente_consegnato: "secondary",
  consegnato: "secondary",
  chiuso: "outline",
  annullato: "destructive",
};

const fmtDateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" });
const fmtDate = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" });
const fmtQty = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export function ReceivedOrdersPanel({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["received-orders", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id,number,status,created_at,sent_at,delivery_date,delivery_time_from,delivery_time_to,delivery_address_text,notes,seen_by_supplier_at,customer_modified_at,danea_exported_at,cancel_reason,companies!purchase_orders_company_id_fkey(legal_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Annullato prima che il fornitore lo aprisse: non c'è nulla da preparare,
      // quindi non compare nella schermata operativa (resta solo la notifica).
      return (data ?? []).filter((o) => !(o.status === "annullato" && !o.seen_by_supplier_at)).map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        created_at: o.created_at,
        sent_at: o.sent_at,
        delivery_date: o.delivery_date,
        delivery_time_from: o.delivery_time_from,
        delivery_time_to: o.delivery_time_to,
        delivery_address_text: o.delivery_address_text,
        notes: o.notes,
        modified_at: o.customer_modified_at,
        seen_at: o.seen_by_supplier_at,
        danea_exported_at: o.danea_exported_at,
        cancel_reason: o.cancel_reason,
        buyer: (o.companies as { legal_name: string | null } | null)?.legal_name ?? "Cliente",
      }));
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["received-order-items", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id,order_id,product_name,product_code,purchase_quantity,purchase_unit_code,ordered_quantity,unit_code,unit_cost,price_unit_code,notes,previous_quantity");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["received-orders", companyId] }),
      qc.invalidateQueries({ queryKey: ["received-order-items", companyId] }),
      qc.invalidateQueries({ queryKey: ["received-order-extras", companyId] }),
    ]);
  const extrasQuery = useQuery({
    queryKey: ["received-order-extras", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const [{ data: reqs }, { data: removed }] = await Promise.all([
        supabase.from("purchase_order_change_requests").select("id,order_id,note,status,requested_at").eq("seller_company_id", companyId).eq("status", "in_attesa"),
        supabase.from("purchase_order_changes").select("order_id,label,old_value,changed_at").eq("seller_company_id", companyId).eq("field", "item_removed"),
      ]);
      return { reqs: reqs ?? [], removed: removed ?? [] };
    },
  });
  const [cancelling, setCancelling] = useState<OrderRow | null>(null);
  const [reason, setReason] = useState("");
  const [danea, setDanea] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const decide = useMutation({
    mutationFn: async (v: { id: string; accept: boolean; note: string }) => {
      const { error } = await supabase.rpc("decide_order_change", { _request_id: v.id, _accept: v.accept, _note: v.note });
      if (error) throw new Error(error.message);
      return v.accept;
    },
    onSuccess: async (accept) => {
      setRejecting(null);
      setRejectNote("");
      await refresh();
      toast.success(accept ? "Richiesta accettata: il cliente può modificare l'ordine" : "Richiesta rifiutata: il cliente riceve la notifica");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: async (o: OrderRow) => {
      const { data, error } = await supabase.rpc("supplier_cancel_order", { _order_id: o.id, _reason: reason });
      if (error) throw new Error(error.message);
      return data as string | null;
    },
    onSuccess: async (exported) => {
      setCancelling(null);
      setReason("");
      await refresh();
      toast.success("Ordine annullato: il cliente riceve la notifica");
      if (exported) setDanea(exported);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orders = ordersQuery.data ?? [];
  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const it of itemsQuery.data ?? []) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  if (ordersQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Caricamento ordini…</p>;
  }
  if (ordersQuery.error) {
    return <p className="text-sm text-destructive">Errore nel caricamento degli ordini ricevuti.</p>;
  }
  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nessun ordine ricevuto</p>
          <p className="text-xs text-muted-foreground">
            Quando un cliente collegato in B2B ti invia un ordine, lo trovi qui e nella campanella delle notifiche.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Dialog open={Boolean(cancelling)} onOpenChange={(v) => (!v ? setCancelling(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annullare l'ordine {cancelling?.number}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Il cliente riceve la notifica. Resta nello storico con il motivo.</p>
          <Textarea aria-label="Motivo" placeholder="Motivo dell'annullamento" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>No</Button>
            <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling)}>
              Sì, annulla ordine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(danea)} onOpenChange={(v) => (!v ? setDanea(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promemoria Danea</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Ordine già esportato in Danea il {danea ? fmtDateTime.format(new Date(danea)) : ""} — ricordati di annullarlo anche in Danea.
          </p>
          <DialogFooter>
            <Button onClick={() => setDanea(null)}>Ho capito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(rejecting)} onOpenChange={(v) => (!v ? setRejecting(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rifiuta la richiesta</DialogTitle>
          </DialogHeader>
          <Textarea aria-label="Motivo rifiuto" placeholder="Motivo (facoltativo)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Chiudi</Button>
            <Button disabled={decide.isPending} onClick={() => rejecting && decide.mutate({ id: rejecting, accept: false, note: rejectNote })}>
              Rifiuta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {orders.map((o) => {
        const items = itemsByOrder.get(o.id) ?? [];
        const expanded = open === o.id;
        return (
          <Card key={o.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
              onClick={() => {
                setOpen(expanded ? null : o.id);
                // Prima apertura del fornitore: blocca l'ordine lato cliente (lucchetto).
                if (!expanded && o.status !== "bozza" && o.status !== "annullato") {
                  // La chiamata va attesa (.then): senza, la richiesta non parte mai.
                  void supabase.rpc("mark_order_seen_by_supplier", { _order_id: o.id }).then(() => refresh());
                }
              }}
            >
              {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.number ?? "Ordine"}</span>
                  <Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                  {o.modified_at && !o.seen_at && o.status === "inviato" ? (
                    <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/20">Modificato</Badge>
                  ) : null}
                  {(extrasQuery.data?.reqs ?? []).some((r) => r.order_id === o.id) ? (
                    <Badge variant="outline"><MessageSquare className="mr-1 h-3 w-3" />Richiesta modifica</Badge>
                  ) : null}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {o.buyer} · {fmtDateTime.format(new Date(o.sent_at ?? o.created_at))}
                  {items.length > 0 ? ` · ${items.length} prodott${items.length === 1 ? "o" : "i"}` : ""}
                </p>
              </div>
            </button>
            {expanded ? (
              <CardContent className="space-y-3 border-t pt-3">
                {(extrasQuery.data?.reqs ?? []).filter((r) => r.order_id === o.id).map((r) => (
                  <div key={r.id} className="space-y-2 rounded-md border border-warning bg-warning/10 p-3 text-sm">
                    <p className="font-medium">Il cliente chiede una modifica</p>
                    <p>{r.note}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, accept: true, note: "" })}>
                        Accetta (sblocca l'ordine)
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(r.id)}>Rifiuta</Button>
                    </div>
                  </div>
                ))}
                {o.status === "annullato" && o.cancel_reason ? (
                  <p className="text-sm text-destructive">Motivo annullamento: {o.cancel_reason}</p>
                ) : null}
                {o.delivery_date || o.delivery_address_text ? (
                  <div className="text-sm">
                    <p className="font-medium">Consegna richiesta</p>
                    <p className="text-muted-foreground">
                      {o.delivery_date ? fmtDate.format(new Date(o.delivery_date)) : null}
                      {o.delivery_time_from || o.delivery_time_to
                        ? ` · ${o.delivery_time_from ?? "…"}–${o.delivery_time_to ?? "…"}`
                        : null}
                    </p>
                    {o.delivery_address_text ? <p className="text-muted-foreground">{o.delivery_address_text}</p> : null}
                  </div>
                ) : null}
                {o.notes ? (
                  <div className="text-sm">
                    <p className="font-medium">Note del cliente</p>
                    <p className="text-muted-foreground">{o.notes}</p>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <p className="text-sm font-medium">Prodotti ordinati</p>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna riga disponibile.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {items.map((it) => (
                        <li
                          key={it.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                            it.previous_quantity != null && it.previous_quantity !== it.purchase_quantity ? "border-l-4 border-l-warning bg-warning/10" : ""
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{it.product_name ?? "Prodotto"}</p>
                            {it.product_code ? <p className="text-xs text-muted-foreground">Cod. {it.product_code}</p> : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p>
                              {it.purchase_quantity != null ? fmtQty.format(it.purchase_quantity) : "—"}{" "}
                              {it.purchase_unit_code ?? it.unit_code ?? ""}
                            </p>
                            {it.previous_quantity != null && it.previous_quantity !== it.purchase_quantity ? (
                              <p className="text-xs">
                                <TriangleAlert className="mr-1 inline h-3 w-3" />
                                {it.previous_quantity === 0 ? "Nuovo prodotto" : `prima ${fmtQty.format(it.previous_quantity)}, ora ${fmtQty.format(it.purchase_quantity ?? 0)}`}
                              </p>
                            ) : null}
                            {(() => {
                              const note = orderPriceNote({
                                unitCost: it.unit_cost,
                                priceUnitCode: it.price_unit_code,
                                purchaseUnitCode: it.purchase_unit_code ?? it.unit_code,
                                isB2b: true,
                              });
                              return note ? (
                                <p className="text-xs text-muted-foreground">
                                  {note.price}
                                  {note.weigh ? <span className="block font-medium text-foreground">Da pesare al carico</span> : null}
                                </p>
                              ) : null;
                            })()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(extrasQuery.data?.removed ?? []).filter((r) => r.order_id === o.id).map((r, i) => (
                    <p key={i} className="rounded-md border-l-4 border-l-warning bg-warning/10 px-3 py-1 text-sm line-through">
                      {r.label} {r.old_value ? `(${r.old_value})` : ""} — tolto dal cliente
                    </p>
                  ))}
                </div>
                {o.status === "inviato" ? (
                  <Button size="sm" variant="destructive" onClick={() => setCancelling(o)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Annulla ordine
                  </Button>
                ) : null}
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
