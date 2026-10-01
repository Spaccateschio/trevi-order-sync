import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, Loader2, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeliveryDatePicker, DeliveryPlacePicker } from "@/components/purchase/delivery-fields";
import { addDays, hhmm, localToday, useDeliveryPreferences } from "@/lib/delivery-preferences";
import { qty } from "@/lib/inventory";
import { closeShoppingList, getShoppingListClosePreview } from "@/lib/shopping-list.functions";

type Override = { date: string; from: string; to: string; address: string; notes: string };

/**
 * Riepilogo e chiusura definitiva della Lista. Regole (quantità mancante, acquisti diretti, residui)
 * decise solo dal database: qui si mostrano e si raccolgono consegna e note.
 */
export function CloseListDialog({
  companyId,
  listId,
  open,
  onOpenChange,
  onClosed,
  onGoToItem,
}: {
  companyId: string;
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: (number: string, listId: string) => void;
  onGoToItem: (itemId: string) => void;
}) {
  const readPreview = useServerFn(getShoppingListClosePreview);
  const runClose = useServerFn(closeShoppingList);
  const queryClient = useQueryClient();
  const previewQuery = useQuery({
    queryKey: ["shopping-list-close-preview", listId],
    enabled: open,
    staleTime: 0,
    queryFn: () => readPreview({ data: { listId } }),
  });
  const preview = previewQuery.data;

  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [address, setAddress] = useState("");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [directNotes, setDirectNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const prefs = useDeliveryPreferences(open ? companyId : null);
  const today = localToday(prefs.data?.timezone ?? "Europe/Rome");
  const initRef = useRef(false);
  // Precompilazione dalle preferenze aziendali: solo valori iniziali, non le modifica.
  useEffect(() => {
    if (initRef.current || !prefs.data || !preview) return;
    initRef.current = true;
    const p = prefs.data;
    setDate(p.day === "domani" ? addDays(today, 1) : today);
    setFrom(hhmm(p.timeFrom));
    setTo(hhmm(p.timeTo));
    const preferred = p.addresses.find((a) => a.id === p.addressId);
    if (preferred) {
      setAddress(preferred.text);
      setAddressId(preferred.id);
    } else if (preview.default_address) {
      setAddress(preview.default_address.text);
      setAddressId(preview.default_address.id);
    }
  }, [prefs.data, preview, today]);

  const blocked = Boolean(preview?.missing.length);
  const setOv = (id: string, patch: Partial<Override>) =>
    setOverrides((cur) => ({ ...cur, [id]: { date: "", from: "", to: "", address: "", notes: "", ...cur[id], ...patch } }));

  const submit = async () => {
    if (!preview || blocked || pendingRef.current) return;
    if (from && to && from >= to) { toast.error("L'orario «dalle» deve precedere «alle»"); return; }
    if (date && date < today) { toast.error("La data di consegna non può essere passata"); return; }
    const badOv = Object.values(overrides).find((o) => o.from && o.to && o.from >= o.to);
    if (badOv) { toast.error("In un fornitore l'orario «dalle» deve precedere «alle»"); return; }
    pendingRef.current = true;
    setPending(true);
    try {
      const result = await runClose({
        data: {
          companyId,
          listId,
          delivery: {
            date: date || null,
            time_from: from || null,
            time_to: to || null,
            // Luogo scritto a mano: vale solo la fotografia testuale, nessun nuovo indirizzo in anagrafica.
            address_id: addressId,
            address_text: address.trim() || null,
          },
          generalNotes: notes.trim() || null,
          supplierOverrides: Object.entries(overrides).map(([id, o]) => ({
            supplier_record_id: id,
            date: o.date || null,
            time_from: o.from || null,
            time_to: o.to || null,
            address_text: o.address.trim() || null,
            notes: o.notes.trim() || null,
          })),
          directNotes: Object.entries(directNotes)
            .filter(([, v]) => v.trim())
            .map(([item_id, v]) => ({ item_id, notes: v.trim() })),
        },
      });
      await queryClient.invalidateQueries();
      toast.success(`Lista ${result.number} chiusa: ${result.order_ids.length} ordini da inviare`);
      onClosed(result.number, result.list_id);
    } catch (error) {
      toast.error((error as Error).message);
      void previewQuery.refetch();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const orderedCount = preview?.ordered_products ?? 0;
  const directCount = preview?.direct.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(value) => (!pending ? onOpenChange(value) : undefined)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Riepilogo Lista della Spesa</DialogTitle>
          <DialogDescription>
            Dopo «Conferma e genera» la Lista va nello storico e non si modifica più.
          </DialogDescription>
        </DialogHeader>

        {previewQuery.isLoading || !preview ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparazione riepilogo…
          </p>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-base font-bold">{preview.items_total} prodotti nella Lista</p>
              <p>
                <strong>{orderedCount}</strong> verranno ordinati ai fornitori · <strong>{directCount}</strong> acquisti diretti
              </p>
            </div>

            {blocked ? (
              <section className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="flex items-center gap-1 font-semibold text-destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" /> Lista non completa
                </p>
                <p className="mt-1">Manca la quantità da acquistare per {preview.missing.length} prodotti:</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.missing.map((m) => (
                    <li key={m.item_id}>
                      <button type="button" className="text-left font-medium underline" onClick={() => onGoToItem(m.item_id)}>
                        {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {preview.uncertain.length ? (
              <section className="rounded-md border border-accent bg-accent/20 p-3">
                <p className="font-semibold">Da verificare</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {preview.uncertain.map((u) => (
                    <li key={u.item_id}>
                      <strong>{u.name}</strong> — {u.reason}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="font-semibold uppercase tracking-wide text-muted-foreground">Consegna generale</h3>
              <DeliveryDatePicker id="cl-date" value={date} today={today} onChange={setDate} />
              <div className="grid grid-cols-2 gap-2 sm:w-80">
                <div>
                  <Label htmlFor="cl-from">Dalle</Label>
                  <Input id="cl-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cl-to">Alle</Label>
                  <Input id="cl-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <DeliveryPlacePicker
                addresses={prefs.data?.addresses ?? []}
                addressId={addressId}
                text={address}
                onChange={(next) => {
                  setAddressId(next.addressId);
                  setAddress(next.text);
                }}
              />
              <div>
                <Label htmlFor="cl-notes">Note generali</Label>
                <Textarea id="cl-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold uppercase tracking-wide text-muted-foreground">Ordini fornitori</h3>
              {preview.orders.length ? (
                preview.orders.map((o) => {
                  const ov = overrides[o.supplier_record_id];
                  return (
                    <Collapsible key={o.supplier_record_id} className="rounded-md border border-border">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                        <span className="flex items-center gap-2">
                          <Truck className="size-4" aria-hidden="true" />
                          <strong>{o.name}</strong> — {o.lines} righe
                          {ov && (ov.date || ov.from || ov.to || ov.address || ov.notes) ? (
                            <span className="text-xs text-muted-foreground">· personalizzato</span>
                          ) : null}
                        </span>
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2 border-t border-border px-3 py-2">
                        <p className="text-xs text-muted-foreground">Vuoto = uguale alla consegna generale.</p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Input type="date" aria-label={`Data ${o.name}`} value={ov?.date ?? ""} onChange={(e) => setOv(o.supplier_record_id, { date: e.target.value })} />
                          <Input type="time" aria-label={`Dalle ${o.name}`} value={ov?.from ?? ""} onChange={(e) => setOv(o.supplier_record_id, { from: e.target.value })} />
                          <Input type="time" aria-label={`Alle ${o.name}`} value={ov?.to ?? ""} onChange={(e) => setOv(o.supplier_record_id, { to: e.target.value })} />
                        </div>
                        <Input placeholder="Indirizzo (se diverso)" value={ov?.address ?? ""} onChange={(e) => setOv(o.supplier_record_id, { address: e.target.value })} />
                        <Textarea rows={2} placeholder={`Note per ${o.name}`} value={ov?.notes ?? ""} onChange={(e) => setOv(o.supplier_record_id, { notes: e.target.value })} />
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              ) : (
                <p className="text-muted-foreground">Nessun ordine fornitore.</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold uppercase tracking-wide text-muted-foreground">Acquisti diretti</h3>
              {preview.direct.length ? (
                <ul className="space-y-1.5">
                  {preview.direct.map((d) => (
                    <li key={d.item_id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        ☐ <strong>{d.name}</strong> — {qty(d.quantity)} {d.unit_code ?? ""}
                        {d.origin === "residuo" ? <span className="text-xs text-muted-foreground"> (residuo)</span> : null}
                      </span>
                      <Input
                        className="h-8 w-full sm:w-52"
                        placeholder="Nota (es. al CAR)"
                        value={directNotes[d.item_id] ?? ""}
                        onChange={(e) => setDirectNotes((cur) => ({ ...cur, [d.item_id]: e.target.value }))}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nessun acquisto diretto.</p>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {preview && !blocked ? (
            <p className="rounded-md bg-primary/10 px-3 py-2 text-center font-semibold">
              {orderedCount} prodotti verranno ordinati · {directCount} acquisti diretti
              {preview.uncertain.length ? ` · ${preview.uncertain.length} da verificare` : ""}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Torna alla Lista
            </Button>
            <Button type="button" disabled={!preview || blocked || pending} onClick={() => void submit()}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Conferma e genera
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
