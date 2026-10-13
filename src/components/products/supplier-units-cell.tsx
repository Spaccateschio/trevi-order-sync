import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NOT_CONFIGURED, sortSuppliers, type PurchaseSupplier } from "@/lib/products-view";

/** Sintesi + dettaglio per fornitore delle U.M. di acquisto: sola lettura, dati dal database. */
export function SupplierUnitsCell({ suppliers }: { suppliers: PurchaseSupplier[] }) {
  if (!suppliers.length) return <span className="text-muted-foreground">—</span>;
  const ordered = sortSuppliers(suppliers);
  const first = ordered[0]!;
  const firstText = first.units.length ? first.units.map((u) => u.code).join(", ") : NOT_CONFIGURED;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-1 text-left hover:underline"
          onClick={(event) => event.stopPropagation()}
          aria-label="Dettaglio U.M. acquisto per fornitore"
        >
          <span className="truncate">
            {first.name}: <span className={first.units.length ? "font-semibold" : "text-muted-foreground"}>{firstText}</span>
          </span>
          {ordered.length > 1 ? <Badge variant="secondary" className="shrink-0 px-1 text-[10px]">+{ordered.length - 1}</Badge> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2" onClick={(event) => event.stopPropagation()}>
        <p className="mb-1 px-1 text-xs font-semibold text-muted-foreground">U.M. acquisto per fornitore</p>
        <SupplierUnitsList suppliers={ordered} />
      </PopoverContent>
    </Popover>
  );
}

export function SupplierUnitsList({ suppliers }: { suppliers: PurchaseSupplier[] }) {
  return (
    <ul className="divide-y divide-border text-xs">
      {suppliers.map((supplier) => (
        <li key={supplier.linkId} className="space-y-0.5 px-1 py-1.5">
          <div className="flex items-center gap-1.5">
            {supplier.isPreferred ? <Star className="size-3 shrink-0 fill-primary text-primary" aria-label="Fornitore preferito" /> : null}
            <span className="truncate font-medium">{supplier.name}</span>
            <Badge variant="outline" className="ml-auto shrink-0 px-1 text-[10px]">{supplier.isB2b ? "B2B" : "Esterno"}</Badge>
          </div>
          <p>
            {supplier.units.length
              ? supplier.units.map((unit) => `${unit.code}${unit.is_default ? " (predefinita)" : ""}`).join(", ")
              : <span className="text-muted-foreground">{NOT_CONFIGURED}</span>}
          </p>
          {!supplier.purchasable ? <p className="text-destructive">Non acquistabile ora</p> : null}
        </li>
      ))}
    </ul>
  );
}
