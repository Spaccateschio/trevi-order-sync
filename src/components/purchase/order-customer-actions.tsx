import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

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

function EditForm({ order, onClose, onSaved }: { order: OrderOverviewRow; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [date, setDate] = useState(order.delivery_date ?? "");
  const [from, setFrom] = useState(hhmm(order.delivery_time_from));
  const [to, setTo] = useState(hhmm(order.delivery_time_to));
  const [address, setAddress] = useState(order.delivery_address_text ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("customer_update_order", {
        _order_id: order.order_id,
        _delivery_date: (date || null) as string,
        _time_from: (from || null) as string,
        _time_to: (to || null) as string,
        _address: address,
        _notes: notes,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await onSaved();
      toast.success("Ordine modificato: il fornitore riceve la notifica");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifica {order.number}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
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
        <Button disabled={save.isPending} onClick={() => save.mutate()}>Salva modifiche</Button>
      </DialogFooter>
    </>
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
