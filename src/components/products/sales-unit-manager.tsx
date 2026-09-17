import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { applyProductSaleUnitBatch } from "@/lib/sales-units.functions";

export type CompanyUnit = { id: string; code: string; description: string; status: "attivo" | "disattivato" | "revocato" };
export type ProductSaleUnit = { id: string; product_id: string; unit_id: string; is_active: boolean; is_customer_visible: boolean; is_default: boolean; conversion_factor: number | null; conversion_reference_um: string | null; needs_review: boolean; units_of_measure: { code: string; description: string } | null };

export function SalesUnitManager({ companyId, productId, daneaUm, units, assignments, editable }: { companyId: string; productId: string; daneaUm: string | null; units: CompanyUnit[]; assignments: ProductSaleUnit[]; editable: boolean }) {
  const run = useServerFn(applyProductSaleUnitBatch);
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [factors, setFactors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (input: { unitId: string; operation: "add" | "visible" | "active" | "factor" | "default" | "remove"; booleanValue?: boolean | null; factor?: number | null }) => run({ data: { companyId, productIds: [productId], unitId: input.unitId, operation: input.operation, booleanValue: input.booleanValue ?? null, conversionFactor: input.factor ?? null, overwrite: true } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["product-sale-units", companyId] }); toast.success("U.M. vendita aggiornata"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const available = units.filter((unit) => unit.status === "attivo" && !assignments.some((row) => row.unit_id === unit.id));
  return <section className="border-t border-border pt-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Impostazioni Trevi Fruit</h3><p className="text-xs text-muted-foreground">U.M. vendita · riferimento Danea: {daneaUm ?? "—"}</p></div><Badge variant="secondary">Modificabili</Badge></div>
    <div className="mt-3 space-y-2">
      {assignments.map((row) => <div key={row.id} className="rounded-md border border-border p-3">
        <div className="flex items-center gap-2"><strong className="text-sm">{row.units_of_measure?.code ?? "—"}</strong><span className="text-xs text-muted-foreground">{row.units_of_measure?.description}</span>{row.is_default ? <Badge>Predefinita</Badge> : null}{row.needs_review ? <Badge variant="destructive"><AlertTriangle />Da verificare</Badge> : null}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <label className="flex items-center gap-2"><Switch disabled={!editable || mutation.isPending} checked={row.is_active} onCheckedChange={(value) => mutation.mutate({ unitId: row.unit_id, operation: "active", booleanValue: value })} />Attiva</label>
          <label className="flex items-center gap-2"><Switch disabled={!editable || mutation.isPending} checked={row.is_customer_visible} onCheckedChange={(value) => mutation.mutate({ unitId: row.unit_id, operation: "visible", booleanValue: value })} />Cliente</label>
          <Button variant="outline" size="sm" disabled={!editable || row.is_default || mutation.isPending} onClick={() => mutation.mutate({ unitId: row.unit_id, operation: "default" })}><Check />Predefinita</Button>
          <Button variant="ghost" size="sm" disabled={!editable || mutation.isPending} onClick={() => mutation.mutate({ unitId: row.unit_id, operation: "remove" })}><Trash2 />Rimuovi</Button>
        </div>
        <div className="mt-3 flex items-center gap-2"><span className="shrink-0 text-xs text-muted-foreground">1 {row.units_of_measure?.code} ≈</span><Input aria-label={`Conversione ${row.units_of_measure?.code}`} className="h-8 w-28" inputMode="decimal" disabled={!editable} value={factors[row.id] ?? (row.conversion_factor ?? "")} onChange={(event) => setFactors((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Nessuna"/><span className="text-xs">{daneaUm ?? "U.M. Danea"}</span><Button size="sm" variant="outline" disabled={!editable || mutation.isPending} onClick={() => { const value = factors[row.id] ?? (row.conversion_factor?.toString() ?? ""); mutation.mutate({ unitId: row.unit_id, operation: "factor", factor: value ? Number(value.replace(",", ".")) : null }); }}>Salva stima</Button></div>
      </div>)}
      {!assignments.length ? <p className="py-3 text-sm text-muted-foreground">Nessuna U.M. di vendita configurata.</p> : null}
    </div>
    {editable && available.length ? <div className="mt-3 flex gap-2"><select aria-label="U.M. da aggiungere" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={chosen} onChange={(event) => setChosen(event.target.value)}><option value="">Scegli U.M.</option>{available.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} — {unit.description}</option>)}</select><Button size="sm" disabled={!chosen || mutation.isPending} onClick={() => mutation.mutate({ unitId: chosen, operation: "add" })}><Plus />Aggiungi</Button></div> : null}
  </section>;
}