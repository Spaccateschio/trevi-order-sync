import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, FileText, Loader2, Send, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SendOrderDialog, type SendChannel } from "@/components/purchase/send-order-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { qty } from "@/lib/inventory";
import {
  changeDraftSupplier,
  confirmAssignmentCoverage,
  generateSupplierOrder,
  getGenerationPreview,
  manageListExclusion,
  registerDirectPurchase,
  updateDraftOrder,
  type GenerationLine,
  type GenerationPreview,
} from "@/lib/order-generation.functions";
import { managePurchaseOrder } from "@/lib/purchase.functions";
import { assignShoppingListSupplier, setShoppingListItemQuantityLock } from "@/lib/shopping-list.functions";
import { autoAssignItem } from "@/lib/shopping-auto-assign";
import { issueReason, type RowFacts } from "@/lib/supplier-selection";
import { MISSING_SELLING_PRICE, priceLabel } from "@/lib/purchase";

type Delivery = { date: string; from: string; to: string; address: string; notes: string };
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
  };
}

function DeliveryFields({ value, onChange, disabled }: { value: Delivery; onChange: (d: Delivery) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Data</Label>
        <Input type="date" value={value.date} disabled={disabled} onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Dalle</Label>
        <Input type="time" value={value.from} disabled={disabled} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Alle</Label>
        <Input type="time" value={value.to} disabled={disabled} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-1">
        <Label className="text-xs">Luogo</Label>
        <Input value={value.address} disabled={disabled} maxLength={300} onChange={(e) => onChange({ ...value, address: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-4">
        <Label className="text-xs">Note per il fornitore</Label>
        <Textarea rows={2} value={value.notes} disabled={disabled} maxLength={1000} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
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
}: {
  companyId: string;
  listId: string;
  open: boolean;
  mode: "genera" | "bozze";
  onOpenChange: (open: boolean) => void;
  onGoToItem: (itemId: string) => void;
  onListClosed: () => void;
}) {
  const queryClient = useQueryClient();
  const readPreview = useServerFn(getGenerationPreview);
  const runGenerate = useServerFn(generateSupplierOrder);
  const runUpdate = useServerFn(updateDraftOrder);
  const runExclusion = useServerFn(manageListExclusion);
  const runDirect = useServerFn(registerDirectPurchase);
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
        .select("id, product_id, decided_quantity, quantity_locked_at, excluded_at")
        .eq("list_id", listId);
      if (error) throw new Error(error.message);
      const productIds = [...new Set((items ?? []).map((i) => i.product_id as string))];
      const { data: links, error: linkError } = productIds.length
        ? await supabase.from("product_supplier_links").select("product_id").in("product_id", productIds).eq("is_active", true)
        : { data: [], error: null };
      if (linkError) throw new Error(linkError.message);
      const count = new Map<string, number>();
      for (const l of links ?? []) count.set(l.product_id as string, (count.get(l.product_id as string) ?? 0) + 1);
      return (items ?? []).map((i) => ({
        id: i.id as string,
        quantity: i.decided_quantity === null ? null : Number(i.decided_quantity),
        locked: Boolean(i.quantity_locked_at),
        excluded: Boolean(i.excluded_at),
        links: count.get(i.product_id as string) ?? 0,
      }));
    },
  });
  const factsById = new Map((facts.data ?? []).map((f) => [f.id, f]));
  const reasonFor = (i: { item_id: string; status: string }) => {
    const f = factsById.get(i.item_id);
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

  const [step, setStep] = useState<"avviso" | "fornitori">("avviso");
  const [drafts, setDrafts] = useState<Record<string, SupplierDraft>>({});
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  // Una chiave per fornitore finché la generazione non riesce: ripetere il clic restituisce lo stesso ordine.
  const keys = useRef<Record<string, string>>({});

  useEffect(() => {
    if (open) setStep(mode === "bozze" ? "fornitori" : "avviso");
  }, [open, mode]);

  // Inizializza le card nuove senza toccare quelle già modificate.
  useEffect(() => {
    const data = preview.data;
    if (!data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of data.suppliers) {
        const old = next[s.supplier_record_id];
        const lines: SupplierDraft["lines"] = {};
        for (const l of s.lines) lines[l.assignment_id] = old?.lines[l.assignment_id] ?? { included: true, quantity: String(l.quantity) };
        next[s.supplier_record_id] = {
          selected: old?.selected ?? true,
          delivery: old?.delivery ?? {
            date: data.delivery.date ?? "",
            from: data.delivery.time_from ?? "",
            to: data.delivery.time_to ?? "",
            address: data.delivery.address_text ?? "",
            notes: "",
          },
          lines,
        };
      }
      return next;
    });
  }, [preview.data]);

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

  const generate = useMutation({
    mutationFn: async () => {
      const data = preview.data as GenerationPreview;
      const done: string[] = [];
      const failed: string[] = [];
      for (const s of data.suppliers) {
        const d = drafts[s.supplier_record_id];
        if (!d?.selected) continue;
        const chosen = s.lines.filter((l) => d.lines[l.assignment_id]?.included);
        if (!chosen.length) continue;
        const key = (keys.current[s.supplier_record_id] ??= crypto.randomUUID());
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
          done.push(s.name);
        } catch (error) {
          failed.push(`${s.name}: ${(error as Error).message}`);
        }
      }
      return { done, failed };
    },
    onSuccess: async ({ done, failed }) => {
      setDrafts({});
      await refresh();
      if (done.length) toast.success(`Bozze generate: ${done.join(", ")}`);
      for (const f of failed) toast.error(f);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exclusion = useMutation({
    mutationFn: (p: { itemId: string; action: "exclude" | "restore" }) =>
      runExclusion({ data: { listId, itemIds: [p.itemId], action: p.action, reason: p.action === "exclude" ? "Procedi comunque" : null } }),
    onSuccess: async (res) => {
      await refresh();
      afterClose(res.list_closed);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const direct = useMutation({
    mutationFn: (itemId: string) => runDirect({ data: { itemId } }),
    onSuccess: async (res) => {
      await refresh();
      toast.success("Acquisto diretto registrato");
      afterClose(res.list_closed);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const coverage = useMutation({
    mutationFn: (assignmentId: string) => runCoverage({ data: { assignmentId, confirm: true } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const data = preview.data;
  const selectedCount = data
    ? data.suppliers.filter((s) => drafts[s.supplier_record_id]?.selected && s.lines.some((l) => drafts[s.supplier_record_id]?.lines[l.assignment_id]?.included)).length
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
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{step === "avviso" ? "Prima di generare gli ordini" : "Genera ordini per fornitore"}</DialogTitle>
            <DialogDescription>
              Gli ordini nascono come bozze: puoi modificarli e inviarli quando vuoi. La Lista si chiude da sola quando tutto è stato gestito.
            </DialogDescription>
          </DialogHeader>

          {preview.isLoading || !data ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Caricamento…</p>
          ) : step === "avviso" && data.issues.length ? (
            <div className="space-y-3">
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
                <p>Alcuni prodotti hanno quantità da sistemare. Puoi sistemarle ora oppure procedere con i prodotti pronti: quelli da sistemare restano nella Lista.</p>
              </div>
              <ul className="space-y-1 text-sm">
                {data.issues.map((i) => (
                  <li key={i.item_id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                    <span className="min-w-0 truncate">{i.code ? `${i.code} · ` : ""}{i.name} <span className="text-muted-foreground">— {reasonFor(i)}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => { onOpenChange(false); onGoToItem(i.item_id); }}>Vai</Button>
                  </li>
                ))}
              </ul>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { onOpenChange(false); onGoToItem(data.issues[0]?.item_id ?? ""); }}>Sistema le quantità</Button>
                <Button onClick={() => setStep("fornitori")}>Procedi comunque</Button>
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
                      <div key={s.supplier_record_id} className="rounded-md border border-border p-3">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox checked={d.selected} onCheckedChange={(v) => setDraft(s.supplier_record_id, (x) => ({ ...x, selected: v === true }))} />
                          {s.name}
                          {s.is_b2b ? <Badge variant="secondary">B2B</Badge> : null}
                          <span className="font-normal text-muted-foreground">· {s.lines.length} {s.lines.length === 1 ? "prodotto" : "prodotti"}</span>
                        </label>
                        <div className="mt-2">
                          <DeliveryFields value={d.delivery} disabled={!d.selected} onChange={(delivery) => setDraft(s.supplier_record_id, (x) => ({ ...x, delivery }))} />
                        </div>
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button size="sm" variant="ghost" className="mt-2 px-1"><ChevronDown className="size-4" /> Prodotti</Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-1">
                            {s.lines.map((l: GenerationLine) => {
                              const ln = d.lines[l.assignment_id];
                              return (
                                <div key={l.assignment_id} className="grid grid-cols-[auto_1fr] gap-2 rounded border border-border/60 p-2 text-sm sm:grid-cols-[auto_1fr_8rem]">
                                  <Checkbox
                                    className="mt-1"
                                    checked={ln?.included ?? false}
                                    disabled={!d.selected}
                                    onCheckedChange={(v) => setDraft(s.supplier_record_id, (x) => ({ ...x, lines: { ...x.lines, [l.assignment_id]: { quantity: x.lines[l.assignment_id]?.quantity ?? "", included: v === true } } }))}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{l.code ? `${l.code} · ` : ""}{l.name}</p>
                                    <p className="text-xs text-muted-foreground">{linePrice(l)}{l.notes ? ` · ${l.notes}` : ""}</p>
                                    {l.needs_coverage ? (
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                        <span>Manca la conversione U.M.: conferma che {qty(l.quantity)} {l.unit_code ?? ""} coprono il fabbisogno.</span>
                                        <Button size="sm" variant="outline" disabled={coverage.isPending} onClick={() => coverage.mutate(l.assignment_id)}>Confermo la copertura</Button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                                    <Input
                                      inputMode="decimal"
                                      className="h-8 text-right"
                                      value={ln?.quantity ?? ""}
                                      disabled={!d.selected || !ln?.included}
                                      onChange={(e) => setDraft(s.supplier_record_id, (x) => ({ ...x, lines: { ...x.lines, [l.assignment_id]: { included: x.lines[l.assignment_id]?.included ?? true, quantity: e.target.value } } }))}
                                    />
                                    <span className="w-10 text-xs text-muted-foreground">{l.unit_code ?? ""}</span>
                                  </div>
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

              {data.direct.length ? (
                <section className="space-y-2 rounded-md border border-border p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="size-4" /> Acquisti diretti</h3>
                  {data.direct.map((x) => (
                    <div key={x.item_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{x.code ? `${x.code} · ` : ""}{x.name} — {qty(x.quantity)} {x.unit_code ?? ""}</span>
                      {x.done ? (
                        <Badge variant="secondary">Registrato</Badge>
                      ) : (
                        <Button size="sm" variant="outline" disabled={direct.isPending} onClick={() => direct.mutate(x.item_id)}>Registra acquisto fatto</Button>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}

              {data.issues.length || data.excluded.length ? (
                <section className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <h3 className="text-sm font-semibold">Prodotti non pronti</h3>
                  {data.issues.map((i) => (
                    <div key={i.item_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{i.code ? `${i.code} · ` : ""}{i.name} <span className="text-muted-foreground">— {reasonFor(i)}</span></span>
                      <Button size="sm" variant="ghost" disabled={exclusion.isPending} onClick={() => exclusion.mutate({ itemId: i.item_id, action: "exclude" })}>Non acquistare in questo ciclo</Button>
                    </div>
                  ))}
                  {data.excluded.map((i) => (
                    <div key={i.item_id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span className="line-through">{i.code ? `${i.code} · ` : ""}{i.name}</span>
                      <Button size="sm" variant="outline" disabled={exclusion.isPending} onClick={() => exclusion.mutate({ itemId: i.item_id, action: "restore" })}>Riprendi</Button>
                    </div>
                  ))}
                </section>
              ) : null}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
                {data.suppliers.length ? (
                  <Button disabled={!selectedCount || blockedByCoverage || generate.isPending} onClick={() => generate.mutate()}>
                    {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Genera ordini selezionati ({selectedCount})
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
          .select("id, number, status, supplier_record_id, relation_id, shopping_list_id, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes, supplier_records(legal_name)")
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
    setState(draftStateFromSaved(order.data.order, order.data.items));
  }, [order.data, state]);

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
            <DeliveryFields value={state.delivery} disabled={!editable} onChange={(delivery) => setState({ ...state, delivery })} />
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
          supplierName={o?.supplier_records?.legal_name ?? null}
          orderNumber={o?.number ?? null}
          pending={send.isPending}
          onConfirm={(channel) => send.mutate(channel)}
        />
      </DialogContent>
    </Dialog>
  );
}
