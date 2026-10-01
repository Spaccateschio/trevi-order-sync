import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { hhmm, useDeliveryPreferences, type DeliveryDay } from "@/lib/delivery-preferences";

const NONE = "__nessuna__";

/** Preferenze di consegna: valori iniziali per le nuove chiusure Lista, mai vincoli. */
export function DeliveryPreferencesForm({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const prefs = useDeliveryPreferences(companyId);
  const [addressId, setAddressId] = useState<string>(NONE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [day, setDay] = useState<DeliveryDay>("oggi");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefs.data) return;
    setAddressId(prefs.data.addressId ?? NONE);
    setFrom(hhmm(prefs.data.timeFrom));
    setTo(hhmm(prefs.data.timeTo));
    setDay(prefs.data.day);
  }, [prefs.data]);

  const save = async () => {
    if (from && to && from >= to) return toast.error("L'orario «dalle» deve precedere «alle»");
    setSaving(true);
    const { error } = await supabase.rpc("manage_company_delivery_preferences", {
      _company_id: companyId,
      _address_id: (addressId === NONE ? null : addressId) as string,
      _time_from: (from || null) as string,
      _time_to: (to || null) as string,
      _day: day,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["delivery-preferences", companyId] });
    toast.success("Preferenze di consegna salvate");
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="font-display text-base font-semibold">Preferenze di consegna</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Valori proposti alla chiusura della Lista: puoi sempre cambiarli per la singola Lista o il singolo ordine.
      </p>
      <div className="mt-4 grid gap-4 sm:max-w-xl">
        <div className="space-y-1">
          <Label>Destinazione predefinita</Label>
          <Select value={addressId} onValueChange={setAddressId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nessuna</SelectItem>
              {(prefs.data?.addresses ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.text || "Indirizzo senza descrizione"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Gli indirizzi si gestiscono in «Dati generali».</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="dp-from">Orario predefinito — dalle</Label>
            <Input id="dp-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dp-to">alle</Label>
            <Input id="dp-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Data predefinita</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={day === "oggi" ? "default" : "outline"} onClick={() => setDay("oggi")}>
              Oggi
            </Button>
            <Button type="button" size="sm" variant={day === "domani" ? "default" : "outline"} onClick={() => setDay("domani")}>
              Domani
            </Button>
          </div>
        </div>
        <div>
          <Button onClick={() => void save()} disabled={saving || !prefs.data}>
            Salva preferenze
          </Button>
        </div>
      </div>
    </section>
  );
}
