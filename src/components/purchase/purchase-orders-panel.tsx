import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, LayoutGrid, MoreHorizontal, Rows3, Copy, FilePlus2, MoreVertical, MessageSquare, Pencil, Phone, Send, Trash2, Truck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ChangeRequestDialog, OrderEditDialog, OrderCancelDialog } from "./order-customer-actions";
import { managePurchaseOrder } from "@/lib/purchase.functions";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PurchaseOrderDetail } from "./purchase-order-detail";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DirectPurchaseCard, DirectPurchaseOpener, useDirectPurchases, type OpenDirectPurchase } from "./direct-purchases-section";
import { deliveryTimelineFacts } from "@/lib/incassi/incassi-link";
import { ORDER_FILTER_LABELS, compareOrderStage, initialOrderFilter, isLateOrder, orderStageRank, compareDirectPurchases, showsDirectPurchases, matchesOrderListFilter, orderMainAction, orderTimeline, showsReceiveButton, ddtArrivedLabel, type OrderListFilter } from "./order-list-presentation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { deliveryDateLabel, localToday, timeRangeLabel, useDeliveryPreferences } from "@/lib/delivery-preferences";
import { qty, type LocationRow } from "@/lib/inventory";
import { type OrderOverviewRow } from "@/lib/purchase";
import { createPurchaseOrdersFromList, getOrdersDdtSummary } from "@/lib/purchase.functions";
import { canReshareOrder } from "@/lib/b2b-order-sharing";
import { B2bOrderShareDialog } from "./b2b-order-share-dialog";
import { supplierToneStyle, useSupplierColors } from "@/components/suppliers/supplier-color";
import { OrderShareDialog } from "./order-share-dialog";

type ConfirmedList = { id: string; name: string; confirmed_at: string | null };

