import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogSaleUnit } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/**
 * Selettore dell'unità di misura proposta all'acquirente.
 * Ogni scelta viene salvata come preferenza (sticky) dal chiamante.
 */
export function UnitPicker({
  units,
  value,
  onChange,
  fallbackLabel,
  className,
}: {
  units: CatalogSaleUnit[];
  value: string | null;
  onChange: (productSaleUnitId: string) => void;
  fallbackLabel?: string | null;
  className?: string;
}) {
  if (!units.length) {
    return (
      <span className="text-sm text-muted-foreground">{fallbackLabel ?? "Non indicata"}</span>
    );
  }

  if (units.length === 1) {
    const unit = units[0]!;
    return (
      <span className="text-sm">{unit.units_of_measure?.code ?? fallbackLabel ?? "—"}</span>
    );
  }

  return (
    <Select {...(value ? { value } : {})} onValueChange={onChange}>
      <SelectTrigger
        className={cn("h-8 w-full min-w-24 text-sm", className)}
        onClick={(event) => event.stopPropagation()}
        aria-label="Unità di misura"
      >
        <SelectValue placeholder="U.M." />
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit.id} value={unit.id}>
            {unit.units_of_measure?.code ?? "—"}
            {unit.is_default ? " · predefinita" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
