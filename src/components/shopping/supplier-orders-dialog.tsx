import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Copy, Download, Mail, MapPin, MessageCircle, Pencil, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupplierDot, supplierToneStyle } from "@/components/suppliers/supplier-color";
import { supabase } from "@/integrations/supabase/client";
import { bulkB2bSupplierNames, entryCartLinesBySupplier, type EntryCartLine } from "@/lib/local-entry-cart";
import type { SupplierColorCode } from "@/lib/supplier-color";

/**
 * Ordini per fornitore dopo il Conferma del Carrello — SOLO PRESENTAZIONE.
 * Legge giorno/orario/luogo da shopping_lists (delivery_date, delivery_time_from,
 * delivery_time_to, delivery_address_text). Note, modifica orario e stato «Inviato»
 * restano locali: nessuna scrittura, nessun invio reale.
 */
type Schedule = { date: string; from: string; to: string };

const hhmm = (value: string | null | undefined) => (value ?? "").slice(0, 5);
const dateLabel = (iso: string) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "";
export function scheduleLabel(s: Schedule) {
  const time = s.from && s.to ? `${s.from}–${s.to}` : s.from || s.to;
  return [dateLabel(s.date), time].filter(Boolean).join(" · ");
}

export function SupplierOrdersDialog({ open, onOpenChange, listId, lines, supplierTone, b2bSuppliers = new Set() }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string | null;
  lines: EntryCartLine[];
  supplierTone?: ((name: string | null | undefined) => { color: SupplierColorCode } | null) | undefined;
  b2bSuppliers?: ReadonlySet<string>;
}) {
  const tone = (name: string) => supplierTone?.(name) ?? null;
  const groups = useMemo(() => entryCartLinesBySupplier(lines), [lines]);
  const bulkSuppliers = bulkB2bSupplierNames(groups, b2bSuppliers);
  const delivery = useQuery({
    queryKey: ["shopping-list-delivery", listId],
    enabled: open && Boolean(listId),
    queryFn: async () => {
      const { data, error } = await supabase.from("shopping_lists").select("delivery_date, delivery_time_from, delivery_time_to, delivery_address_text").eq("id", listId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const base: Schedule = { date: delivery.data?.delivery_date ?? "", from: hhmm(delivery.data?.delivery_time_from), to: hhmm(delivery.data?.delivery_time_to) };
  const place = delivery.data?.delivery_address_text ?? "";
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, Schedule>>({});
  const [sent, setSent] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Schedule>(base);
  const [sharing, setSharing] = useState<string | null>(null);
  const scheduleOf = (supplier: string) => overrides[supplier] ?? base;
  const sentCount = groups.filter((g) => sent[g.supplier]).length;

  const markSent = (supplier: string, channel: string) => {
    setSent((current) => ({ ...current, [supplier]: (current[supplier] ?? 0) + 1 }));
    setSharing(null);
    toast.info(`${channel}: anteprima grafica, nessun ordine è stato inviato davvero`);
  };

  const sendOne = (supplier: string) => {
    if (b2bSuppliers.has(supplier)) markSent(supplier, "Invio B2B");
    else setSharing(supplier);
  };

  const sendBulkB2b = () => {
    if (!bulkSuppliers.length) return;
    setSent((current) => {
      const next = { ...current };
      for (const supplier of bulkSuppliers) next[supplier] = (next[supplier] ?? 0) + 1;
      return next;
    });
    toast.info("Invio multiplo B2B: anteprima grafica, nessun ordine è stato inviato davvero");
  };

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="size-4" /> Ordini per fornitore</DialogTitle>
          <DialogDescription>Fornitori e prodotti restano quelli del riepilogo. Usa l'aeroplanino per il singolo ordine oppure l'invio multiplo per i soli B2B.</DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-xs" role="note">Anteprima grafica: l'invio e il salvataggio di note e orario non sono ancora collegati.</p>
        {bulkSuppliers.length ? <Button type="button" variant="outline" className="w-full" onClick={sendBulkB2b}><Send className="size-4" /> Invia tutti gli ordini B2B ({bulkSuppliers.length})</Button> : null}
        <div className="min-h-0 overflow-y-auto pr-1">
          {groups.length ? <Accordion type="multiple" defaultValue={groups.map((group) => group.supplier)} className="space-y-2">
            {groups.map((group) => {
              const t = tone(group.supplier);
              const isB2B = b2bSuppliers.has(group.supplier);
              const isSent = Boolean(sent[group.supplier]);
              const when = scheduleLabel(scheduleOf(group.supplier));
              return <AccordionItem key={group.supplier} value={group.supplier} data-sent={isSent || undefined}
                className={isSent ? "rounded-md border border-success/50 bg-success/15 px-3" : t ? "supplier-tint rounded-md border border-border border-l-[6px] border-l-[var(--supplier-tone)] bg-card px-3" : "rounded-md border border-border px-3"}
                style={isSent ? undefined : supplierToneStyle(t)}>
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="min-w-0 flex-1 gap-2 py-3 hover:no-underline">
                    {t ? <SupplierDot color={t.color} className="size-3" /> : null}
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block break-words font-semibold">{group.supplier}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs font-normal text-muted-foreground">
                        <span>{group.lines.length} {group.lines.length === 1 ? "prodotto" : "prodotti"}</span>
                        {isB2B ? <Badge variant="outline" className="px-1 py-0 text-[10px]">B2B</Badge> : null}
                        {when ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" />{when}</span> : null}
                      </span>
                    </span>
                    {isSent ? <Badge variant="outline" className="border-success/60 text-xs"><Check className="size-3" /> Inviato{sent[group.supplier]! > 1 ? ` ×${sent[group.supplier]}` : ""}</Badge> : null}
                  </AccordionTrigger>
                  <Button type="button" size="icon" variant={isSent ? "outline" : "default"} className="size-9 shrink-0" onClick={() => sendOne(group.supplier)} aria-label={`${isSent ? "Rinvia" : "Invia"} ordine a ${group.supplier}`}><Send className="size-4" /></Button>
                </div>
                <AccordionContent className="space-y-3">
                  <ul className="space-y-2">{group.lines.map((line) => <li key={line.id} className="rounded-md bg-muted/40 p-2">
                    <p className="break-words text-sm font-semibold">{line.label}</p>
                    {line.detail ? <p className="text-xs text-muted-foreground">{line.detail}</p> : null}
                    {/* Punto previsto per la futura modifica delle quantità: oggi restano quelle del Carrello. */}
                    <p className="text-sm" data-quantity-edit-slot>Quantità: <strong>{line.quantity} {line.unitCode ?? ""}</strong></p>
                  </li>)}</ul>
                  <div className="rounded-md border border-border bg-background/60 p-2 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-1"><CalendarClock className="size-3.5 shrink-0" /> {when || <span className="text-muted-foreground">Data e orario non impostati (facoltativi)</span>}</p>
                        <p className="flex items-center gap-1"><MapPin className="size-3.5 shrink-0" /> {place || <span className="text-muted-foreground">Luogo non impostato</span>}</p>
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => { setDraft(scheduleOf(group.supplier)); setEditing(group.supplier); }} aria-label={`Modifica data e orario per ${group.supplier}`}><Pencil className="size-4" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`note-${group.supplier}`} className="text-xs">Nota per il fornitore (facoltativa)</Label>
                    <Textarea id={`note-${group.supplier}`} rows={2} value={notes[group.supplier] ?? ""} onChange={(e) => setNotes((c) => ({ ...c, [group.supplier]: e.target.value }))} placeholder="Es. lasciare in magazzino" />
                  </div>
                </AccordionContent>
              </AccordionItem>;
            })}
          </Accordion> : <p className="text-sm text-muted-foreground">Nessun prodotto con quantità confermata.</p>}
        </div>
        <DialogFooter><p className="mr-auto self-center text-xs text-muted-foreground">{sentCount} di {groups.length} inviati</p><Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
        <DialogHeader><DialogTitle>Data e orario di consegna</DialogTitle><DialogDescription>{editing} · facoltativi, valgono solo per questo ordine.</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          <Label className="text-xs">Giorno<Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Label>
          <div className="grid grid-cols-2 gap-2">
            <Label className="text-xs">Dalle<Input type="time" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Label>
            <Label className="text-xs">Alle<Input type="time" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Label>
          </div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button><Button onClick={() => { if (editing) setOverrides((c) => ({ ...c, [editing]: draft })); setEditing(null); }}>Usa data e orario</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={sharing !== null} onOpenChange={(o) => { if (!o) setSharing(null); }}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
        <DialogHeader><DialogTitle>Invia a {sharing}</DialogTitle><DialogDescription>Il fornitore apre la nostra pagina, compila e conferma: la risposta torna nell'app.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {([["WhatsApp", MessageCircle], ["Email", Mail], ["Copia link", Copy], ["Scarica PDF", Download], ["Stampa", Printer]] as const).map(([label, Icon]) => <Button key={label} variant="outline" className="h-11" onClick={() => sharing && markSent(sharing, label)}><Icon className="size-4" /> {label}</Button>)}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
