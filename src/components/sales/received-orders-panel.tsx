import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
const fmtPrice = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function ReceivedOrdersPanel({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["received-orders", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id,number,status,created_at,sent_at,delivery_date,delivery_time_from,delivery_time_to,delivery_address_text,notes,companies!purchase_orders_company_id_fkey(legal_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((o) => ({
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
        .select("id,order_id,product_name,product_code,purchase_quantity,purchase_unit_code,ordered_quantity,unit_code,unit_cost,price_unit_code,notes");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
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
                if (!expanded && o.status !== "bozza") {
                  void supabase.rpc("mark_order_seen_by_supplier", { _order_id: o.id });
                }
              }}
            >
              {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.number ?? "Ordine"}</span>
                  <Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {o.buyer} · {fmtDateTime.format(new Date(o.sent_at ?? o.created_at))}
                  {items.length > 0 ? ` · ${items.length} prodott${items.length === 1 ? "o" : "i"}` : ""}
                </p>
              </div>
            </button>
            {expanded ? (
              <CardContent className="space-y-3 border-t pt-3">
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
                        <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{it.product_name ?? "Prodotto"}</p>
                            {it.product_code ? <p className="text-xs text-muted-foreground">Cod. {it.product_code}</p> : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p>
                              {it.purchase_quantity != null ? fmtQty.format(it.purchase_quantity) : "—"}{" "}
                              {it.purchase_unit_code ?? it.unit_code ?? ""}
                            </p>
                            {it.unit_cost != null ? (
                              <p className="text-xs text-muted-foreground">
                                {fmtPrice.format(it.unit_cost)}{it.price_unit_code ? ` / ${it.price_unit_code}` : ""}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
