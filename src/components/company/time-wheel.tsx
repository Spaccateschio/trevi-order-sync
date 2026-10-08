import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Selettore orario compatto a stepper: ore (00–23) e minuti (passi di 5)
 * con pulsanti +/− e frecce della tastiera. Nessuna battitura libera:
 * il valore prodotto è sempre "HH:mm" valido.
 */
export function TimeWheelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = match ? Number(match[1]) : 9;
  const minute = match ? Math.min(55, Math.round(Number(match[2]) / 5) * 5) : 0;

  const setHour = (h: number) => onChange(`${pad2((h + 24) % 24)}:${pad2(minute)}`);
  const setMinute = (m: number) => onChange(`${pad2(hour)}:${pad2((m + 60) % 60)}`);

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Selettore orario">
      <StepperSegment
        label={pad2(hour)}
        ariaLabel="Ore"
        onDecrement={() => setHour(hour - 1)}
        onIncrement={() => setHour(hour + 1)}
        disabled={disabled}
      />
      <span aria-hidden className="select-none text-xl font-bold text-muted-foreground">:</span>
      <StepperSegment
        label={pad2(minute)}
        ariaLabel="Minuti"
        onDecrement={() => setMinute(minute - 5)}
        onIncrement={() => setMinute(minute + 5)}
        disabled={disabled}
      />
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Un segmento (ore o minuti): − valore + in un'unica riga compatta. */
function StepperSegment({
  label,
  ariaLabel,
  onDecrement,
  onIncrement,
  disabled,
}: {
  label: string;
  ariaLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean | undefined;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); onIncrement(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); onDecrement(); }
  };

  return (
    <div
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={Number(label)}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      className={cn(
        "flex items-center overflow-hidden rounded-xl border border-border bg-muted/40 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${ariaLabel}: diminuisci`}
        disabled={disabled}
        onClick={onDecrement}
        className="h-11 w-9 rounded-none border-r border-border"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="flex h-11 w-12 items-center justify-center font-mono text-lg font-bold tabular-nums tracking-tighter text-foreground">
        {label}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${ariaLabel}: aumenta`}
        disabled={disabled}
        onClick={onIncrement}
        className="h-11 w-9 rounded-none border-l border-border"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

