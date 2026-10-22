import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, FileText, Info, Loader2, Lock, MapPin, Send, ShoppingBag, Truck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useRef, useState } from "react";
import { initialGenerationStep } from "./shopping-list-ready-state";
import { toast } from "sonner";

import { SendOrderDialog, type SendChannel } from "@/components/purchase/send-order-dialog";
import { OrderLineEdit } from "@/components/shopping/order-line-edit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { draftCloseAction, draftStateFromSaved, isDraftDirty, type DraftEditState } from "@/lib/draft-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { qty } from "@/lib/inventory";
import { addDays, localToday, useDeliveryPreferences, type CompanyAddressOption } from "@/lib/delivery-preferences";
import { deliveryDefaults } from "@/lib/order-delivery-defaults";
import {
  changeDraftSupplier,
  confirmAssignmentCoverage,
  generateSupplierOrder,
  getGenerationPreview,
  manageListExclusion,
  updateDraftOrder,
  type GenerationLine,
  type GenerationPreview,
} from "@/lib/order-generation.functions";
import { managePurchaseOrder } from "@/lib/purchase.functions";
import { generateDirectPurchaseDraft, updateDirectPurchaseDraft } from "@/lib/direct-purchase.functions";
import { afterCreateAction, replaceOutcome, summarize, type GenerationOutcome } from "@/components/shopping/generation-results";
import { GenerationSummary, ShareOrderDialog } from "@/components/shopping/generation-summary";
import { DirectPurchaseDraftDialog, STATUS_LABEL } from "@/components/purchase/direct-purchase-draft-dialog";
import { assignShoppingListSupplier, setShoppingListItemQuantityLock } from "@/lib/shopping-list.functions";
import { autoAssignItem } from "@/lib/shopping-auto-assign";
import { readCardBundle } from "@/lib/shopping-card-reads";
import { supplierUnitProposal, unitsSoldText, type ProposalLink } from "@/lib/supplier-unit-proposal";
import { issueReason, type RowFacts } from "@/lib/supplier-selection";
import { MISSING_SELLING_PRICE, priceLabel } from "@/lib/purchase";

/** addressId: id indirizzo aziendale scelto; null = «Altro indirizzo…»; undefined = collegamento non toccato. */
type Delivery = { date: string; from: string; to: string; address: string; notes: string; addressId?: string | null };
const OTHER_ADDRESS = "__altro__";
type SupplierDraft = { selected: boolean; delivery: Delivery; lines: Record<string, { included: boolean; quantity: string }> };


function linePrice(line: { unit_cost: number | null; price_unit_code: string | null; is_b2b: boolean }) {
  if (line.unit_cost === null || line.unit_cost === undefined) return line.is_b2b ? MISSING_SELLING_PRICE : "Prezzo non indicato";
  return priceLabel(line.unit_cost, line.price_unit_code);
}

function toDeliveryPayload(d: Delivery) {
  return {
    date: d.date || null,
    time_from: d.from || null,
    time_to: d.to || null,
    address_text: d.address.trim() || null,
    notes: d.notes.trim() || null,
    ...(d.addressId !== undefined ? { address_id: d.addressId } : {}),
  };
}

