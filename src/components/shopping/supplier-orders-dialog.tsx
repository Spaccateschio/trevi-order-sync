import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, CalendarClock, Check, Loader2, MapPin, Pencil, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SupplierDot, supplierToneStyle } from "@/components/suppliers/supplier-color";
import { B2bOrderShareDialog } from "@/components/purchase/b2b-order-share-dialog";
import { OrderShareDialog } from "@/components/purchase/order-share-dialog";
import { supabase } from "@/integrations/supabase/client";
import { bulkUnsentB2bSupplierIds } from "@/lib/local-entry-cart";
import { qty } from "@/lib/inventory";
import { addDays, localToday, useDeliveryPreferences } from "@/lib/delivery-preferences";
import { deliveryDefaults, halfHourTime } from "@/lib/order-delivery-defaults";
import {
  DELIVERY_PLACE_MANUAL,
  DELIVERY_PLACE_PICKUP,
  DELIVERY_PLACE_PICKUP_TEXT,
  DELIVERY_PLACE_SAVED_PREFIX,
  deliveryPlaceFromSelection,
  deliveryPlaceSelectValue,
  normalizeDeliveryPlace,
  shouldSaveDeliveryPlace,
  type SavedDeliveryPlace,
} from "@/lib/order-delivery-place";
import { supplierOrderIssueReason } from "@/lib/supplier-order-issues";
import { confirmAssignmentCoverage, generateSupplierOrder, getGenerationPreview, saveSupplierOrderDeliveryPlace, updateDraftOrder, type GenerationLine } from "@/lib/order-generation.functions";
import { managePurchaseOrder } from "@/lib/purchase.functions";
import type { SupplierColorCode } from "@/lib/supplier-color";

type Schedule = { date: string; from: string; to: string };
type DeliveryOverride = Schedule & { address: string; addressId: string | null; savePlace: boolean };
type OrderItem = { id: string; product_name: string | null; product_code: string | null; purchase_quantity: number | null; purchase_unit_code: string | null };
type SupplierOrder = {
  id: string;
  number: string;
  supplier_record_id: string;
  relation_id: string | null;
  status: string;
  sent_at: string | null;
  delivery_date: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  delivery_address_text: string | null;
  destination_address_id: string | null;
  supplier_notes: string | null;
  supplier_records: { legal_name: string | null } | null;
  purchase_order_items: OrderItem[];
};
type DisplayLine = { id: string; label: string; detail: string | null; quantity: string; unitCode: string | null };
type SupplierGroup = {
  supplierId: string;
  name: string;
  isB2b: boolean;
  order: SupplierOrder | null;
  previewLines: GenerationLine[];
  lines: DisplayLine[];
};

const hhmm = (value: string | null | undefined) => (value ?? "").slice(0, 5);
const dateLabel = (iso: string) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "";
export function scheduleLabel(s: Schedule) {
  const time = s.from && s.to ? `${s.from}–${s.to}` : s.from || s.to;
  return [dateLabel(s.date), time].filter(Boolean).join(" · ");
}

const NO_TIME = "__non_impostato__";
const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
function HalfHourTimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Select value={value || NO_TIME} onValueChange={(next) => onChange(next === NO_TIME ? "" : next)}>
    <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value={NO_TIME}>Non impostato</SelectItem>
      {HALF_HOUR_TIMES.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}
    </SelectContent>
  </Select>;
}

