import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  deliveryHint,
  scheduleSummary,
  type DeliverySchedule,
} from "@/lib/delivery-schedule";

/**
 * Pulsanti on/off per i giorni in cui il fornitore consegna, più il giorno del mese
 * per chi consegna una volta al mese. Solo informativo: non filtra nulla.
 */
export function DeliveryDaysPicker({
  schedule,
  onChange,
  disabled,
  label = "Giorni di consegna",
}: {
  schedule: DeliverySchedule;
  onChange: (next: DeliverySchedule) => void;
  disabled?: boolean;
  label?: string;
}) {
  const toggle = (day: number) => {
    const active = schedule.weekdays.includes(day);
    const weekdays = active
      ? schedule.weekdays.filter((value) => value !== day)
      : [...schedule.weekdays, day].sort((a, b) => a - b);
    onChange({ ...schedule, weekdays });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{scheduleSummary(schedule)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_WEEKDAYS.map((day) => {
          const active = schedule.weekdays.includes(day);
          return (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              disabled={disabled}
              className="h-8 min-w-11 px-2"
              onClick={() => toggle(day)}
            >
              {WEEKDAY_LABELS[day]}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs" htmlFor="delivery-month-day">
          Consegna mensile il giorno
        </Label>
        <Input
          id="delivery-month-day"
          type="number"
          min={1}
          max={31}
          step={1}
          inputMode="numeric"
          className="h-8 w-20"
          placeholder="—"
          disabled={disabled}
          value={schedule.monthDay === null ? "" : String(schedule.monthDay)}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (!raw) {
              onChange({ ...schedule, monthDay: null });
              return;
            }
            const parsed = Number(raw);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return;
            onChange({ ...schedule, monthDay: parsed });
          }}
        />
        <span className="text-xs text-muted-foreground">Facoltativo, per chi consegna una volta al mese.</span>
      </div>
    </div>
  );
}

/** Etichetta informativa (nessun filtro) da mostrare accanto a un fornitore. */
export function DeliveryHintBadge({ schedule }: { schedule: DeliverySchedule }) {
  const hint = deliveryHint(schedule);
  return (
    <Badge variant={hint.tone === "today" ? "secondary" : "outline"} className="shrink-0 font-normal">
      {hint.label}
    </Badge>
  );
}