function DeliveryFields({
  value,
  onChange,
  disabled,
  addresses,
}: {
  value: Delivery;
  onChange: (d: Delivery) => void;
  disabled?: boolean;
  addresses: CompanyAddressOption[];
}) {
  const known = value.addressId ? addresses.find((a) => a.id === value.addressId) : undefined;
  const selected = known ? known.id : OTHER_ADDRESS;
  return (
    // Compatto: data e «dalle» sulla stessa riga, luogo dietro un'icona, note su una riga. «Alle» resta invariato.
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Input type="date" aria-label="Data" className="h-8 min-w-0 flex-1 px-2 text-xs" value={value.date} disabled={disabled} onChange={(e) => onChange({ ...value, date: e.target.value })} />
        <span className="shrink-0 text-xs text-muted-foreground">dalle</span>
        <Input type="time" aria-label="Dalle" className="h-8 w-24 shrink-0 px-2 text-xs" value={value.from} disabled={disabled} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={disabled} aria-label="Luogo di consegna" title={known?.text || value.address || "Luogo"}>
              <MapPin className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2 p-2">
            <p className="text-xs font-medium">Luogo di consegna</p>
            <p className="text-xs text-muted-foreground">{known?.text || value.address || "Nessun indirizzo"}</p>
            <Select
              value={selected}
              disabled={Boolean(disabled)}
              onValueChange={(v) => {
                if (v === OTHER_ADDRESS) onChange({ ...value, addressId: null, address: known ? "" : value.address });
                else onChange({ ...value, addressId: v, address: addresses.find((a) => a.id === v)?.text ?? "" });
              }}
            >
              <SelectTrigger aria-label="Luogo" className="h-8 w-full min-w-0 text-xs [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {addresses.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.text || "Indirizzo senza descrizione"}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_ADDRESS}>Altro indirizzo…</SelectItem>
              </SelectContent>
            </Select>
            {selected === OTHER_ADDRESS ? (
              <Input
                aria-label="Altro indirizzo"
                placeholder="Scrivi l'indirizzo"
                className="h-8 text-xs"
                value={value.address}
                disabled={disabled}
                maxLength={300}
                onChange={(e) => onChange({ ...value, addressId: null, address: e.target.value })}
              />
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
      <Textarea rows={1} aria-label="Note per il fornitore" placeholder="Note per il fornitore" className="min-h-8 py-1.5 text-xs" value={value.notes} disabled={disabled} maxLength={1000} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
    </div>
  );
}

/**
 * «Genera ordini»: card per fornitore (tutte selezionate), acquisti diretti separati, bozze recuperabili.
 * Residui, prezzi, idempotenza e chiusura della Lista sono decisi dal database. Lo stato della finestra
 * resta in memoria finché la Lista è aperta: chiudere la finestra non perde le modifiche non salvate.
 */
export function GenerateOrdersDialog({
  companyId,
  listId,
  open,
  mode,
  onOpenChange,
  onGoToItem,
  onListClosed,
  onCompleteQuantities,
}: {
  companyId: string;
  listId: string;
  open: boolean;
  mode: "genera" | "bozze";
  onOpenChange: (open: boolean) => void;
  onGoToItem: (itemId: string) => void;
  onListClosed: () => void;
  onCompleteQuantities: () => void;
}) {
  const queryClient = useQueryClient();
  const readPreview = useServerFn(getGenerationPreview);
  const runGenerate = useServerFn(generateSupplierOrder);
  const runUpdate = useServerFn(updateDraftOrder);
  const runExclusion = useServerFn(manageListExclusion);
  const runDirectDraft = useServerFn(generateDirectPurchaseDraft);
  const runCoverage = useServerFn(confirmAssignmentCoverage);

  const preview = useQuery({
    queryKey: ["generation-preview", listId],
    enabled: open,
    queryFn: () => readPreview({ data: { listId } }),
  });

  // Fatti delle righe della Lista (solo prodotti presenti nella Lista: «Da valutare» non c'entra).
  const facts = useQuery({
    queryKey: ["generation-facts", listId],
    enabled: open,
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("shopping_list_items")
        .select("id, product_id, decided_quantity, quantity_locked_at, excluded_at, unit_code, decided_unit_code")
        .eq("list_id", listId);
      if (error) throw new Error(error.message);
      const productIds = [...new Set((items ?? []).map((i) => i.product_id as string))];
      const { data: links, error: linkError } = productIds.length
        ? await supabase.from("product_supplier_links").select("product_id").in("product_id", productIds).eq("is_active", true)
        : { data: [], error: null };
      if (linkError) throw new Error(linkError.message);
      // U.M. di acquisto incompatibile col fornitore già identificato: stessa regola della card, sola lettura.
      const unitIssues = new Map<string, string>();
      const { data: deselected } = await supabase.from("shopping_list_item_suppliers")
        .select("item_id, product_supplier_link_id, deselected_at").in("item_id", (items ?? []).map((i) => i.id as string));
      await Promise.all((items ?? []).filter((i) => i.decided_quantity !== null && !i.excluded_at).map(async (i) => {
        const bundle = await readCardBundle(`${companyId}:${i.id}`);
        if (!bundle) return;
        const over = (bundle.overview as { link_id: string; supplier_name: string | null; is_preferred: boolean | null; is_active: boolean | null }[]).filter((o) => o.is_active);
        const active = new Set(over.map((o) => o.link_id));
        const mine = (deselected ?? []).filter((d) => d.item_id === i.id);
        const p = supplierUnitProposal({
          links: (bundle.supplier_units as ProposalLink[]).filter((l) => active.has(l.link_id)),
          preferredLinkIds: new Set(over.filter((o) => o.is_preferred).map((o) => o.link_id)),
          deselectedLinkIds: mine.filter((d) => d.deselected_at).map((d) => d.product_supplier_link_id as string),
          assignedLinkIds: mine.filter((d) => !d.deselected_at).map((d) => d.product_supplier_link_id as string),
          currentCode: (i.decided_unit_code as string | null) ?? (i.unit_code as string | null) ?? "",
          productUnitCode: (i.unit_code as string | null) ?? "",
        });
        if (p && !p.compatible) unitIssues.set(i.id as string, `U.M. di acquisto da correggere — ${unitsSoldText(over.find((o) => o.link_id === p.linkId)?.supplier_name ?? "Il fornitore", p.units)}.`);
      }));
      const count = new Map<string, number>();
      for (const l of links ?? []) count.set(l.product_id as string, (count.get(l.product_id as string) ?? 0) + 1);
      return (items ?? []).map((i) => ({
        id: i.id as string,
        quantity: i.decided_quantity === null ? null : Number(i.decided_quantity),
        locked: Boolean(i.quantity_locked_at),
        excluded: Boolean(i.excluded_at),
        links: count.get(i.product_id as string) ?? 0,
        unitIssue: unitIssues.get(i.id as string) ?? null,
        unitCode: ((i.decided_unit_code as string | null) ?? (i.unit_code as string | null) ?? "").trim(),
      }));
    },
  });
  const factsById = new Map((facts.data ?? []).map((f) => [f.id, f]));
  const reasonFor = (i: { item_id: string; status: string }) => {
    const f = factsById.get(i.item_id);
    if (f?.unitIssue && i.status === "da_assegnare" && f.locked) return f.unitIssue;
    const row: RowFacts = {
      quantity: f?.quantity ?? null,
      locked: f?.locked ?? false,
      status: i.status as RowFacts["status"],
      linkedSuppliers: f?.links ?? 0,
      quotes: i.status === "da_assegnare" ? 0 : 1,
    };
    return issueReason(row);
  };
  const unconfirmed = (facts.data ?? []).filter((f) => !f.excluded && !f.locked && (f.quantity ?? 0) > 0);

  // «Conferma tutte e assegna i fornitori»: stesse regole del «Conferma» della card, riga per riga
  // (una riga che fallisce non ferma le altre; ogni scrittura è atomica nel database). Mai ordini, mai diretti completati.
  const runLock = useServerFn(setShoppingListItemQuantityLock);
  const runAssignAuto = useServerFn(assignShoppingListSupplier);
  const [bulkReport, setBulkReport] = useState<null | { confirmed: number; assigned: string[]; toChoose: string[]; skipped: string[] }>(null);
  const bulk = useMutation({
    mutationFn: async () => {
      const report = { confirmed: 0, assigned: [] as string[], toChoose: [] as string[], skipped: [] as string[] };
      const names = new Map((preview.data?.issues ?? []).map((i) => [i.item_id, `${i.code ? `${i.code} · ` : ""}${i.name}`]));
      for (const f of unconfirmed) {
        const name = names.get(f.id) ?? "Prodotto";
        try {
          await runLock({ data: { itemId: f.id, locked: true } });
          report.confirmed += 1;
        } catch (e) {
          report.skipped.push(`${name}: ${(e as Error).message}`);
          continue;
        }
        const res = await autoAssignItem(runAssignAuto, companyId, f.id, { updateExisting: false });
        if (res.kind === "assegnato") report.assigned.push(`${name} → ${res.supplierName}`);
        else if (res.kind === "da_scegliere") report.toChoose.push(`${name} (${res.reason})`);
        else if (res.kind === "senza_fornitore") report.toChoose.push(`${name} (senza fornitore)`);
        else if (res.kind === "saltato" || res.kind === "verifica") report.skipped.push(`${name}: ${res.reason}`);
      }
      return report;
    },
    onSuccess: async (report) => {
      setBulkReport(report);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["generation-facts", listId] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-locks"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-list-assignments"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [step, setStep] = useState<"avviso" | "fornitori">(initialGenerationStep(mode));
  const [drafts, setDrafts] = useState<Record<string, SupplierDraft>>({});
  const [rebuild, setRebuild] = useState(0);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  // Una chiave per fornitore finché la generazione non riesce: ripetere il clic restituisce lo stesso ordine.
  const keys = useRef<Record<string, string>>({});

  useEffect(() => {
    if (open) setStep(initialGenerationStep(mode));
  }, [open, mode]);

  const prefs = useDeliveryPreferences(open ? companyId : null);
  const supplierIds = (preview.data?.suppliers ?? []).map((s) => s.supplier_record_id).sort();
  // Ultimo ordine non annullato per fornitore: lettura già consentita (stessa tabella usata dalle bozze).
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
      for (const o of data ?? []) {
        if (!o.supplier_record_id || map[o.supplier_record_id]) continue;
        map[o.supplier_record_id] = { from: o.delivery_time_from, to: o.delivery_time_to, address: o.delivery_address_text, addressId: o.destination_address_id };
      }
      return map;
    },
  });
  const prefsReady = !prefs.isLoading;
  const lastReady = supplierIds.length === 0 || lastOrders.isFetched;

  // Inizializza le card nuove senza toccare quelle già modificate.
  useEffect(() => {
    const data = preview.data;
    if (!data || !prefsReady || !lastReady) return;
    const p = prefs.data;
    const today = localToday(p?.timezone ?? "Europe/Rome");
    const company = p
      ? {
          date: p.day === "domani" ? addDays(today, 1) : today,
          from: p.timeFrom,
          to: p.timeTo,
          addressId: p.addressId,
        }
      : null;
    const addresses = p?.addresses ?? [];
    // Indirizzo principale di consegna: primo indirizzo attivo con tipologia «consegna».
    const mainDelivery = addresses.find((a) => a.functions.includes("consegna"))?.id ?? null;
    // Data dell'acquisto diretto: stessa regola dei fornitori (preferenze aziendali), senza toccare modifiche manuali.
    setDirectHeader((prev) => (prev.date ? prev : { ...prev, date: company?.date ?? today }));
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of data.suppliers) {
        const old = next[s.supplier_record_id];
        const lines: SupplierDraft["lines"] = {};
        for (const l of s.lines) lines[l.assignment_id] = old?.lines[l.assignment_id] ?? { included: true, quantity: String(l.quantity) };
        next[s.supplier_record_id] = {
          selected: old?.selected ?? true,
          delivery: old?.delivery ?? {
            ...deliveryDefaults({
              today,
              list: { date: data.delivery.date, from: data.delivery.time_from, to: data.delivery.time_to, address: data.delivery.address_text, addressId: data.delivery.address_id },
              lastOrder: lastOrders.data?.[s.supplier_record_id] ?? null,
              company,
              addresses,
              mainDeliveryAddressId: mainDelivery,
            }),
            notes: "",
          },
          lines,
        };
      }
      return next;
    });
  }, [preview.data, prefsReady, lastReady, prefs.data, lastOrders.data, rebuild]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["generation-preview", listId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-cycle"] }),
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] }),
    ]);

  const afterClose = (closed: boolean | undefined) => {
    if (closed) {
      toast.success("Lista completata e chiusa");
      onOpenChange(false);
      onListClosed();
    }
  };

  const runOrder = useServerFn(managePurchaseOrder);
  // Esiti dell'ultima generazione: restano visibili finché la finestra è aperta.
  const [outcomes, setOutcomes] = useState<GenerationOutcome[]>([]);
  const [shareTarget, setShareTarget] = useState<Extract<GenerationOutcome, { kind: "da_condividere" }> | null>(null);
  const [shareLinks, setShareLinks] = useState<Record<string, { url: string; expiresAt: string }>>({});
  useEffect(() => {
    if (!open) setOutcomes([]);
  }, [open]);

  const listClosedNow = async () => {
    const { data } = await supabase.from("shopping_lists").select("status").eq("id", listId).single();
    return data?.status === "chiusa";
  };

  const generate = useMutation({
    mutationFn: async () => {
      const data = preview.data as GenerationPreview;
      const out: GenerationOutcome[] = [];
      for (const s of data.suppliers) {
        const d = drafts[s.supplier_record_id];
        if (!d?.selected) continue;
        const chosen = s.lines.filter((l) => d.lines[l.assignment_id]?.included);
        if (!chosen.length) continue;
        const key = (keys.current[s.supplier_record_id] ??= crypto.randomUUID());
        let created: { order_id: string; number: string | null } | null = null;
        try {
          const res = await runGenerate({
            data: {
              listId,
              supplierRecordId: s.supplier_record_id,
              generationKey: key,
              delivery: toDeliveryPayload(d.delivery),
              assignmentIds: chosen.map((l) => l.assignment_id),
            },
          });
          // Quantità ridotte prima della generazione: applicate sulla bozza appena creata.
          const reduced = chosen.filter((l) => {
            const q = Number(d.lines[l.assignment_id]?.quantity.replace(",", "."));
            return Number.isFinite(q) && q > 0 && q < l.quantity;
          });
          // «Altro indirizzo…»: la creazione ripiega sull'indirizzo della Lista; il collegamento si svuota subito dopo.
          if (!res.already_exists && d.delivery.addressId === null && data.delivery.address_id) {
            await runUpdate({ data: { orderId: res.order_id, lines: [], delivery: toDeliveryPayload(d.delivery) } });
          }
          if (reduced.length && !res.already_exists) {
            const { data: rows } = await supabase
              .from("purchase_order_items")
              .select("id, source_assignment_id")
              .eq("order_id", res.order_id);
            const lines = reduced
              .map((l) => ({
                line_id: rows?.find((r) => r.source_assignment_id === l.assignment_id)?.id ?? "",
                purchase_quantity: Number((d.lines[l.assignment_id]?.quantity ?? "").replace(",", ".")),
              }))
              .filter((l) => l.line_id);
            if (lines.length) await runUpdate({ data: { orderId: res.order_id, lines, delivery: null } });
          }
          delete keys.current[s.supplier_record_id];
          created = { order_id: res.order_id, number: res.number };
        } catch (error) {
          out.push({ kind: "errore_generazione", name: s.name, message: (error as Error).message });
          continue;
        }
        // Ordine creato: B2B parte subito; un errore d'invio lascia la bozza da riprovare senza rigenerarla.
        if (afterCreateAction(s.is_b2b) === "invia_piattaforma") {
          try {
            await runOrder({ data: { orderId: created.order_id, action: "send", destinationLocationId: null, notes: null, sendChannel: null } });
            out.push({ kind: "inviato", name: s.name, orderId: created.order_id, number: created.number });
          } catch (error) {
            out.push({ kind: "errore_invio", name: s.name, orderId: created.order_id, number: created.number, isB2b: true, message: (error as Error).message });
          }
        } else {
          out.push({ kind: "da_condividere", name: s.name, orderId: created.order_id, number: created.number });
        }
      }
      // Acquisto diretto: stessa spunta degli altri fornitori, un solo pulsante per tutti. Nessun invio.
      if (directSelected && directChecked.length) {
        try {
          const key = (directKey.current ??= crypto.randomUUID());
          const res = await runDirectDraft({ data: { listId, generationKey: key, itemIds: directChecked.map((x) => x.item_id) } });
          // Intestazione (chi acquista, data, luogo) solo sulla bozza appena creata: mai sovrascrivere modifiche manuali.
          if (!res.already_exists && (directHeader.buyer.trim() || directHeader.date || directHeader.where.trim())) {
            await runUpdateDirect({
              data: {
                id: res.id,
                header: {
                  buyer_label: directHeader.buyer.trim() || null,
                  purchase_date: directHeader.date || null,
                  purchased_where: directHeader.where.trim() || null,
                  total_paid: null,
                  notes: null,
                },
                lines: [],
              },
            });
          }
          directKey.current = null;
          await queryClient.invalidateQueries({ queryKey: ["direct-purchases-list", listId] });
          out.push({ kind: "acquisto_diretto", name: "Acquisto diretto", id: res.id, number: res.number });
        } catch (error) {
          out.push({ kind: "errore_generazione", name: "Acquisto diretto", message: (error as Error).message });
        }
      }
      return { out, closed: out.some((o) => o.kind === "inviato") ? await listClosedNow() : false };
    },
    onSuccess: async ({ out, closed }) => {
      setDrafts({});
      setOutcomes(out);
      await refresh();
      // Ricostruisce sempre le card dai dati attuali, anche se identici a prima (es. tentativo fallito).
      setRebuild((n) => n + 1);
      const sum = summarize(out);
      if (sum.errori) toast.error(`${sum.errori} ${sum.errori === 1 ? "operazione non riuscita" : "operazioni non riuscite"}: vedi il riepilogo`);
      else toast.success("Ordini generati");
      if (closed) toast.success("Lista completata e chiusa");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Invio di un ordine già creato (riprova B2B o conferma della condivisione non B2B): mai una nuova generazione.
  const sendOne = useMutation({
    mutationFn: async (p: { orderId: string; channel: SendChannel | null }) => {
      await runOrder({ data: { orderId: p.orderId, action: "send", destinationLocationId: null, notes: null, sendChannel: p.channel } });
      return { ...p, closed: await listClosedNow() };
    },
    onSuccess: async ({ orderId, closed }) => {
      setOutcomes((list) => {
        const cur = list.find((o) => "orderId" in o && o.orderId === orderId);
        return cur && "orderId" in cur ? replaceOutcome(list, orderId, { kind: "inviato", name: cur.name, orderId, number: cur.number }) : list;
      });
      setShareTarget(null);
      await refresh();
      toast.success("Ordine inviato");
      if (closed) toast.success("Lista completata e chiusa");
    },
    onError: (error: Error, p) => {
      setOutcomes((list) => {
        const cur = list.find((o) => "orderId" in o && o.orderId === p.orderId);
        if (!cur || !("orderId" in cur) || p.channel) return list;
        return replaceOutcome(list, p.orderId, { kind: "errore_invio", name: cur.name, orderId: p.orderId, number: cur.number, isB2b: true, message: error.message });
      });
      toast.error(error.message);
    },
  });

  const exclusion = useMutation({
    mutationFn: (p: { itemId: string; action: "exclude" | "restore" }) =>
      runExclusion({ data: { listId, itemIds: [p.itemId], action: p.action, reason: p.action === "exclude" ? "Procedi comunque" : null } }),
    onSuccess: async (res, variables) => {
      await refresh();
      afterClose(res.list_closed);
      if (variables.action === "restore" && !res.list_closed) {
        onOpenChange(false);
        onGoToItem(variables.itemId);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Acquisti diretti (documenti AD) della Lista: lettura con RLS dell'azienda.
  const directDocs = useQuery({
    queryKey: ["direct-purchases-list", listId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_purchases")
        .select("id, number, status, created_at, direct_purchase_items(source_item_id, active_source_item_id)")
        .eq("shopping_list_id", listId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [openDirectDoc, setOpenDirectDoc] = useState<string | null>(null);
  const [directSel, setDirectSel] = useState<Record<string, boolean>>({});
  // La sezione Acquisti diretti si comporta come un fornitore: spunta in testa, chi acquista, data e luogo.
  const [directSelected, setDirectSelected] = useState(true);
  const [directHeader, setDirectHeader] = useState({ buyer: "", date: "", where: "" });
  const runUpdateDirect = useServerFn(updateDirectPurchaseDraft);
  // Una chiave finché la creazione non riesce: ripetere il clic restituisce la stessa bozza.
  const directKey = useRef<string | null>(null);

  // Quote dirette ancora da mettere in bozza (non gestite e non già in una bozza AD aperta).
  const liveDirectDoc = (itemId: string) =>
    directDocs.data?.find((d) => d.status === "bozza" && d.direct_purchase_items.some((i) => i.active_source_item_id === itemId));
  const directToDraft = (preview.data?.direct ?? []).filter((x) => !x.done && !liveDirectDoc(x.item_id));
  const directChecked = directToDraft.filter((x) => directSel[x.item_id] !== false);

  // Conferma o annullamento (persistente, tracciato nel DB; revocabile finché la quota non è in un ordine).
  const coverage = useMutation({
    mutationFn: (p: { assignmentId: string; confirm: boolean }) => runCoverage({ data: p }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const data = preview.data;

  // Ogni apertura rilegge i dati attuali della Lista (niente quantità vecchie).
  useEffect(() => {
    if (!open) return;
    void preview.refetch();
    void facts.refetch();
    void directDocs.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Eccedenza per prodotto: solo se tutte le quote (fornitori + diretto) sono nella stessa U.M.
  // della quantità da acquistare; altrimenti nessun avviso (nessuna conversione inventata).
  const excessByItem = (() => {
    const map = new Map<string, { amount: number; unit: string }>();
    if (!data) return map;
    const norm = (u: string | null | undefined) => (u ?? "").trim().toLowerCase();
    const quotas = new Map<string, { q: number; u: string | null; cov: boolean }[]>();
    const push = (id: string, v: { q: number; u: string | null; cov: boolean }) => quotas.set(id, [...(quotas.get(id) ?? []), v]);
    for (const s of data.suppliers) for (const l of s.lines) push(l.item_id, { q: Number(l.saved_quantity ?? l.quantity), u: l.unit_code, cov: l.needs_coverage });
    for (const x of data.direct) push(x.item_id, { q: Number(x.quantity), u: x.unit_code, cov: false });
    for (const [id, list] of quotas) {
      const f = factsById.get(id);
      if (!f || f.quantity === null || !f.unitCode) continue;
      if (list.some((x) => x.cov || norm(x.u) !== norm(f.unitCode))) continue;
      const over = list.reduce((a, x) => a + x.q, 0) - f.quantity;
      if (over > 1e-9) map.set(id, { amount: Math.round(over * 1000) / 1000, unit: f.unitCode });
    }
    return map;
  })();
  const excessBadge = (itemId: string) => {
    const e = excessByItem.get(itemId);
    return e ? <p className="text-xs font-medium text-destructive">+{qty(e.amount)} {e.unit} in eccesso</p> : null;
  };
  const selectedCount = data
    ? data.suppliers.filter((s) => drafts[s.supplier_record_id]?.selected && s.lines.some((l) => drafts[s.supplier_record_id]?.lines[l.assignment_id]?.included)).length +
      (directSelected && directChecked.length ? 1 : 0)
    : 0;
  const blockedByCoverage = data
    ? data.suppliers.some(
        (s) => drafts[s.supplier_record_id]?.selected && s.lines.some((l) => l.needs_coverage && drafts[s.supplier_record_id]?.lines[l.assignment_id]?.included),
      )
    : false;

  const setDraft = (id: string, patch: (d: SupplierDraft) => SupplierDraft) =>
    setDrafts((prev) => (prev[id] ? { ...prev, [id]: patch(prev[id]) } : prev));

  return (
    <>
      <Dialog open={open && !editingOrder} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl overflow-x-hidden overflow-y-auto p-4 sm:p-6 max-md:max-h-[calc(100dvh-2rem)] max-md:min-w-0 max-md:grid-cols-[minmax(0,1fr)]">
          <DialogHeader className="max-md:min-w-0 max-md:pr-6">
            <DialogTitle className="flex items-center justify-center gap-1.5 sm:justify-start max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:text-left max-md:text-base max-md:leading-snug">
              <span className="min-w-0">{step === "avviso" ? "Prima di generare gli ordini" : "Genera ordini per fornitore"}</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Come funziona"><Info className="size-4" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-xs font-normal">
                  <div className="space-y-0.5">
                    <p className="font-semibold">Fornitori — ordini ORD</p>
                    <p className="text-muted-foreground">Una card per ogni fornitore con le righe confermate: togli le righe che non vuoi o riduci le quantità, poi premi Genera. Il luogo e l'orario di consegna si impostano su ogni card.</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold">Invio</p>
                    <p className="text-muted-foreground">Gli ordini B2B partono subito tramite la piattaforma; gli altri si condividono e risultano inviati solo quando lo confermi.</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold">Acquisto diretto — AD</p>
                    <p className="text-muted-foreground">Non è un ordine al fornitore: crea solo una bozza da completare in Acquisti, senza invio. «Chi acquista», data e luogo valgono per la bozza dell'acquisto diretto; per gli ordini ai fornitori usa l'icona del luogo sulla card.</p>
                  </div>
                  <p className="text-muted-foreground">La Lista si chiude da sola quando tutto è stato gestito.</p>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Gli ordini B2B partono subito tramite la piattaforma; gli altri si condividono e risultano inviati solo quando lo confermi. La Lista si chiude da sola quando tutto è stato gestito.
            </DialogDescription>
          </DialogHeader>

          {preview.isLoading || !data ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Caricamento…</p>
          ) : step === "avviso" && data.issues.length ? (
            <div className="space-y-3 max-md:min-w-0">
              {unconfirmed.length ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
                  <p className="font-medium">
                    {unconfirmed.length} {unconfirmed.length === 1 ? "quantità inserita ma non confermata" : "quantità inserite ma non confermate"}
                  </p>
                  <Button size="sm" disabled={bulk.isPending} onClick={() => bulk.mutate()}>
                    {bulk.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Conferma tutte e assegna i fornitori
                  </Button>
                </div>
              ) : null}
              {bulkReport ? (
                <div className="space-y-1 rounded-md border border-border p-3 text-xs">
                  <p className="font-semibold">
                    {bulkReport.confirmed} confermate · {bulkReport.assigned.length} assegnate in automatico · {bulkReport.toChoose.length} con fornitore da scegliere · {bulkReport.skipped.length} saltate
                  </p>
                  {bulkReport.toChoose.length ? <p className="text-muted-foreground">Fornitore da scegliere: {bulkReport.toChoose.join("; ")}</p> : null}
                  {bulkReport.skipped.length ? <p className="text-destructive">Saltate: {bulkReport.skipped.join("; ")}</p> : null}
                </div>
              ) : null}
              <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0"><span className="md:hidden">Sistema il prodotto indicato oppure continua con quelli pronti. Gli altri restano nella Lista.</span><span className="hidden md:inline">Alcuni prodotti hanno quantità da sistemare. Puoi sistemarle ora oppure procedere con i prodotti pronti: quelli da sistemare restano nella Lista.</span></p>
              </div>
              <TooltipProvider delayDuration={150}>
                <ul className="space-y-1 text-sm">
                  {data.issues.map((i) => (
                    <li key={i.item_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border border-border px-2 py-1 md:flex md:justify-between">
                      <span className="min-w-0 break-words md:truncate">{i.code ? `${i.code} · ` : ""}{i.name} <span className="block text-muted-foreground md:inline"><span className="hidden md:inline">— </span>{reasonFor(i)}</span></span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Sistema ${i.name}`} onClick={() => { onOpenChange(false); onGoToItem(i.item_id); }}><Lock className="size-4" /></Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Sistema questo prodotto</TooltipContent>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </TooltipProvider>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={onCompleteQuantities}>Sistema tutte le quantità mancanti</Button>
                <Button className="max-md:h-auto max-md:min-h-9 max-md:whitespace-normal max-md:py-2" onClick={() => setStep("fornitori")}><span className="md:hidden">Continua con i prodotti pronti</span><span className="hidden md:inline">Procedi comunque</span></Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {data.drafts.length ? (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" /> Bozze da inviare ({data.drafts.length})</h3>
                  {data.drafts.map((d) => (
                    <div key={d.order_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{d.supplier_name ?? "Fornitore"}</span>{" "}
                        <span className="text-muted-foreground">· {d.number} · {d.lines} {d.lines === 1 ? "riga" : "righe"}</span>
                        {d.is_b2b ? <Badge variant="secondary" className="ml-2">B2B</Badge> : null}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setEditingOrder(d.order_id)}>Apri bozza</Button>
                    </div>
                  ))}
                </section>
              ) : mode === "bozze" ? <p className="text-sm text-muted-foreground">Nessuna bozza da inviare.</p> : null}

              {data.suppliers.length ? (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4" /> Da ordinare</h3>
                  {data.suppliers.map((s) => {
                    const d = drafts[s.supplier_record_id];
                    if (!d) return null;
                    return (
                      <div key={s.supplier_record_id} className="rounded-md border border-border p-2">
                        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                          <Checkbox checked={d.selected} onCheckedChange={(v) => setDraft(s.supplier_record_id, (x) => ({ ...x, selected: v === true }))} />
                          {s.name}
                          {s.is_b2b ? <Badge variant="secondary">B2B</Badge> : null}
                          <span className="font-normal text-muted-foreground">· {s.lines.length} {s.lines.length === 1 ? "prodotto" : "prodotti"}</span>
                        </label>
                        <div className="mt-1.5">
                          <DeliveryFields addresses={prefs.data?.addresses ?? []} value={d.delivery} disabled={!d.selected} onChange={(delivery) => setDraft(s.supplier_record_id, (x) => ({ ...x, delivery }))} />
                        </div>
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button size="sm" variant="ghost" className="mt-1 h-7 px-1 text-xs"><ChevronDown className="size-4" /> Prodotti ({s.lines.length})</Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="max-h-[50vh] space-y-1 overflow-y-auto">
                            {s.lines.map((l: GenerationLine) => {
                              const ln = d.lines[l.assignment_id];
                              return (
                                <div key={l.assignment_id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 border-b border-border/60 py-1 text-xs last:border-b-0">
                                  <Checkbox
                                    checked={ln?.included ?? false}
                                    disabled={!d.selected}
                                    onCheckedChange={(v) => setDraft(s.supplier_record_id, (x) => ({ ...x, lines: { ...x.lines, [l.assignment_id]: { quantity: x.lines[l.assignment_id]?.quantity ?? "", included: v === true } } }))}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium" title={`${l.code ? `${l.code} · ` : ""}${l.name}`}>{l.name}</p>
                                    <p className="hidden text-xs text-muted-foreground">Assegnati: {qty(Number(l.saved_quantity ?? l.quantity))} {l.unit_code ?? ""}{linePrice(l) ? ` · ${linePrice(l)}` : ""}{l.notes ? ` · ${l.notes}` : ""}</p>
                                    {excessBadge(l.item_id)}
                                    {l.needs_coverage ? (
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                        <span>Da confermare — manca la conversione U.M.: conferma che vuoi acquistare {qty(l.quantity)} {l.unit_code ?? ""}.</span>
                                        <Button size="sm" variant="outline" disabled={coverage.isPending} onClick={() => coverage.mutate({ assignmentId: l.assignment_id, confirm: true })}>Confermo la quantità</Button>
                                      </div>
                                    ) : l.coverage_confirmed ? (
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                        <span>Quantità confermata: {qty(l.quantity)} {l.unit_code ?? ""}.</span>
                                        {!l.in_order ? (
                                          <Button size="sm" variant="ghost" disabled={coverage.isPending} onClick={() => coverage.mutate({ assignmentId: l.assignment_id, confirm: false })}>Annulla conferma</Button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      inputMode="decimal"
                                      aria-label={`Quantità ${l.name}`}
                                      className="h-7 w-14 px-1.5 text-right text-xs"
                                      value={ln?.quantity ?? ""}
                                      disabled={!d.selected || !ln?.included}
                                      onChange={(e) => setDraft(s.supplier_record_id, (x) => ({ ...x, lines: { ...x.lines, [l.assignment_id]: { included: x.lines[l.assignment_id]?.included ?? true, quantity: e.target.value } } }))}
                                    />
                                    <span className="w-7 truncate text-[11px] text-muted-foreground">{l.unit_code ?? ""}</span>
                                  </div>
                                  <OrderLineEdit
                                    companyId={companyId}
                                    line={l}
                                    splitAcrossSuppliers={data.suppliers.flatMap((x) => x.lines).filter((y) => y.item_id === l.item_id).length > 1}
                                    onGoToItem={() => { onOpenChange(false); onGoToItem(l.item_id); }}
                                    onSaved={async (q) => {
                                      setDraft(s.supplier_record_id, (x) => ({ ...x, lines: { ...x.lines, [l.assignment_id]: { included: x.lines[l.assignment_id]?.included ?? true, quantity: String(q) } } }));
                                      await Promise.all([
                                        refresh(),
                                        queryClient.invalidateQueries({ queryKey: ["generation-facts", listId] }),
                                        queryClient.invalidateQueries({ queryKey: ["shopping-list-assignments"] }),
                                        queryClient.invalidateQueries({ queryKey: ["shopping-extras-assignments"] }),
                                      ]);
                                    }}
                                  />
                                </div>
                              );
                            })}
                            <p className="text-xs text-muted-foreground">Puoi solo ridurre la quantità: il resto rimane da ordinare.</p>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="size-4" /> Acquisti diretti</h3>
                {!data.direct.length && !directDocs.data?.length ? (
                  <p className="text-sm text-muted-foreground">Nessun acquisto diretto in questa Lista: usa la spunta «Acquisto diretto (compro io)» sulla card del prodotto.</p>
                ) : null}
                {data.direct.length ? (
                  <div className="rounded-md border border-border p-3">
                    <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                      <Checkbox checked={directSelected} onCheckedChange={(v) => setDirectSelected(v === true)} />
                      Acquisto diretto
                      <span className="font-normal text-muted-foreground">· {data.direct.length} {data.direct.length === 1 ? "prodotto" : "prodotti"}</span>
                    </label>
                    <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="gd-buyer" className="text-xs">Chi acquista</Label>
                        <Input id="gd-buyer" className="h-8" value={directHeader.buyer} disabled={!directSelected} placeholder="Collaboratore o fornitore nuovo…" onChange={(e) => setDirectHeader((h) => ({ ...h, buyer: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gd-date" className="text-xs">Data</Label>
                        <Input id="gd-date" type="date" className="h-8" value={directHeader.date} disabled={!directSelected} onChange={(e) => setDirectHeader((h) => ({ ...h, date: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gd-where" className="text-xs">Luogo</Label>
                        <Input id="gd-where" className="h-8" value={directHeader.where} disabled={!directSelected} placeholder="Negozio, mercato…" onChange={(e) => setDirectHeader((h) => ({ ...h, where: e.target.value }))} />
                      </div>
                    </div>
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger asChild>
                        <Button size="sm" variant="ghost" className="mt-2 px-1"><ChevronDown className="size-4" /> Prodotti ({data.direct.length})</Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="max-h-[50vh] space-y-1 overflow-y-auto">
                        {data.direct.map((x) => {
                          const d = liveDirectDoc(x.item_id);
                          const selectable = !x.done && !d;
                          return (
                            <div key={x.item_id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded border border-border/60 p-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_8rem_auto]">
                              <Checkbox
                                className="mt-1"
                                checked={selectable ? directSel[x.item_id] !== false : x.done || !!d}
                                disabled={!selectable || !directSelected}
                                onCheckedChange={(v) => setDirectSel((s) => ({ ...s, [x.item_id]: v === true }))}
                              />
                              <div className="min-w-0">
                                <p className="break-words font-medium">{x.code ? `${x.code} · ` : ""}{x.name}</p>
                                <p className="text-xs text-muted-foreground">Quota diretta: {qty(x.quantity)} {x.unit_code ?? ""}</p>
                                {excessBadge(x.item_id)}
                              </div>
                              <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                                <Input inputMode="decimal" className="h-8 text-right" value={qty(x.quantity)} readOnly disabled />
                                <span className="w-10 text-xs text-muted-foreground">{x.unit_code ?? ""}</span>
                              </div>
                              <div className="col-span-2 flex items-center justify-end sm:col-span-1">
                                {x.done ? (
                                  <Badge variant="secondary">Confermato e gestito</Badge>
                                ) : d ? (
                                  <Button size="sm" variant="outline" onClick={() => setOpenDirectDoc(d.id)}>In bozza {d.number}</Button>
                                ) : (
                                  <Badge variant="outline">Da inserire in bozza</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : null}
                {directDocs.data?.length ? (
                  <div className="space-y-1 rounded-md border border-border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Documenti di questa Lista</div>
                    {directDocs.data.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          {d.number}
                          <Badge variant={d.status === "bozza" ? "outline" : "secondary"}>{STATUS_LABEL[d.status]}</Badge>
                          <span className="text-xs text-muted-foreground">{d.direct_purchase_items.length} prodotti</span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setOpenDirectDoc(d.id)}>{d.status === "bozza" ? "Apri bozza" : "Vedi"}</Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <DirectPurchaseDraftDialog
                docId={openDirectDoc}
                companyId={companyId}
                currentQuotas={Object.fromEntries(data.direct.map((x) => [x.item_id, { quantity: x.quantity, unit_code: x.unit_code, done: x.done }]))}
                onOpenChange={(o) => !o && setOpenDirectDoc(null)}
                onChanged={async (res) => {
                  setOpenDirectDoc(null);
                  await refresh();
                  setRebuild((n) => n + 1);
                  afterClose(res?.list_closed);
                }}
              />

              {data.issues.length || data.excluded.length ? (
                <section className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <h3 className="text-sm font-semibold">Prodotti non pronti</h3>
                  {data.issues.length ? <Button variant="outline" className="max-md:h-auto max-md:min-h-9 max-md:whitespace-normal max-md:py-2" onClick={onCompleteQuantities}>Sistema tutte le quantità mancanti</Button> : null}
                  <TooltipProvider delayDuration={150}>
                  {data.issues.map((i) => (
                    <div key={i.item_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm md:flex md:flex-wrap md:justify-between">
                      <span className="min-w-0 break-words md:flex-1">{i.code ? `${i.code} · ` : ""}{i.name} <span className="block text-muted-foreground md:inline">— {reasonFor(i)}</span></span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Sistema ${i.name}`} onClick={() => { onOpenChange(false); onGoToItem(i.item_id); }}><Lock className="size-4" /></Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Sistema questo prodotto</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="ghost" className="max-md:col-span-2 max-md:justify-self-start" disabled={exclusion.isPending} onClick={() => exclusion.mutate({ itemId: i.item_id, action: "exclude" })}>Non acquistare in questo ciclo</Button>
                    </div>
                  ))}
                  </TooltipProvider>
                  {data.excluded.map((i) => (
                    <div key={i.item_id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span className="line-through">{i.code ? `${i.code} · ` : ""}{i.name}</span>
                      <Button size="sm" variant="outline" disabled={exclusion.isPending} onClick={() => exclusion.mutate({ itemId: i.item_id, action: "restore" })}>Riprendi</Button>
                    </div>
                  ))}
                </section>
              ) : null}

              {outcomes.length ? (
                <GenerationSummary
                  outcomes={outcomes}
                  pendingOrder={sendOne.isPending ? sendOne.variables?.orderId ?? null : null}
                  onRetry={(o) => sendOne.mutate({ orderId: o.orderId, channel: null })}
                  onShare={(o) => setShareTarget(o)}
                  onOpenDirect={(id) => setOpenDirectDoc(id)}
                />
              ) : null}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
                {data.suppliers.length || directChecked.length ? (
                  <Button disabled={!selectedCount || blockedByCoverage || generate.isPending} onClick={() => generate.mutate()}>
                    {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Genera ordini selezionati ({selectedCount})
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {shareTarget ? (
        <ShareOrderDialog
          target={shareTarget}
          link={shareLinks[shareTarget.orderId] ?? null}
          onLink={(l) => setShareLinks((m) => ({ ...m, [shareTarget.orderId]: l }))}
          onClose={() => setShareTarget(null)}
          onConfirmed={async (closed) => {
            const cur = shareTarget;
            setOutcomes(list => replaceOutcome(list, cur.orderId, { kind: "inviato", name: cur.name, orderId: cur.orderId, number: cur.number }));
            await refresh();
            if (closed) toast.success("Lista completata e chiusa");
          }}
        />
      ) : null}

      {editingOrder ? (
        <DraftOrderEditor
          key={editingOrder}
          companyId={companyId}
          orderId={editingOrder}
          onClose={() => setEditingOrder(null)}
          onChanged={async (closed, newOrderId) => {
            await refresh();
            if (closed) {
              setEditingOrder(null);
              afterClose(true);
            } else if (newOrderId !== undefined) setEditingOrder(newOrderId);
          }}
        />
      ) : null}
    </>
  );
}

type DraftRow = {
  id: string;
  number: string | null;
  status: string;
  supplier_record_id: string;
  relation_id: string | null;
  shopping_list_id: string | null;
  delivery_date: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  delivery_address_text: string | null;
  destination_address_id: string | null;
  supplier_notes: string | null;
  supplier_records: { legal_name: string | null } | null;
};
type DraftItem = {
  id: string;
  product_code: string | null;
  product_name: string | null;
  purchase_quantity: number;
  purchase_unit_code: string | null;
  unit_cost: number | null;
  price_unit_code: string | null;
  product_supplier_links: { supplier_company_id: string | null } | null;
};


function DraftOrderEditor({
  companyId,
  orderId,
  onClose,
  onChanged,
}: {
  companyId: string;
  orderId: string;
  onClose: () => void;
  onChanged: (listClosed: boolean, newOrderId?: string | null) => Promise<void>;
}) {
  const runUpdate = useServerFn(updateDraftOrder);
  const runChange = useServerFn(changeDraftSupplier);
  const runOrder = useServerFn(managePurchaseOrder);
  const changeKey = useRef<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");

  const order = useQuery({
    queryKey: ["draft-order", orderId],
    queryFn: async () => {
      const [o, items] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("id, number, status, supplier_record_id, relation_id, shopping_list_id, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, destination_address_id, supplier_notes, supplier_records(legal_name)")
          .eq("id", orderId)
          .single(),
        supabase
          .from("purchase_order_items")
          .select("id, product_code, product_name, purchase_quantity, purchase_unit_code, unit_cost, price_unit_code, product_supplier_links(supplier_company_id)")
          .eq("order_id", orderId)
          .order("product_code"),
      ]);
      if (o.error) throw new Error(o.error.message);
      if (items.error) throw new Error(items.error.message);
      return { order: o.data as unknown as DraftRow, items: (items.data ?? []) as unknown as DraftItem[] };
    },
  });

  const suppliers = useQuery({
    queryKey: ["supplier-records-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_records")
        .select("id, legal_name")
        .eq("buyer_company_id", companyId)
        .eq("status", "attivo")
        .order("legal_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [state, setState] = useState<DraftEditState | null>(null);
  useEffect(() => {
    if (state || !order.data) return;
    const saved = draftStateFromSaved(order.data.order, order.data.items);
    const delivery: Delivery = { ...saved.delivery, addressId: order.data.order.destination_address_id };
    setState({ ...saved, delivery });
  }, [order.data, state]);
  const editPrefs = useDeliveryPreferences(companyId);

  const isB2b = Boolean(order.data?.order.relation_id);
  const dirty = isDraftDirty(state, order.data?.order ?? null, order.data?.items ?? []);

  const save = useMutation({
    mutationFn: async () => {
      if (!state || !order.data) return;
      const lines = order.data.items
        .filter((i) => state.qty[i.id] !== String(i.purchase_quantity))
        .map((i) => {
          const raw = (state.qty[i.id] ?? "").trim().replace(",", ".");
          return { line_id: i.id, purchase_quantity: raw === "" ? 0 : Number(raw) };
        });
      if (lines.some((l) => !Number.isFinite(l.purchase_quantity) || l.purchase_quantity < 0)) throw new Error("Quantità non valida");
      await runUpdate({ data: { orderId, lines, delivery: toDeliveryPayload(state.delivery) } });
    },
    onSuccess: async () => {
      
      setState(null);
      await order.refetch();
      await onChanged(false);
      toast.success("Bozza salvata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const change = useMutation({
    mutationFn: async () => {
      changeKey.current ??= crypto.randomUUID();
      return runChange({ data: { orderId, supplierRecordId: newSupplier, generationKey: changeKey.current } });
    },
    onSuccess: async (res) => {
      changeKey.current = null;
      
      toast.success("Fornitore cambiato: nuova bozza creata");
      await onChanged(false, res.order_id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: async (channel: SendChannel | null) => {
      await runOrder({ data: { orderId, action: "send", destinationLocationId: null, notes: null, sendChannel: channel ?? null } });
      if (!order.data?.order.shopping_list_id) return false;
      const { data } = await supabase.from("shopping_lists").select("status").eq("id", order.data.order.shopping_list_id).single();
      return data?.status === "chiusa";
    },
    onSuccess: async (closed) => {
      setSendOpen(false);
      
      toast.success("Ordine inviato");
      await onChanged(Boolean(closed), null);
      if (!closed) onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [confirmClose, setConfirmClose] = useState(false);
  const o = order.data?.order;
  const editable = o?.status === "bozza";
  const close = () => {
    if (draftCloseAction(dirty, editable) === "ask") { setConfirmClose(true); return; }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>Se chiudi ora, le modifiche a quantità e consegna andranno perse.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmClose(false); onClose(); }}>Chiudi senza salvare</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bozza {o?.number ?? ""} · {o?.supplier_records?.legal_name ?? "Fornitore"}</DialogTitle>
          <DialogDescription>
            {editable ? "Modifica quantità, consegna e note, poi invia." : "Questo ordine non è più una bozza."}
          </DialogDescription>
        </DialogHeader>
        {!o || !state ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Caricamento…</p>
        ) : (
          <div className="space-y-3">
            <DeliveryFields addresses={editPrefs.data?.addresses ?? []} value={state.delivery} disabled={!editable} onChange={(delivery) => setState({ ...state, delivery })} />
            <div className="space-y-1">
              {order.data!.items.map((i) => (
                <div key={i.id} className="grid grid-cols-[1fr_8rem] items-center gap-2 rounded border border-border/60 p-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.product_code ? `${i.product_code} · ` : ""}{i.product_name}</p>
                    <p className="text-xs text-muted-foreground">{linePrice({ unit_cost: i.unit_cost, price_unit_code: i.price_unit_code, is_b2b: Boolean(i.product_supplier_links?.supplier_company_id) })}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      inputMode="decimal"
                      className="h-8 text-right"
                      disabled={!editable}
                      value={state.qty[i.id] ?? ""}
                      onChange={(e) => setState({ ...state, qty: { ...state.qty, [i.id]: e.target.value } })}
                    />
                    <span className="w-10 text-xs text-muted-foreground">{i.purchase_unit_code ?? ""}</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Quantità vuota o 0 toglie il prodotto dalla bozza. Non si può superare la quantità da ordinare.</p>
            </div>
            {editable ? (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-2">
                <div className="min-w-48 flex-1 space-y-1">
                  <Label className="text-xs">Cambia fornitore</Label>
                  <Select value={newSupplier} onValueChange={setNewSupplier}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Scegli il nuovo fornitore" /></SelectTrigger>
                    <SelectContent>
                      {(suppliers.data ?? []).filter((s) => s.id !== o.supplier_record_id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="outline" disabled={!newSupplier || dirty || change.isPending} onClick={() => change.mutate()}>Cambia</Button>
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={close}>Chiudi</Button>
              {editable ? (
                <>
                  <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Salva bozza</Button>
                  <Button disabled={dirty || send.isPending} onClick={() => setSendOpen(true)}><Send className="size-4" /> Invia</Button>
                </>
              ) : null}
            </DialogFooter>
            {dirty && editable ? <p className="text-right text-xs text-muted-foreground">Salva prima di inviare o cambiare fornitore.</p> : null}
          </div>
        )}
        <SendOrderDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          isB2b={isB2b}
          orderId={orderId}
          onShared={async (closed) => {
            setSendOpen(false);
            await onChanged(closed, null);
            if (!closed) onClose();
          }}
          supplierName={o?.supplier_records?.legal_name ?? null}
          orderNumber={o?.number ?? null}
          pending={send.isPending}
          onConfirm={(channel) => send.mutate(channel)}
          sellerCompanyId={
            order.data?.items.find((i) => i.product_supplier_links?.supplier_company_id)
              ?.product_supplier_links?.supplier_company_id ?? null
          }
        />
      </DialogContent>
    </Dialog>
  );
}
