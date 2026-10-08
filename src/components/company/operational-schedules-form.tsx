import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TimeWheelPicker } from "@/components/company/time-wheel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { hhmm } from "@/lib/delivery-preferences";

const DAYS = [
  ["monday", "Lun"],
  ["tuesday", "Mar"],
  ["wednesday", "Mer"],
  ["thursday", "Gio"],
  ["friday", "Ven"],
  ["saturday", "Sab"],
  ["sunday", "Dom"],
] as const;
type DayKey = (typeof DAYS)[number][0];
type Days = Record<DayKey, boolean>;
const NO_DAYS: Days = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };

/** Promemoria operativi: salva solo la regola aziendale, non crea liste né notifiche. */
export function OperationalSchedulesForm({ companyId, isAdmin }: { companyId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const key = ["operational-schedule", companyId, "shopping_list"];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_operational_schedules")
        .select("*")
        .eq("company_id", companyId)
        .eq("schedule_type", "shopping_list")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const [days, setDays] = useState<Days>(NO_DAYS);
  const [time, setTime] = useState("09:00");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = query.data;
    if (!d) return;
    setDays({ monday: d.monday, tuesday: d.tuesday, wednesday: d.wednesday, thursday: d.thursday, friday: d.friday, saturday: d.saturday, sunday: d.sunday });
    setTime(hhmm(d.reminder_time) || "09:00");
    setEnabled(d.enabled);
  }, [query.data]);

  const save = async () => {
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (enabled && !Object.values(days).some(Boolean)) { toast.error("Seleziona almeno un giorno"); return; }
    if (enabled && !validTime) { toast.error("Indica un orario valido"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("manage_company_operational_schedule", {
      _company_id: companyId,
      _schedule_type: "shopping_list",
      _monday: days.monday, _tuesday: days.tuesday, _wednesday: days.wednesday, _thursday: days.thursday,
      _friday: days.friday, _saturday: days.saturday, _sunday: days.sunday,
      _reminder_time: (validTime ? time : null) as string,
      _enabled: enabled,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: key });
    toast.success("Promemoria salvato");
  };

  const disabled = !isAdmin || saving || query.isLoading;

  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="font-display text-base font-semibold">Promemoria operativi</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Imposta i giorni e l'ora in cui vuoi ricevere un promemoria per iniziare la Lista della Spesa.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full text-sm font-medium lg:w-auto">Preparazione Lista della Spesa</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {DAYS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={days[k]}
                disabled={disabled}
                onCheckedChange={(v) => setDays((p) => ({ ...p, [k]: v === true }))}
              />
              {label}
            </label>
          ))}
        </div>
        <div>
          <Label className="text-xs">Ora promemoria</Label>
          <div className="mt-1">
            <TimeWheelPicker value={time} onChange={setTime} disabled={disabled} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} />
          Attivo
        </label>
        {isAdmin ? (
          <Button onClick={() => void save()} disabled={disabled}>Salva promemoria</Button>
        ) : null}
      </div>
    </section>
  );
}
