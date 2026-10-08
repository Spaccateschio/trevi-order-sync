import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { hhmm, useDeliveryPreferences, type DeliveryDay } from "@/lib/delivery-preferences";
import { TimeWheelPicker } from "@/components/company/time-wheel";

const NONE = "__nessuna__";

/** Preferenze di consegna: valori iniziali per le nuove chiusure Lista, mai vincoli. */
export function DeliveryPreferencesForm({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const prefs = useDeliveryPreferences(companyId);
  const [addressId, setAddressId] = useState<string>(NONE);
  const [from, setFrom] = useState("");
  const [windowHours, setWindowHours] = useState<2 | 3 | 4>(4);
  const [day, setDay] = useState<DeliveryDay>("oggi");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!prefs.data) return;
    setAddressId(prefs.data.addressId ?? NONE);
    setFrom(hhmm(prefs.data.timeFrom));
    setWindowHours(prefs.data.windowHours);
    setDay(prefs.data.day);
    // Bloccata se esistono valori salvati; si sblocca con la matita.
    setLocked(Boolean(prefs.data.addressId || prefs.data.timeFrom));
  }, [prefs.data]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("manage_company_delivery_preferences", {
      _company_id: companyId,
      _address_id: (addressId === NONE ? null : addressId) as string,
      _time_from: (from || null) as string,
      _window_hours: windowHours,
      _day: day,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["delivery-preferences", companyId] });
    setLocked(true);
    toast.success("Preferenze di consegna salvate");
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold">Preferenze di consegna</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Valori proposti alla chiusura della Lista: puoi sempre cambiarli per la singola Lista o il singolo ordine.
          </p>
        </div>
        {locked && (
          <Button type="button" size="sm" variant="outline" onClick={() => setLocked(false)}>
            <Pencil className="mr-1 h-4 w-4" />
            Modifica
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:max-w-xl">
        <div className="space-y-1">
          <Label>Destinazione predefinita</Label>
          <Select value={addressId} onValueChange={setAddressId} disabled={locked}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
...
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeWheelField label="Orario predefinito — inizio consegna" value={from} onChange={setFrom} disabled={locked} />
          <div className="space-y-1">
            <Label>Durata fascia</Label>
            <div className="flex gap-2">
              {([2, 3, 4] as const).map((h) => (
                <Button key={h} type="button" size="sm" variant={windowHours === h ? "default" : "outline"} disabled={locked} onClick={() => setWindowHours(h)}>
                  {h} ore
                </Button>
              ))}
            </div>
            {from && (
              <p className="text-xs text-muted-foreground">
                Fascia consegnata al cliente: {from} – {addHours(from, windowHours)}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Data predefinita</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={day === "oggi" ? "default" : "outline"} disabled={locked} onClick={() => setDay("oggi")}>
              Oggi
            </Button>
            <Button type="button" size="sm" variant={day === "domani" ? "default" : "outline"} disabled={locked} onClick={() => setDay("domani")}>
              Domani
            </Button>
          </div>
        </div>
        {!locked && (
          <div>
            <Button onClick={() => void save()} disabled={saving || !prefs.data}>
              Salva preferenze
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Orario opzionale con rotella: vuoto = nessun orario predefinito.
 * La rotella compare solo quando l'orario è impostato; «Rimuovi» lo svuota.
 */
function TimeWheelField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <TimeWheelPicker value={value} onChange={onChange} disabled={disabled} />
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange("")}>
            Rimuovi
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Nessun orario</span>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange("09:00")}>
            Imposta
          </Button>
        </div>
      )}
    </div>
  );
}

/** Inizio + durata in ore, con ritorno a mezzanotte (es. 22:00 + 4h → 02:00). */
function addHours(hhmmValue: string, hours: number): string {
  const [h = 0, m = 0] = hhmmValue.split(":").map(Number);
  const end = (h + hours) % 24;
  return `${String(end).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
