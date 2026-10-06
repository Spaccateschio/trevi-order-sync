import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Phone, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { OrderOverviewRow } from "@/lib/purchase";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Un'unica etichetta di stato per l'ordine, lato cliente. */
export function orderLabel(o: OrderOverviewRow, seenAt: string | null): { label: string; variant: BadgeVariant; locked: boolean } {
  if (o.status === "annullato") return { label: "Annullato", variant: "destructive", locked: false };
  if (o.status === "chiuso") return { label: "Chiuso", variant: "outline", locked: false };
  if (o.status === "bozza" || o.send_status === "da_inviare") return { label: "Da inviare", variant: "default", locked: false };
  if (o.send_status === "errore_invio") return { label: "Errore invio", variant: "destructive", locked: false };
  if (o.status === "inviato") {
    return seenAt
      ? { label: "Visto dal fornitore", variant: "secondary", locked: true }
      : { label: "Inviato – in attesa", variant: "secondary", locked: false };
  }
  const map: Record<string, string> = {
    parzialmente_consegnato: "Parzialmente consegnato",
    consegnato: "Consegnato",
  };
  return { label: map[o.status] ?? o.status, variant: "secondary", locked: false };
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export function OrderEditDialog({
  order,
  onClose,
  onSaved,
}: {
  order: OrderOverviewRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent>
        {order ? <EditForm key={order.order_id} order={order} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type EditLine = { key: string; item_id?: string | undefined; link_id?: string | undefined; name: string; unit: string; quantity: string };

function EditForm({ order, onClose, onSaved }: { order: OrderOverviewRow; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [date, setDate] = useState(order.delivery_date ?? "");
  const [from, setFrom] = useState(hhmm(order.delivery_time_from));
  const [to, setTo] = useState(hhmm(order.delivery_time_to));
  const [address, setAddress] = useState(order.delivery_address_text ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [lines, setLines] = useState<EditLine[] | null>(null);
  const [addLink, setAddLink] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const itemsQuery = useQuery({
    queryKey: ["order-edit-items", order.order_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, product_name, product_code, purchase_quantity, purchase_unit_code, unit_code, product_supplier_link_id")
        .eq("order_id", order.order_id)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const linksQuery = useQuery({
    queryKey: ["order-edit-links", order.supplier_record_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("id, product_id, purchase_unit_id, products(description, code, danea_um), units_of_measure!product_supplier_links_purchase_unit_id_fkey(code)")
        .eq("supplier_record_id", order.supplier_record_id)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((l) => {
        const p = l.products as { description: string | null; code: string | null; danea_um: string | null } | null;
        const u = l.units_of_measure as { code: string | null } | null;
        return { id: l.id, name: p?.description ?? p?.code ?? "Prodotto", unit: u?.code ?? p?.danea_um ?? "" };
      });
    },
  });
  useEffect(() => {
    if (lines === null && itemsQuery.data) {
      setLines(
        itemsQuery.data.map((it) => ({
          key: it.id,
          item_id: it.id,
          link_id: it.product_supplier_link_id ?? undefined,
          name: it.product_name ?? it.product_code ?? "Prodotto",
          unit: it.purchase_unit_code ?? it.unit_code ?? "",
          quantity: it.purchase_quantity != null ? String(it.purchase_quantity) : "",
        })),
      );
    }
  }, [itemsQuery.data, lines]);

  const usedLinks = new Set((lines ?? []).map((l) => l.link_id).filter(Boolean));
  const addable = (linksQuery.data ?? []).filter((l) => !usedLinks.has(l.id));
  const validCount = (lines ?? []).filter((l) => Number(l.quantity.replace(",", ".")) > 0).length;

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("customer_update_order_full", {
        _order_id: order.order_id,
        _delivery_date: (date || null) as string,
        _time_from: (from || null) as string,
        _time_to: (to || null) as string,
        _address: address,
        _notes: notes,
        _items: (lines ?? []).map((l) => ({
          item_id: l.item_id ?? null,
          link_id: l.item_id ? null : l.link_id,
          quantity: l.quantity.replace(",", "."),
        })),
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: async (result) => {
      await onSaved();
      if (result === "annullato") toast.success("Ordine annullato: hai tolto tutti i prodotti");
      else if (result === "invariato") toast.info("Nessuna modifica da salvare");
      else toast.success("Ordine modificato: il fornitore riceve la notifica");
      onClose();
    },
    onError: async (e: Error) => {
      if (e.message.includes("ORDER_LOCKED")) {
        toast.error("L'ordine è stato appena bloccato dal fornitore");
        await onSaved();
        onClose();
        return;
      }
      toast.error(e.message);
    },
  });

  const submit = () => {
    if (validCount === 0) setConfirmEmpty(true);
    else save.mutate();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifica {order.number}</DialogTitle>
      </DialogHeader>
      <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
        <div className="grid gap-1">
          <Label>Prodotti</Label>
          {lines === null ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <Input
                    aria-label={`Quantità ${l.name}`}
                    inputMode="decimal"
                    className="h-8 w-20"
                    value={l.quantity}
                    onChange={(e) => setLines((cur) => (cur ?? []).map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                  />
                  <span className="w-12 text-xs text-muted-foreground">{l.unit}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Togli ${l.name}`}
                    onClick={() => setLines((cur) => (cur ?? []).filter((x) => x.key !== l.key))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {lines.length === 0 ? <li className="px-2 py-2 text-sm text-muted-foreground">Nessun prodotto</li> : null}
            </ul>
          )}
          {addable.length > 0 ? (
            <div className="flex gap-2">
              <Select value={addLink} onValueChange={setAddLink}>
                <SelectTrigger className="h-9 flex-1" aria-label="Prodotto da aggiungere">
                  <SelectValue placeholder="+ Aggiungi prodotto" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} {l.unit ? `(${l.unit})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!addLink}
                onClick={() => {
                  const l = addable.find((x) => x.id === addLink);
                  if (!l) return;
                  setLines((cur) => [...(cur ?? []), { key: `new-${l.id}`, link_id: l.id, name: l.name, unit: l.unit, quantity: "1" }]);
                  setAddLink("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Aggiungi
              </Button>
            </div>
          ) : null}
        </div>
        <div className="grid gap-1">
          <Label>Data consegna</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label>Dalle (HH:mm)</Label>
            <Input type="time" step={60} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Alle (HH:mm)</Label>
            <Input type="time" step={60} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1">
          <Label>Luogo di consegna</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>Note per il fornitore</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Chiudi</Button>
        <Button disabled={save.isPending || lines === null} onClick={submit}>Salva modifiche</Button>
      </DialogFooter>
      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hai tolto tutti i prodotti</AlertDialogTitle>
            <AlertDialogDescription>
              Senza prodotti l'ordine verrà annullato. Resta nello storico come «Annullato» e il fornitore riceve la notifica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, torna indietro</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => save.mutate()}
            >
              Sì, annulla ordine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Pulsante «Chiama il fornitore»: tel: su smartphone, numero + Copia su desktop. */
export function CallSupplierButton({ phone, label = "Chiama il fornitore" }: { phone: string | null | undefined; label?: string }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!phone || !phone.trim()) return null;
  const tel = phone.replace(/[^\d+]/g, "");
  if (isMobile) {
    return (
      <Button size="sm" variant="outline" asChild>
        <a href={`tel:${tel}`}>
          <Phone className="mr-1 h-4 w-4" /> {label}
        </a>
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Phone className="mr-1 h-4 w-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Numero del fornitore</DialogTitle>
          </DialogHeader>
          <p className="text-2xl font-semibold tracking-wide">{phone}</p>
          <DialogFooter>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(phone);
                toast.success("Numero copiato");
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ChangeRequestDialog({
  order,
  onClose,
  onSent,
}: {
  order: OrderOverviewRow | null;
  onClose: () => void;
  onSent: () => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      if (!order) return;
      const { error } = await supabase.rpc("request_order_change", { _order_id: order.order_id, _note: note });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await onSent();
      toast.success("Richiesta inviata al fornitore");
      setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={Boolean(order)} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chiedi modifica {order?.number}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1">
          <Label>Cosa vuoi cambiare?</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. togliere le melanzane, 2 cassette di pomodori in più" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          <Button disabled={send.isPending || !note.trim()} onClick={() => send.mutate()}>Invia richiesta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderCancelDialog({
  order,
  pending,
  onClose,
  onConfirm,
}: {
  order: OrderOverviewRow | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (o: OrderOverviewRow) => void;
}) {
  return (
    <AlertDialog open={Boolean(order)} onOpenChange={(v) => (!v ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annullare l'ordine {order?.number}?</AlertDialogTitle>
          <AlertDialogDescription>
            L'ordine resta nello storico come «Annullato» e il fornitore riceve una notifica.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              if (order) onConfirm(order);
            }}
          >
            Sì, annulla ordine
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
