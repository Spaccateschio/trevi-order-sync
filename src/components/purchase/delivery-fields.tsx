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

/** Orario sempre in formato italiano 24 ore (HH:mm), senza AM/PM. */
export function TimeInput24({
  value,
  onChange,
  ...rest
}: { value: string; onChange: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const format = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  };
  const valid = !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      placeholder="HH:mm"
      maxLength={5}
      value={value}
      aria-invalid={!valid}
      onChange={(e) => onChange(format(e.target.value))}
    />
  );
}