/** Stessa presentazione approvata, alimentata dalle bozze e dagli ordini reali della Lista. */
export function SupplierOrdersDialog({ open, onOpenChange, companyId, listId, supplierTone, saveErrors = [], onGoToItem, onListClosed, onBack }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  listId: string;
  supplierTone?: ((name: string | null | undefined) => { color: SupplierColorCode } | null) | undefined;
  saveErrors?: { id: string; label: string; message: string }[];
  onGoToItem: (itemId: string) => void;
  onListClosed: () => void;
  /** Riapre il Carrello senza salvare nulla. */
  onBack?: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const readPreview = useServerFn(getGenerationPreview);
  const runGenerate = useServerFn(generateSupplierOrder);
  const runUpdate = useServerFn(updateDraftOrder);
  const runSavePlace = useServerFn(saveSupplierOrderDeliveryPlace);
  const runSend = useServerFn(managePurchaseOrder);
  const runCoverage = useServerFn(confirmAssignmentCoverage);
  // Popup «Da sistemare»: mostra il punto che blocca l'invio di un fornitore.
  const [fixing, setFixing] = useState<{ supplierId: string; message: string | null } | null>(null);
  const [coveragePending, setCoveragePending] = useState<string | null>(null);
  // Righe aperte: all'inizio solo i fornitori non ancora inviati; dopo un invio la riga si chiude da sola.
  const [openItems, setOpenItems] = useState<string[] | null>(null);
  const generationKeys = useRef<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, DeliveryOverride>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeliveryOverride>({ date: "", from: "", to: "", address: "", addressId: null, savePlace: false });
  const [sharing, setSharing] = useState<{ orderId: string; mode: "first" | "resend" } | null>(null);
  const [sharingB2b, setSharingB2b] = useState<{ orderId: string; number: string; supplier: string } | null>(null);

  const preview = useQuery({
    queryKey: ["supplier-orders-preview", listId],
    enabled: open,
    queryFn: () => readPreview({ data: { listId } }),
  });
  const orders = useQuery({
    queryKey: ["supplier-orders-documents", listId],
    enabled: open,
    queryFn: async (): Promise<SupplierOrder[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, number, supplier_record_id, relation_id, status, sent_at, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, destination_address_id, supplier_notes, supplier_records(legal_name), purchase_order_items(id, product_name, product_code, purchase_quantity, purchase_unit_code)")
        .eq("shopping_list_id", listId)
        .neq("status", "annullato")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SupplierOrder[];
    },
  });

  const groups = useMemo<SupplierGroup[]>(() => {
    const bySupplier = new Map<string, SupplierOrder>();
    for (const order of orders.data ?? []) if (!bySupplier.has(order.supplier_record_id)) bySupplier.set(order.supplier_record_id, order);
    const previews = new Map((preview.data?.suppliers ?? []).map((supplier) => [supplier.supplier_record_id, supplier]));
    const ids = new Set<string>([...previews.keys(), ...bySupplier.keys()]);
    return [...ids].map((supplierId) => {
      const source = previews.get(supplierId);
      const order = bySupplier.get(supplierId) ?? null;
      const previewLines = source?.lines ?? [];
      const lines: DisplayLine[] = order
        ? order.purchase_order_items.map((line) => ({ id: line.id, label: line.product_name ?? "Prodotto", detail: line.product_code, quantity: line.purchase_quantity === null ? "—" : qty(Number(line.purchase_quantity)), unitCode: line.purchase_unit_code }))
        : previewLines.map((line) => ({ id: line.assignment_id, label: line.name, detail: line.code, quantity: qty(Number(line.quantity)), unitCode: line.unit_code }));
      return {
        supplierId,
        name: source?.name ?? order?.supplier_records?.legal_name ?? "Fornitore",
        isB2b: order ? order.relation_id !== null : source?.is_b2b ?? false,
        order,
        previewLines,
        lines,
      };
    }).filter((group) => group.lines.length > 0).sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [orders.data, preview.data]);

  const prefs = useDeliveryPreferences(open ? companyId : null);
  const savedPlaces = useQuery({
    queryKey: ["company-delivery-places", companyId],
    enabled: open,
    queryFn: async (): Promise<SavedDeliveryPlace[]> => {
      const { data, error } = await supabase.from("company_delivery_places").select("id, text").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const supplierIds = groups.map((group) => group.supplierId).sort();
  // Come nel flusso precedente: l'ultimo ordine del fornitore ripropone orario e luogo, mai la data.
  const lastOrders = useQuery({
    queryKey: ["last-orders-delivery", companyId, supplierIds.join(",")],
    enabled: open && supplierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("supplier_record_id, destination_address_id, delivery_time_from, delivery_time_to, delivery_address_text, created_at")
        .eq("company_id", companyId)
        .in("supplier_record_id", supplierIds)
        .neq("status", "annullato")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const map: Record<string, { from: string | null; to: string | null; address: string | null; addressId: string | null }> = {};
      for (const order of data ?? []) {
        if (!order.supplier_record_id || map[order.supplier_record_id]) continue;
        map[order.supplier_record_id] = { from: order.delivery_time_from, to: order.delivery_time_to, address: order.delivery_address_text, addressId: order.destination_address_id };
      }
      return map;
    },
  });
  const proposedDelivery = (group: SupplierGroup) => {
    const p = prefs.data;
    const today = localToday(p?.timezone ?? "Europe/Rome");
    const addresses = p?.addresses ?? [];
    const values = deliveryDefaults({
      today,
      list: preview.data ? { date: preview.data.delivery.date, from: preview.data.delivery.time_from, to: preview.data.delivery.time_to, address: preview.data.delivery.address_text, addressId: preview.data.delivery.address_id } : null,
      lastOrder: lastOrders.data?.[group.supplierId] ?? null,
      company: p ? { date: p.day === "domani" ? addDays(today, 1) : today, from: p.timeFrom, to: p.timeTo, addressId: p.addressId } : null,
      addresses,
      mainDeliveryAddressId: addresses.find((address) => address.functions.includes("consegna"))?.id ?? null,
    });
    return { ...values, from: halfHourTime(values.from), to: halfHourTime(values.to) };
  };
  const tone = (name: string) => supplierTone?.(name) ?? null;
  const groupById = (id: string) => groups.find((group) => group.supplierId === id);
  const scheduleOf = (group: SupplierGroup): Schedule => overrides[group.supplierId] ?? (group.order ? {
    date: group.order.delivery_date ?? "",
    from: hhmm(group.order.delivery_time_from),
    to: hhmm(group.order.delivery_time_to),
  } : proposedDelivery(group));
  const placeOf = (group: SupplierGroup): Pick<DeliveryOverride, "address" | "addressId" | "savePlace"> => {
    const override = overrides[group.supplierId];
    if (override) return { address: override.address, addressId: override.addressId, savePlace: override.savePlace };
    if (group.order) return { address: group.order.delivery_address_text ?? "", addressId: group.order.destination_address_id, savePlace: false };
    const proposed = proposedDelivery(group);
    return { address: proposed.address, addressId: proposed.addressId, savePlace: false };
  };
  const noteOf = (group: SupplierGroup) => notes[group.supplierId] ?? group.order?.supplier_notes ?? "";
  const bulkIds = bulkUnsentB2bSupplierIds(groups.map((group) => ({ supplierId: group.supplierId, isB2b: group.isB2b, sentAt: group.order?.sent_at ?? null })));
  const sentCount = groups.filter((group) => group.order?.sent_at).length;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["supplier-orders-preview", listId] }),
      queryClient.invalidateQueries({ queryKey: ["supplier-orders-documents", listId] }),
      queryClient.invalidateQueries({ queryKey: ["generation-preview", listId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-status-orders", listId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-cycle"] }),
    ]);
  };
  const listClosedNow = async () => {
    const { data, error } = await supabase.from("shopping_lists").select("status").eq("id", listId).single();
    if (error) throw new Error(error.message);
    return data.status === "chiusa";
  };
  const finishIfClosed = (closed: boolean) => {
    if (!closed) return;
    toast.success("Lista completata e chiusa");
    onOpenChange(false);
    onListClosed();
  };
  const setBusy = (supplierId: string, busy: boolean) => setPending((current) => {
    const next = new Set(current);
    if (busy) next.add(supplierId); else next.delete(supplierId);
    return next;
  });

  /** Crea una sola bozza per fornitore; su una bozza esistente salva note e consegna prima dell'invio. */
  const ensureOrder = async (group: SupplierGroup) => {
    const schedule = scheduleOf(group);
    const place = placeOf(group);
    if (shouldSaveDeliveryPlace(place)) {
      await runSavePlace({ data: { listId, text: normalizeDeliveryPlace(place.address) } });
      await queryClient.invalidateQueries({ queryKey: ["company-delivery-places", companyId] });
    }
    const delivery = {
      date: schedule.date || null,
      time_from: schedule.from || null,
      time_to: schedule.to || null,
      address_text: normalizeDeliveryPlace(place.address) || null,
      address_id: place.addressId,
      notes: noteOf(group).trim() || null,
    };
    if (group.order) {
      if (!group.order.sent_at) await runUpdate({ data: { orderId: group.order.id, lines: [], delivery } });
      return group.order.id;
    }
    const generationKey = (generationKeys.current[group.supplierId] ??= crypto.randomUUID());
    const result = await runGenerate({
      data: {
        listId,
        supplierRecordId: group.supplierId,
        generationKey,
        delivery,
        assignmentIds: group.previewLines.map((line) => line.assignment_id),
      },
    });
    // Come nell'altro percorso di generazione: un luogo manuale/ritiro non eredita il collegamento della Lista.
    if (!result.already_exists && place.addressId === null && preview.data?.delivery.address_id) {
      await runUpdate({ data: { orderId: result.order_id, lines: [], delivery } });
    }
    return result.order_id;
  };

  const sendOne = async (group: SupplierGroup) => {
    if (pending.has(group.supplierId) || bulkPending) return;
    if (group.order?.sent_at) {
      if (group.isB2b) setSharingB2b({ orderId: group.order.id, number: group.order.number, supplier: group.name });
      else setSharing({ orderId: group.order.id, mode: "resend" });
      return;
    }
    if (coverageLines(group).length) { setFixing({ supplierId: group.supplierId, message: null }); return; }
    setBusy(group.supplierId, true);
    try {
      const orderId = await ensureOrder(group);
      if (group.isB2b) {
        await runSend({ data: { orderId, action: "send", destinationLocationId: null, notes: null, sendChannel: null } });
        const closed = await listClosedNow();
        await refresh();
        collapse(group.supplierId);
        toast.success(`Ordine inviato a ${group.name}`);
        finishIfClosed(closed);
      } else {
        await refresh();
        setSharing({ orderId, mode: "first" });
      }
    } catch (error) {
      setFixing({ supplierId: group.supplierId, message: error instanceof Error ? error.message : "Invio non riuscito" });
    } finally {
      setBusy(group.supplierId, false);
    }
  };

  /** Salva l'ordine senza inviarlo, così un'altra persona può controllarlo e inviarlo. */
  const saveOne = async (group: SupplierGroup) => {
    if (pending.has(group.supplierId) || bulkPending || group.order?.sent_at) return;
    setBusy(group.supplierId, true);
    try {
      await ensureOrder(group);
      await refresh();
      toast.success(`Ordine per ${group.name} salvato: non è stato inviato`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setBusy(group.supplierId, false);
    }
  };

  const collapse = (supplierId: string) => setOpenItems((current) => (current ?? groups.filter((group) => !group.order?.sent_at).map((group) => group.supplierId)).filter((id) => id !== supplierId));
  const coverageLines = (group: SupplierGroup) => group.previewLines.filter((line) => line.needs_coverage && !line.coverage_confirmed);
  const confirmCoverage = async (assignmentId: string) => {
    setCoveragePending(assignmentId);
    try {
      await runCoverage({ data: { assignmentId, confirm: true } });
      await refresh();
      setFixing((current) => current ? { ...current, message: null } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conferma non riuscita");
    } finally {
      setCoveragePending(null);
    }
  };

  const sendBulkB2b = async () => {
    if (bulkPending || pending.size || !bulkIds.length) return;
    setBulkPending(true);
    let sent = 0;
    const errors: string[] = [];
    let closed = false;
    for (const supplierId of bulkIds) {
      const group = groupById(supplierId);
      if (!group) continue;
      setBusy(supplierId, true);
      try {
        const orderId = await ensureOrder(group);
        await runSend({ data: { orderId, action: "send", destinationLocationId: null, notes: null, sendChannel: null } });
        sent += 1;
        collapse(supplierId);
        closed = await listClosedNow();
      } catch (error) {
        errors.push(`${group.name}: ${error instanceof Error ? error.message : "invio non riuscito"}`);
      } finally {
        setBusy(supplierId, false);
      }
    }
    await refresh();
    setBulkPending(false);
    if (sent) toast.success(`${sent} ${sent === 1 ? "ordine B2B inviato" : "ordini B2B inviati"}`);
    if (errors.length) toast.error(errors.join(" · "));
    finishIfClosed(closed);
  };

  const draftPlaceSelection = deliveryPlaceSelectValue(draft, prefs.data?.addresses ?? [], savedPlaces.data ?? []);

  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!bulkPending) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden sm:max-w-2xl" overlayClassName="bg-black">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="size-4" /> Ordini per fornitore</DialogTitle>
          <DialogDescription>Fornitori e prodotti restano quelli del riepilogo. Usa l'aeroplanino per il singolo ordine oppure l'invio multiplo per i soli B2B.</DialogDescription>
        </DialogHeader>
        {bulkIds.length ? <Button type="button" variant="outline" className="w-full" disabled={bulkPending || pending.size > 0} onClick={() => void sendBulkB2b()}>{bulkPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Invia tutti gli ordini B2B ({bulkIds.length})</Button> : null}
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {saveErrors.length ? <section aria-label="Errori di salvataggio" className="rounded-md border border-destructive/40 bg-destructive/10 p-3" role="alert">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4" /> Prodotti non salvati ({saveErrors.length})</h3>
            <p className="mt-1 text-xs text-muted-foreground">Restano nel Carrello e non sono stati inclusi negli ordini. Correggi l’errore e premi di nuovo Conferma.</p>
            <ul className="mt-2 space-y-2">{saveErrors.map((line) => <li key={line.id} className="text-sm"><strong>{line.label}</strong><span className="block text-destructive">{line.message}</span></li>)}</ul>
          </section> : null}
          {preview.data?.issues.length ? <section aria-label="Prodotti da sistemare" className="rounded-md border border-warning/50 bg-warning/10 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4" /> Non inclusi negli ordini ({preview.data.issues.length})</h3>
            <p className="mt-1 text-xs text-muted-foreground">Non sono spariti: restano nella Lista. Sistema il prodotto per far comparire il relativo fornitore.</p>
            <ul className="mt-2 space-y-2">{preview.data.issues.map((issue) => <li key={issue.item_id} className="flex items-start gap-2 rounded-md bg-background/60 p-2">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{issue.code ? `${issue.code} · ` : ""}{issue.name}</p><p className="text-xs text-muted-foreground">{supplierOrderIssueReason(issue)}</p></div>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onGoToItem(issue.item_id)}>Sistema</Button>
            </li>)}</ul>
          </section> : null}
          {preview.isPending || orders.isPending ? <p className="text-sm text-muted-foreground">Caricamento ordini…</p> : preview.isError || orders.isError ? <p className="text-sm text-destructive" role="alert">{(preview.error ?? orders.error)?.message}</p> : groups.length ? <Accordion type="multiple" value={openItems ?? groups.filter((group) => !group.order?.sent_at).map((group) => group.supplierId)} onValueChange={setOpenItems} className="space-y-2">
            {groups.map((group) => {
              const t = tone(group.name);
              const isSent = Boolean(group.order?.sent_at);
              const busy = bulkPending || pending.has(group.supplierId);
              const when = scheduleLabel(scheduleOf(group));
              const address = placeOf(group).address;
              return <AccordionItem key={group.supplierId} value={group.supplierId} data-sent={isSent || undefined}
                className={isSent ? "rounded-md border border-success/50 bg-success/15 px-3" : t ? "supplier-tint rounded-md border border-border border-l-[6px] border-l-[var(--supplier-tone)] bg-card px-3" : "rounded-md border border-border px-3"}
                style={isSent ? undefined : supplierToneStyle(t)}>
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="min-w-0 flex-1 gap-2 py-3 hover:no-underline">
                    {t ? <SupplierDot color={t.color} className="size-3" /> : null}
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block break-words font-semibold">{group.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs font-normal text-muted-foreground">
                        <span>{group.lines.length} {group.lines.length === 1 ? "prodotto" : "prodotti"}</span>
                        {group.isB2b ? <Badge variant="outline" className="px-1 py-0 text-[10px]">B2B</Badge> : null}
                        {when ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" />{when}</span> : null}
                      </span>
                    </span>
                    {isSent ? <Badge variant="outline" className="border-success/60 text-xs"><Check className="size-3" /> Inviato</Badge> : group.order ? <Badge variant="outline" className="text-xs"><Save className="size-3" /> Salvato</Badge> : null}
                  </AccordionTrigger>
                  {!isSent ? <Button type="button" size="icon" variant="outline" className="size-9 shrink-0" disabled={busy} onClick={() => void saveOne(group)} aria-label={`Salva senza inviare l'ordine di ${group.name}`} title="Salva senza inviare">{<Save className="size-4" />}</Button> : null}
                  <Button type="button" size="icon" variant={isSent ? "outline" : "default"} className="size-9 shrink-0" disabled={busy} onClick={() => void sendOne(group)} aria-label={`${isSent ? "Rinvia" : "Invia"} ordine a ${group.name}`}>{busy && !isSent ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
                </div>
                <AccordionContent className="space-y-3">
                  <ul className="space-y-2">{group.lines.map((line) => <li key={line.id} className="rounded-md bg-muted/40 p-2">
                    <p className="break-words text-sm font-semibold">{line.label}</p>
                    {line.detail ? <p className="text-xs text-muted-foreground">{line.detail}</p> : null}
                    <p className="text-sm" data-quantity-edit-slot>Quantità: <strong>{line.quantity} {line.unitCode ?? ""}</strong></p>
                  </li>)}</ul>
                  <div className="rounded-md border border-border bg-background/60 p-2 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-1"><CalendarClock className="size-3.5 shrink-0" /> {when || <span className="text-muted-foreground">Data e orario non impostati (facoltativi)</span>}</p>
                        <p className="flex items-center gap-1"><MapPin className="size-3.5 shrink-0" /> {address || <span className="text-muted-foreground">Luogo non impostato</span>}</p>
                      </div>
                      {!isSent ? <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" disabled={busy} onClick={() => { const schedule = scheduleOf(group); const place = placeOf(group); setDraft({ ...schedule, ...place, from: halfHourTime(schedule.from), to: halfHourTime(schedule.to) }); setEditing(group.supplierId); }} aria-label={`Modifica consegna o ritiro per ${group.name}`}><Pencil className="size-4" /></Button> : null}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`note-${group.supplierId}`} className="text-xs">Nota per il fornitore (facoltativa)</Label>
                    <Textarea id={`note-${group.supplierId}`} rows={2} value={noteOf(group)} disabled={busy || isSent} onChange={(event) => setNotes((current) => ({ ...current, [group.supplierId]: event.target.value }))} placeholder="Es. lasciare in magazzino" />
                  </div>
                </AccordionContent>
              </AccordionItem>;
            })}
          </Accordion> : <p className="text-sm text-muted-foreground">Nessun prodotto con quantità confermata e fornitore assegnato.</p>}
        </div>
        <DialogFooter className="items-center gap-2"><p className="mr-auto text-xs text-muted-foreground">{sentCount} di {groups.length} inviati<br />Chiudere non invia né annulla ordini. Salva conserva l'ordine senza inviarlo.</p>{onBack ? <Button variant="outline" disabled={bulkPending} onClick={onBack}><ArrowLeft className="size-4" /> Torna indietro</Button> : null}<Button variant="outline" disabled={bulkPending} onClick={() => onOpenChange(false)}>Chiudi finestra</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(next) => { if (!next) setEditing(null); }}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Data, orario e luogo</DialogTitle><DialogDescription>{editing ? groupById(editing)?.name : ""} · le modifiche si salvano con Salva o con l'invio. L'orario verrà riproposto nel prossimo ordine di questo fornitore.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label className="text-xs">Giorno<Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label className="text-xs">Dalle</Label><HalfHourTimeSelect label="Dalle" value={draft.from} onChange={(from) => setDraft({ ...draft, from })} /></div>
              <div className="space-y-2"><Label className="text-xs">Alle</Label><HalfHourTimeSelect label="Alle" value={draft.to} onChange={(to) => setDraft({ ...draft, to })} /></div>
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label className="text-xs">Dove consegnare o ritirare</Label>
            <Select value={draftPlaceSelection} onValueChange={(selection) => setDraft((current) => ({ ...current, ...deliveryPlaceFromSelection(selection, current, prefs.data?.addresses ?? [], savedPlaces.data ?? []) }))}>
              <SelectTrigger aria-label="Luogo o indicazione" className="h-auto min-h-9 whitespace-normal"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(prefs.data?.addresses ?? []).map((address) => <SelectItem key={address.id} value={address.id}>{address.text || "Indirizzo senza descrizione"}</SelectItem>)}
                <SelectItem value={DELIVERY_PLACE_PICKUP}>{DELIVERY_PLACE_PICKUP_TEXT}</SelectItem>
                {(savedPlaces.data ?? []).map((place) => <SelectItem key={place.id} value={`${DELIVERY_PLACE_SAVED_PREFIX}${place.id}`}>{place.text}</SelectItem>)}
                <SelectItem value={DELIVERY_PLACE_MANUAL}>Scrivi un indirizzo o una frase…</SelectItem>
              </SelectContent>
            </Select>
            {draftPlaceSelection === DELIVERY_PLACE_MANUAL ? <div className="space-y-2">
              <Textarea aria-label="Indirizzo o frase libera" rows={2} maxLength={300} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value, addressId: null })} placeholder="Es. Passo io a prenderle, oppure scrivi un altro indirizzo" />
              <div className="flex items-start gap-2">
                <Checkbox id="save-delivery-place" checked={draft.savePlace} onCheckedChange={(checked) => setDraft({ ...draft, savePlace: checked === true })} />
                <Label htmlFor="save-delivery-place" className="text-xs font-normal leading-5">Salva per i prossimi ordini</Label>
              </div>
              {draft.savePlace ? <p className="text-xs text-muted-foreground">Il testo sarà riutilizzabile quando salvi o invii questo ordine.</p> : null}
            </div> : null}
            {savedPlaces.isError ? <p className="text-xs text-destructive">Le frasi salvate non sono disponibili; puoi comunque scrivere un testo per questo ordine.</p> : null}
          </div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button><Button disabled={draftPlaceSelection === DELIVERY_PLACE_MANUAL && draft.savePlace && !normalizeDeliveryPlace(draft.address)} onClick={() => { if (editing) setOverrides((current) => ({ ...current, [editing]: { ...draft, address: normalizeDeliveryPlace(draft.address), from: halfHourTime(draft.from), to: halfHourTime(draft.to) } })); setEditing(null); }}>Usa questi dati</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    {(() => {
      const group = fixing ? groupById(fixing.supplierId) : undefined;
      const lines = group ? coverageLines(group) : [];
      return <Dialog open={fixing !== null} onOpenChange={(next) => { if (!next) setFixing(null); }}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-4" /> Da sistemare prima dell'invio</DialogTitle><DialogDescription>{group?.name ?? ""}: sistema il punto qui sotto, poi riprova l'invio.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {lines.map((line) => <div key={line.assignment_id} className="rounded-md border border-accent/60 bg-accent/20 p-3 text-sm">
              <p className="font-semibold">{line.name}</p>
              <p className="text-xs text-muted-foreground">Ordini {qty(Number(line.quantity))} {line.unit_code ?? ""}, ma non c'è una conversione fissa con l'U.M. di magazzino. Conferma che vuoi proprio questa quantità.</p>
              <Button size="sm" className="mt-2" disabled={coveragePending !== null} onClick={() => void confirmCoverage(line.assignment_id)}>{coveragePending === line.assignment_id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confermo la quantità</Button>
            </div>)}
            {fixing?.message && !lines.length ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{fixing.message}</p> : null}
            {!lines.length && !fixing?.message ? <p className="text-sm text-muted-foreground">Tutto sistemato: puoi inviare.</p> : null}
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setFixing(null)}>Chiudi</Button>{group && !lines.length ? <Button onClick={() => { setFixing(null); void sendOne(group); }}><Send className="size-4" /> Riprova invio</Button> : null}</DialogFooter>
        </DialogContent>
      </Dialog>;
    })()}

    {sharing ? <OrderShareDialog orderId={sharing.orderId} mode={sharing.mode} onClose={() => setSharing(null)} onConfirmed={async (closed) => { const sentGroup = groups.find((group) => group.order?.id === sharing.orderId); await refresh(); if (sentGroup) collapse(sentGroup.supplierId); finishIfClosed(closed); }} /> : null}
    {sharingB2b ? <B2bOrderShareDialog orderId={sharingB2b.orderId} number={sharingB2b.number} supplier={sharingB2b.supplier} onClose={() => setSharingB2b(null)} /> : null}
  </>;
}
