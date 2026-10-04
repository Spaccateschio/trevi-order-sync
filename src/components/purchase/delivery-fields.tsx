import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, formatDateIt, type CompanyAddressOption } from "@/lib/delivery-preferences";

export const MANUAL = "__manuale__";

/** Data rapida: [Oggi] [Domani] [Altra data], sempre con la data reale; nessuna data passata. */
export function DeliveryDatePicker({
  id,
  value,
  today,
  onChange,
}: {
  id: string;
  value: string;
  today: string;
  onChange: (value: string) => void;
}) {
  const tomorrow = addDays(today, 1);
  const other = Boolean(value) && value !== today && value !== tomorrow;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Data consegna</Label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={value === today ? "default" : "outline"} onClick={() => onChange(today)}>
          Oggi — {formatDateIt(today)}
        </Button>
        <Button type="button" size="sm" variant={value === tomorrow ? "default" : "outline"} onClick={() => onChange(tomorrow)}>
          Domani — {formatDateIt(tomorrow)}
        </Button>
        <Input
          id={id}
          type="date"
          min={today}
          className={`h-9 w-44 ${other ? "border-primary" : ""}`}
          aria-label="Altra data"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

/** Luogo: indirizzo aziendale registrato oppure testo manuale valido solo per questa Lista/ordine. */
export function DeliveryPlacePicker({
  addresses,
  addressId,
  text,
  onChange,
}: {
  addresses: CompanyAddressOption[];
  addressId: string | null;
  text: string;
  onChange: (next: { addressId: string | null; text: string }) => void;
}) {
  const selected = addressId ?? MANUAL;
  return (
    <div className="space-y-1">
      <Label>Consegna presso</Label>
      <Select
        value={selected}
        onValueChange={(v) => {
          if (v === MANUAL) onChange({ addressId: null, text: "" });
          else onChange({ addressId: v, text: addresses.find((a) => a.id === v)?.text ?? "" });
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {addresses.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.text || "Indirizzo senza descrizione"}
            </SelectItem>
          ))}
          <SelectItem value={MANUAL}>Scrivi un luogo per questo ordine…</SelectItem>
        </SelectContent>
      </Select>
      {selected === MANUAL ? (
        <Input
          placeholder="Es. Banco Via del Lavatore"
          value={text}
          onChange={(e) => onChange({ addressId: null, text: e.target.value })}
        />
      ) : null}
    </div>
  );
}

/** Normalizza un orario scritto a mano: «10» → «10:00», «8:30» → «08:30», «830» → «08:30». Vuoto → "", non valido → null. */
export function normalizeTime(raw: string): string | null {
  const v = raw.trim().replace(/[.,]/g, ":");
  if (!v) return "";
  let h: number;
  let m: number;
  const parts = v.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (parts) {
    h = Number(parts[1]);
    m = parts[2] === undefined ? 0 : Number(parts[2]);
    if (parts[2] !== undefined && parts[2].length === 1) m = m * 10;
  } else if (/^\d{3,4}$/.test(v)) {
    h = Number(v.slice(0, v.length - 2));
    m = Number(v.slice(-2));
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Orario sempre in formato italiano 24 ore (HH:mm), senza AM/PM; si completa uscendo dal campo. */
export function TimeInput24({
  value,
  onChange,
  onBlur,
  ...rest
}: { value: string; onChange: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const valid = normalizeTime(value) !== null;
  return (
    <div className="space-y-0.5">
      <Input
        {...rest}
        type="text"
        inputMode="numeric"
        placeholder="HH:mm"
        maxLength={5}
        value={value}
        aria-invalid={!valid}
        onChange={(e) => onChange(e.target.value.replace(/[^\d:.,]/g, ""))}
        onBlur={(e) => {
          const n = normalizeTime(value);
          if (n !== null && n !== value) onChange(n);
          onBlur?.(e);
        }}
      />
      {!valid ? <p className="text-[11px] text-destructive">Inserisci un orario valido</p> : null}
    </div>
  );
}
