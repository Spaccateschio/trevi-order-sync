import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeliveryDatePicker, DeliveryPlacePicker } from "./delivery-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deliveryDateLabel, hhmm, localToday, timeRangeLabel, useDeliveryPreferences } from "@/lib/delivery-preferences";
import type { OrderOverviewRow } from "@/lib/purchase";
import { setPurchaseOrderDelivery } from "@/lib/purchase.functions";

/** FORNITORE · CONSEGNA · NOTE: ciò che verrà comunicato. Modificabile solo finché l'ordine è DA INVIARE. */
export function OrderDeliverySection({ order, companyId }: { order: OrderOverviewRow; companyId: string }) {
  const queryClient = useQueryClient();
  const run = useServerFn(setPurchaseOrderDelivery);
  const prefs = useDeliveryPreferences(companyId);
  const today = localToday(prefs.data?.timezone ?? "Europe/Rome");
  const editable = order.status === "bozza" && order.send_status === "da_inviare";

  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [place, setPlace] = useState<{ addressId: string | null; text: string }>({ addressId: null, text: "" });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDate(order.delivery_date ?? "");
    setFrom(hhmm(order.delivery_time_from));
    setTo(hhmm(order.delivery_time_to));
    setPlace({ addressId: order.delivery_address_id, text: order.delivery_address_text ?? "" });
    setNotes(order.supplier_notes ?? "");
    setEditing(true);
  };

  const save = async () => {
    if (from && to && from >= to) return toast.error("L'orario «dalle» deve precedere «alle»");
    if (date && date < today) return toast.error("La data di consegna non può essere passata");
    setSaving(true);
    try {
      await run({
        data: {
          orderId: order.order_id,
          date: date || null,
          timeFrom: from || null,
          timeTo: to || null,
          addressId: place.addressId,
          addressText: place.text.trim() || null,
          supplierNotes: notes.trim() || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
      toast.success("Consegna e note dell'ordine aggiornate");
      setEditing(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fornitore</p>
        <p className="mt-1 text-base font-semibold">{order.supplier_name}</p>
      </div>
      {editing ? (
        <div className="space-y-3 sm:col-span-3">
          <DeliveryDatePicker id={`od-date-${order.order_id}`} value={date} today={today} onChange={setDate} />
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            <div>
              <Label htmlFor="od-from">Dalle</Label>
              <Input id="od-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="od-to">Alle</Label>
              <Input id="od-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <DeliveryPlacePicker
            addresses={prefs.data?.addresses ?? []}
            addressId={place.addressId}
            text={place.text}
            onChange={setPlace}
          />
          <div>
            <Label htmlFor="od-notes">Note per il fornitore</Label>
            <Textarea id="od-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Cambia solo questo ordine: la Lista {order.shopping_list_number ?? ""} resta com'era alla chiusura.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null} Salva
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consegna</p>
            <p className="mt-1 font-semibold">{deliveryDateLabel(order.delivery_date, today)}</p>
            <p className="font-semibold">
              {order.delivery_time_from && order.delivery_time_to
                ? `Dalle ${hhmm(order.delivery_time_from)} alle ${hhmm(order.delivery_time_to)}`
                : timeRangeLabel(order.delivery_time_from, order.delivery_time_to)}
            </p>
            <p>{order.delivery_address_text || "Luogo non indicato"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
            <p className="mt-1 whitespace-pre-wrap">{order.supplier_notes || "Nessuna nota per il fornitore."}</p>
            {editable ? (
              <Button size="sm" variant="outline" className="mt-2" onClick={startEdit}>
                <Pencil className="mr-1 size-4" /> Modifica consegna e note
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Ordine inviato: dati in sola lettura.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
