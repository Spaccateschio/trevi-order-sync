import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Selettore orario a rotella: due colonne (ore e minuti, passi di 5) scorrevoli
 * con tocco, rotella del mouse, trascinamento e frecce della tastiera.
 * Nessuna battitura libera: il valore prodotto è sempre "HH:mm" valido.
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
  const norm = `${pad2(hour)}:${pad2(minute)}`;

  // Allinea il valore al passo di 5 minuti (es. 09:37 salvato in precedenza → 09:35).
  useEffect(() => {
    if (value !== norm) onChange(norm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setHour = (h: number) => onChange(`${pad2(h)}:${pad2(minute)}`);
  const setMinute = (m: number) => onChange(`${pad2(hour)}:${pad2(m)}`);


  return (
    <div className="flex items-center gap-1" role="group" aria-label="Ora promemoria">
      <WheelColumn
        count={24}
        value={hour}
        onChange={setHour}
        disabled={disabled}
        ariaLabel="Ore"
      />
      <span aria-hidden className="select-none pb-0.5 text-lg font-semibold text-foreground">:</span>
      <WheelColumn
        count={12}
        value={minute}
        onChange={setMinute}
        disabled={disabled}
        ariaLabel="Minuti"
        display={(i) => pad2(i * 5)}
      />

    </div>
  );
}

const ITEM_H = 36; // px per riga
const SLOTS = 5; // righe visibili (2 sopra, selezione, 2 sotto)
const CENTER = (SLOTS - 1) / 2;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Una colonna della rotella: strip di righe traslata sotto il centro.
 * Il tocco/il trascinamento sposta la strip, il valore scelto è la riga più vicina al centro.
 */
function WheelColumn({
  count,
  value,
  onChange,
  disabled,
  ariaLabel,
  display,
}: {
  count: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean | undefined;
  ariaLabel: string;
  display?: ((i: number) => string) | undefined;

}) {

  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; moved: boolean } | null>(null);
  const accRef = useRef(0);
  const [delta, setDelta] = useState(0);

  const clamp = (v: number) => Math.max(0, Math.min(count - 1, v));
  const label = (i: number) => (display ? display(i) : pad2(i));

  // Rotella del mouse: listener non passivo per bloccare lo scorrimento della pagina.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      accRef.current += e.deltaY;
      const steps = Math.trunc(accRef.current / ITEM_H);
      if (steps !== 0) {
        accRef.current -= steps * ITEM_H;
        onChange(clamp(value + steps));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [value, onChange, disabled, count]);

  const onPointerDown = (e: React.PointerEvent) => {
    stripRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dy) > 3) dragRef.current.moved = true;
    setDelta(dy);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDelta(0);
    if (!drag || disabled) return;
    if (drag.moved) {
      // Fine trascinamento: valore = riga più vicina al centro.
      onChange(clamp(value - Math.round((e.clientY - drag.y) / ITEM_H)));
      return;
    }
    // Tocco/click semplice: seleziona la riga toccata (slot calcolato sul contenitore,
    // non sulla strip traslata).
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect) return;
    const slot = Math.floor((e.clientY - rect.top) / ITEM_H);
    onChange(clamp(value + (slot - CENTER)));
  };


  const onKeyDownHandler = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowUp") { e.preventDefault(); onChange(clamp(value - 1)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(value + 1)); }
    else if (e.key === "Home") { e.preventDefault(); onChange(0); }
    else if (e.key === "End") { e.preventDefault(); onChange(count - 1); }
  };


  const offset = (CENTER - value) * ITEM_H + delta;

  return (
    <div
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={Number(label(value))}
      aria-valuemin={0}
      aria-valuemax={Number(label(count - 1))}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        "relative h-[180px] w-14 select-none overflow-hidden rounded-md border border-border bg-muted/40 text-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "pointer-events-none opacity-60",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDownHandler}
    >
      <div
        ref={stripRef}
        className="absolute inset-x-0 top-0 will-change-transform"
        style={{ transform: `translateY(${offset}px)` }}
      >
        {Array.from({ length: count }, (_, i) => {
          const d = i - value;
          const dist = Math.abs(d);
          return (
            <div
              key={i}
              aria-hidden
              className={cn(
                "flex h-9 items-center justify-center font-mono tabular-nums",
                dist === 0 && "text-base font-semibold text-foreground",
                dist > 0 && "text-muted-foreground",
              )}
              style={{ opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : dist === 2 ? 0.25 : 0 }}
            >
              {label(i)}
            </div>
          );
        })}
      </div>
      {/* Fascia di selezione e dissolvenze ai bordi */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 rounded-sm bg-accent/50"
        style={{ top: CENTER * ITEM_H, height: ITEM_H }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-card to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-card to-transparent" />
    </div>
  );
}
