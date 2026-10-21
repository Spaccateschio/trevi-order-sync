import type { ReactNode } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared purchase controls only: no inventory writes or unit conversions. */
export function ShoppingQuantityEditor({ input, quick, details, editable, locked = false, busy = false, ready, name, onConfirm }: {
  input: ReactNode; quick?: ReactNode; details?: ReactNode;
  editable: boolean; locked?: boolean; busy?: boolean; ready: boolean;
  name: string; onConfirm: () => void;
}) {
  return <div className="min-w-0 space-y-1.5 max-md:space-y-1">
    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Quantità da acquistare</p>
    {input}
    {details}
    {editable ? <Button type="button" size="sm" variant={locked ? "secondary" : "default"}
      className="h-9 max-md:h-8 w-full gap-1 text-xs" disabled={busy || (!locked && !ready)}
      aria-label={locked ? `Sblocca quantità di ${name}` : `Conferma quantità di ${name}`}
      title={locked ? "Modifica quantità" : "Conferma quantità"} onClick={onConfirm}>
      {locked ? <Pencil className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
      {busy ? "Salvataggio…" : locked ? "Modifica" : "Conferma"}
    </Button> : null}
    {quick}
  </div>;
}