/** Ordini fornitore: l'ordine non è giacenza, la giacenza arriva solo col carico merce. */
export function PurchaseOrdersPanel({ companyId, initialFilter, onDetailChange }: { companyId: string; initialFilter?: OrderListFilter; onDetailChange?: (open: boolean) => void }) {
  const [chosenFilter, setFilter] = useState<OrderListFilter | null>(initialFilter ?? null);
  const [destinationFilter, setDestinationFilter] = useState("tutte");
  const [viewChoice, setViewMode] = useState<"card" | "row" | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [calling, setCalling] = useState<string | null>(null);
  const runCreate = useServerFn(createPurchaseOrdersFromList);
  const [selected, setSelected] = useState<string | null>(null);
  const [receiveOnOpen, setReceiveOnOpen] = useState(false);
  const [openDirect, setOpenDirect] = useState<OpenDirectPurchase | null>(null);
  const directQuery = useDirectPurchases(companyId);
  const [resharing, setResharing] = useState<OrderOverviewRow | null>(null);
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
        result.orderIds.length === 0
          ? "Lista chiusa: registrati solo acquisti diretti"
          : result.orderIds.length === 1
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
        .select("id, relation_id, origin, sent_at, seen_by_supplier_at, danea_exported_at, cancel_reason, shopping_lists(status), purchase_deliveries(status)")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const relIds = [...new Set(rows.map((r) => r.relation_id).filter((x): x is string => Boolean(x)))];
      const phoneByRel = new Map<string, string | null>();
      if (relIds.length) {
        const { data: rels } = await supabase.from("supplier_customer_relations").select("id, seller_company_id").in("id", relIds);
        const sellerIds = [...new Set((rels ?? []).map((r) => r.seller_company_id))];
        const { data: comps } = sellerIds.length
          ? await supabase.from("companies").select("id, phone").in("id", sellerIds)
          : { data: [] as { id: string; phone: string | null }[] };
        const phoneByCompany = new Map((comps ?? []).map((c) => [c.id, c.phone]));
        for (const r of rels ?? []) phoneByRel.set(r.id, phoneByCompany.get(r.seller_company_id) ?? null);
      }
      const { data: reqs } = await supabase
        .from("purchase_order_change_requests")
        .select("order_id, status, decision_note, requested_at")
        .eq("buyer_company_id", companyId)
        .order("requested_at", { ascending: false });
      const lastReq = new Map<string, { status: string; decision_note: string | null }>();
      for (const r of reqs ?? []) if (!lastReq.has(r.order_id)) lastReq.set(r.order_id, r);
      const { data: prog } = rows.length ? await supabase.rpc("order_delivery_progress", { _order_ids: rows.map((r) => r.id) }) : { data: [] };
      const progMap = new Map((prog ?? []).map((p) => [p.order_id, p]));
      return rows.map((r) => ({
        ...r,
        progress: progMap.get(r.id) ?? null,
        phone: r.relation_id ? (phoneByRel.get(r.relation_id) ?? null) : null,
        request: lastReq.get(r.id) ?? null,
      }));
    },
  });
  const readDdt = useServerFn(getOrdersDdtSummary);
  const awaitingIds = (ordersQuery.data ?? []).filter((o) => showsReceiveButton(o)).map((o) => o.order_id).sort();
  const ddtQuery = useQuery({
    queryKey: ["purchase-orders-ddt", companyId, awaitingIds.join(",")],
    enabled: awaitingIds.length > 0,
    queryFn: () => readDdt({ data: { orderIds: awaitingIds } }),
  });
  const ddtMap = new Map<string, { docNumber: string | null; lineCount: number }>();
  for (const d of ddtQuery.data ?? []) if (!ddtMap.has(d.orderId)) ddtMap.set(d.orderId, d);
  const seenMap = new Map<string, string | null>();
  const seenRelation = new Set<string>();
  // Bozze nate da una Lista annullata: non più inviabili, si mostrano tra gli annullati (nessun dato cambiato).
  const deadDrafts = new Set<string>();
  const phoneMap = new Map<string, string | null>();
  const timelineFacts = new Map<string, { sent_at: string | null; seen_by_supplier_at: string | null; supplier_received_at: string | null; contested: boolean } & ReturnType<typeof deliveryTimelineFacts>>();
  const requestMap = new Map<string, { status: string; decision_note: string | null } | null>();
  for (const r of seenQuery.data ?? []) {
    seenMap.set(r.id, r.seen_by_supplier_at);
    timelineFacts.set(r.id, { sent_at: r.sent_at, seen_by_supplier_at: r.seen_by_supplier_at, supplier_received_at: r.danea_exported_at, contested: ((r as { purchase_deliveries?: { status: string }[] | null }).purchase_deliveries ?? []).some((d) => d.status === "in_contestazione"), ...deliveryTimelineFacts(r.progress) });
    phoneMap.set(r.id, r.phone);
    requestMap.set(r.id, r.request);
    if (r.relation_id) seenRelation.add(r.id);
    if ((r as { shopping_lists?: { status?: string } | null }).shopping_lists?.status === "annullata") deadDrafts.add(r.id);
  }
  const [editing, setEditing] = useState<OrderOverviewRow | null>(null);
  const [cancelling, setCancelling] = useState<OrderOverviewRow | null>(null);
  const [requesting, setRequesting] = useState<OrderOverviewRow | null>(null);
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
  const supplierColors = useSupplierColors(companyId);
  const today = localToday(prefs.data?.timezone ?? "Europe/Rome");
  const current = useMemo(
    () => orders.find((order) => order.order_id === selected) ?? null,
    [orders, selected],
  );
  const isDead = (o: OrderOverviewRow) => o.status === "annullato" || (o.status === "bozza" && deadDrafts.has(o.order_id));
  // Presentazione: rango dello stato unico (orderTimeline) per scheda e ordinamento.
  const factsOf = (o: OrderOverviewRow) => timelineFacts.get(o.order_id) ?? { sent_at: null, seen_by_supplier_at: null, supplier_received_at: null, contested: false };
  const ranked = orders.map((o) => { const t = orderTimeline({ status: o.status, ...factsOf(o) }); return { o, t, cancelled: isDead(o), rank: orderStageRank(o, t, isDead(o)) }; });
  const filter: OrderListFilter = chosenFilter ?? (ordersQuery.isSuccess ? initialOrderFilter(ranked) : "in_arrivo");
  const viewMode = viewChoice ?? (isMobile ? "row" : "card");
  const multiDestination = (locationsQuery.data?.length ?? 0) > 1;
  const byDestination = (o: OrderOverviewRow) => !multiDestination || destinationFilter === "tutte" || o.destination_location_id === destinationFilter;
  const tabCount = (f: OrderListFilter) => f === "acquisti_diretti" ? (directQuery.data?.length ?? 0) : ranked.filter(({ o, t, cancelled }) => byDestination(o) && matchesOrderListFilter(o, f, cancelled, t)).length;
  const visibleOrders = ranked.filter(({ o, t, cancelled }) => byDestination(o) && matchesOrderListFilter(o, filter, cancelled, t)).sort(compareOrderStage).map(({ o }) => o);
  const visibleIds = visibleOrders.map(o => o.order_id);
  const linesQuery = useQuery({
    queryKey: ["supplier-order-card-lines", companyId, visibleIds.join(",")],
    enabled: visibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_order_items")
        .select("id, order_id, product_name, product_code, purchase_quantity, purchase_unit_code, ordered_quantity, unit_code, products(code, description)")
        .in("order_id", visibleIds).order("product_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const detailOpen = Boolean(current || openDirect);
  useEffect(() => { onDetailChange?.(detailOpen); }, [detailOpen, onDetailChange]);
  const directRows = showsDirectPurchases(filter) ? [...(directQuery.data ?? [])].sort(compareDirectPurchases) : [];
  const directCount = directQuery.data?.length ?? 0;

  if (openDirect) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setOpenDirect(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Torna agli ordini
        </Button>
        <DirectPurchaseOpener companyId={companyId} open={openDirect} onClose={() => setOpenDirect(null)} onChanged={() => directQuery.refetch()} />
      </div>
    );
  }

  if (current) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setReceiveOnOpen(false); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Torna agli ordini
        </Button>
        <PurchaseOrderDetail order={current} companyId={companyId} locations={locations} initialReceiving={receiveOnOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {resharing && seenQuery.isSuccess ? seenRelation.has(resharing.order_id) ? (
        <B2bOrderShareDialog orderId={resharing.order_id} number={resharing.number} supplier={resharing.supplier_name} onClose={() => setResharing(null)} />
      ) : (
        <OrderShareDialog orderId={resharing.order_id} mode="resend" onClose={() => setResharing(null)} onConfirmed={async () => { await refreshOrders(); await queryClient.invalidateQueries({ queryKey: ['order-share-history', resharing.order_id] }); }} />
      ) : null}
      <Dialog open={Boolean(calling)} onOpenChange={open => { if (!open) setCalling(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Numero del fornitore</DialogTitle></DialogHeader>
          <p className="text-2xl font-semibold">{calling}</p>
          <DialogFooter><Button onClick={async () => { if (calling) { await navigator.clipboard.writeText(calling); toast.success("Numero copiato"); } }}><Copy className="mr-1 size-4" />Copia</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <OrderEditDialog order={editing} onClose={() => setEditing(null)} onSaved={refreshOrders} />
      <ChangeRequestDialog order={requesting} onClose={() => setRequesting(null)} onSent={refreshOrders} />
      <OrderCancelDialog
        order={cancelling}
        pending={cancelOrder.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={(o) => cancelOrder.mutate(o)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {isMobile ? (
          <div className="flex min-w-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90" aria-label="Scegli scheda e filtri"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuRadioGroup value={filter} onValueChange={(v) => setFilter(v as OrderListFilter)}>
                  {(Object.keys(ORDER_FILTER_LABELS) as OrderListFilter[]).map((f) => <DropdownMenuRadioItem key={f} value={f}>{ORDER_FILTER_LABELS[f]} ({tabCount(f)})</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                {multiDestination ? <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Destinazione</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={destinationFilter} onValueChange={setDestinationFilter}>
                    <DropdownMenuRadioItem value="tutte">Tutte</DropdownMenuRadioItem>
                    {(locationsQuery.data ?? []).map((l) => <DropdownMenuRadioItem key={l.id} value={l.id}>{l.name}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </> : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="min-w-0 truncate text-sm font-semibold">{ORDER_FILTER_LABELS[filter]} · {tabCount(filter)}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2" aria-label="Schede ordini">
            {(Object.keys(ORDER_FILTER_LABELS) as OrderListFilter[]).map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} aria-pressed={filter === f} onClick={() => setFilter(f)}>{ORDER_FILTER_LABELS[f]} ({tabCount(f)})</Button>)}
            {multiDestination ? <Select value={destinationFilter} onValueChange={setDestinationFilter}>
              <SelectTrigger className="h-9 w-48" aria-label="Destinazione"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le destinazioni</SelectItem>
                {(locationsQuery.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select> : null}
          </div>
        )}
        <div className="grid grid-cols-2 rounded-md border border-border p-0.5" role="group" aria-label="Visualizzazione ordini">
          <Button type="button" size="sm" className="h-8 text-xs" variant={viewMode === "card" ? "default" : "ghost"} aria-pressed={viewMode === "card"} onClick={() => setViewMode("card")}><LayoutGrid aria-hidden="true" /> Card</Button>
          <Button type="button" size="sm" className="h-8 text-xs" variant={viewMode === "row" ? "default" : "ghost"} aria-pressed={viewMode === "row"} onClick={() => setViewMode("row")}><Rows3 aria-hidden="true" /> Righe</Button>
        </div>
      </div>
      {ordersQuery.isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
      {ordersQuery.isError ? <p className="text-sm text-destructive">{ordersQuery.error.message}</p> : null}
      {linesQuery.isError ? <p className="text-sm text-destructive">{linesQuery.error.message}</p> : null}
      <div className={viewMode === "row" ? "grid gap-2" : "grid gap-3 md:grid-cols-2"}>
        {visibleOrders.map(order => {
          const dead = isDead(order);
          const b2bSent = order.status === "inviato" && seenRelation.has(order.order_id);
          const locked = Boolean(seenMap.get(order.order_id));
          const phone = phoneMap.get(order.order_id);
          const request = requestMap.get(order.order_id);
          const lines = (linesQuery.data ?? []).filter(l => l.order_id === order.order_id);
          const stage = orderTimeline({ status: dead ? "annullato" : order.status, ...factsOf(order) });
          const late = isLateOrder(order, today, dead, stage);
          const toggle = () => setExpanded((cur) => { const next = new Set(cur); if (next.has(order.order_id)) next.delete(order.order_id); else next.add(order.order_id); return next; });
          const ddtLabel = ddtArrivedLabel(ddtMap.get(order.order_id));
          const receiveNow = showsReceiveButton(order, dead);
          const openReceive = () => { setReceiveOnOpen(true); setSelected(order.order_id); };
          const receiveButton = receiveNow ? <Button className="mt-2 h-12 w-full font-semibold" onClick={openReceive}><Truck className="mr-2 size-4" />{orderMainAction(order, dead)}</Button> : null;
          if (viewMode === "row" && !expanded.has(order.order_id)) return <div key={order.order_id} className="min-w-0"><button type="button" onClick={toggle} aria-expanded={false} className={`flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left ${supplierColors.toneByName(order.supplier_name) ? "supplier-tint border-l-[6px] border-l-[var(--supplier-tone)]" : ""}`} style={supplierToneStyle(supplierColors.toneByName(order.supplier_name))}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stage.currentColor}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{order.supplier_name}</span>
              <span className="block truncate text-xs text-muted-foreground">{order.number} · {stage.currentLabel} · {deliveryDateLabel(order.delivery_date, today).replace(" — ", " · ")}</span>
              {late ? <span className="block text-xs font-semibold text-destructive">In ritardo</span> : null}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>{ddtLabel ? <p className="mt-1 px-1 text-xs font-medium">{ddtLabel}</p> : null}{receiveButton}</div>;
          return <article key={order.order_id} className={supplierColors.toneByName(order.supplier_name) ? "supplier-tint min-w-0 rounded-lg border border-border border-l-[6px] border-l-[var(--supplier-tone)] bg-card p-3" : "min-w-0 rounded-lg border border-border bg-card p-3"} style={supplierToneStyle(supplierColors.toneByName(order.supplier_name))}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold"><span className="break-words">{order.supplier_name}</span></p>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{order.number}{seenQuery.data?.find(r => r.id === order.order_id)?.origin === "telefonico_ddt" ? <Badge variant="outline">Ordine telefonico</Badge> : null}</p>
                {(() => { const t = orderTimeline({ status: dead ? "annullato" : order.status, ...(timelineFacts.get(order.order_id) ?? { sent_at: null, seen_by_supplier_at: null, supplier_received_at: null, contested: false }) }); return <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.currentColor}`} aria-hidden="true" /><span>{t.currentLabel}</span>{t.notDelivered && !dead ? <span className="inline-flex items-center gap-1 text-destructive"><span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden="true" />Non consegnato</span> : null}{t.contested && !dead ? <span className="inline-flex items-center gap-1 text-destructive"><span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden="true" />Contestato</span> : null}</p>; })()}
              </div>
              <div className="flex shrink-0 items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Azioni ${order.number}`} title="Azioni ordine"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => { setReceiveOnOpen(false); setSelected(order.order_id); }}>Visualizza ordine</DropdownMenuItem>
                  {!dead && canReshareOrder(order.status) ? <DropdownMenuItem disabled={!seenQuery.isSuccess} onSelect={() => setResharing(order)}><Send className="mr-2 size-4" />Rimanda ordine</DropdownMenuItem> : null}
                  {b2bSent ? <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={locked} onSelect={() => setEditing(order)}><Pencil className="mr-2 size-4" />Modifica</DropdownMenuItem>
                    {locked ? <>
                      {request?.status !== "in_attesa" ? <DropdownMenuItem onSelect={() => setRequesting(order)}><MessageSquare className="mr-2 size-4" />Chiedi modifica</DropdownMenuItem> : null}
                      {phone?.trim() ? isMobile ? <DropdownMenuItem asChild><a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone className="mr-2 size-4" />Chiama</a></DropdownMenuItem> : <DropdownMenuItem onSelect={() => setCalling(phone)}><Phone className="mr-2 size-4" />Chiama</DropdownMenuItem> : null}
                      <DropdownMenuItem asChild><Link to="/acquisti/lista-spesa"><FilePlus2 className="mr-2 size-4" />Nuovo ordine</Link></DropdownMenuItem>
                    </> : <DropdownMenuItem onSelect={() => setCancelling(order)} className="text-destructive"><Trash2 className="mr-2 size-4" />Annulla ordine</DropdownMenuItem>}
                  </> : null}
                </DropdownMenuContent>
              </DropdownMenu>
              {viewMode === "row" ? <Button variant="ghost" size="icon" className="min-w-11" aria-label="Chiudi riga" aria-expanded onClick={toggle}><ChevronDown className="size-4 rotate-180" /></Button> : null}
              </div>
            </div>
            {late ? <p className="mt-2 text-xs font-semibold text-destructive">In ritardo</p> : null}
            <p className="mt-2 text-sm font-medium">Consegna prevista: {deliveryDateLabel(order.delivery_date, today).replace(" — ", " · ")}</p>
            <p className="text-sm text-muted-foreground">{timeRangeLabel(order.delivery_time_from, order.delivery_time_to)}</p>
            <ul className="my-3 space-y-1 text-sm">
              {lines.map(line => <li key={line.id} className="flex items-start justify-between gap-3"><span className="min-w-0 break-words">{line.product_name ?? line.products?.description ?? line.product_code ?? line.products?.code ?? "Prodotto"}</span><span className="shrink-0 font-medium">{line.purchase_quantity != null ? `${qty(line.purchase_quantity)} ${line.purchase_unit_code ?? ""}` : line.ordered_quantity != null ? `${qty(line.ordered_quantity)} ${line.unit_code ?? ""}` : "—"}</span></li>)}
              {linesQuery.isLoading ? <li className="text-muted-foreground">Caricamento prodotti…</li> : null}
            </ul>
            {order.open_disputes > 0 ? <Badge variant="destructive" className="mb-2">{order.open_disputes} da risolvere</Badge> : null}
            {request?.status === "in_attesa" ? <p className="mb-2 text-xs text-muted-foreground">Richiesta di modifica in attesa</p> : null}
            {request?.status === "rifiutata" ? <p className="mb-2 text-xs text-destructive">Richiesta rifiutata{request.decision_note ? `: ${request.decision_note}` : ""}</p> : null}
            {dead && seenQuery.data?.find(r => r.id === order.order_id)?.cancel_reason ? <p className="mb-2 text-xs text-destructive">Motivo: {seenQuery.data?.find(r => r.id === order.order_id)?.cancel_reason}</p> : null}
            {ddtLabel ? <p className="mb-1 text-xs font-medium">{ddtLabel}</p> : null}
            {receiveButton ?? <Button size="sm" className="font-semibold" onClick={() => { setReceiveOnOpen(!dead && (order.status === 'inviato' || order.status === 'parzialmente_consegnato')); setSelected(order.order_id); }}>{orderMainAction(order, dead)}</Button>}
          </article>;
        })}
        {directRows.map(row => <DirectPurchaseCard key={row.id} row={row} onOpen={() => setOpenDirect({ id: row.id, listId: row.shopping_list_id, status: row.status })} />)}
      </div>
      {directQuery.isError ? <p className="text-sm text-destructive">{directQuery.error.message}</p> : null}
      {filter === "acquisti_diretti" && !directQuery.isLoading && directCount === 0 ? <p className="text-sm text-muted-foreground">Nessun acquisto diretto.</p> : null}
      {filter !== "acquisti_diretti" && !ordersQuery.isLoading && visibleOrders.length === 0 && orders.length > 0 ? <p className="text-sm text-muted-foreground">Nessun ordine per questo filtro.</p> : null}
      {orders.length === 0 && !ordersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Nessun ordine fornitore.</p>
      ) : null}
    </div>
  );
}
