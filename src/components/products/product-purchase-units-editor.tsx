import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Star, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { allowedPurchaseUnits, productPurchaseUnitsOptions } from "@/lib/product-purchase-units";
import { saveProductPurchaseUnits } from "@/lib/product-purchase-units.functions";
import type { CompanyUnit } from "./sales-unit-manager";

export function ProductPurchaseUnitsEditor({ companyId, productId, units, editable }: { companyId: string; productId: string; units: CompanyUnit[]; editable: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery(productPurchaseUnitsOptions(companyId, productId));
  const save = useServerFn(saveProductPurchaseUnits);
  const [draft, setDraft] = useState<{ ids: string[]; defaultId: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const available = allowedPurchaseUnits(units, companyId);
  const value = draft ?? { ids: (query.data ?? []).map((u) => u.unit_id), defaultId: query.data?.find((u) => u.is_default)?.unit_id ?? null };
  const mutation = useMutation({
    mutationFn: () => save({ data: { productId, unitIds: value.ids, defaultUnitId: value.defaultId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-purchase-units", companyId, productId] });
      await queryClient.invalidateQueries({ queryKey: ["product-purchase-units", companyId, "all"] });
      setDraft(null);
      toast.success("U.M. di acquisto salvate");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = mutation.isPending || query.isPending;
  return <section className="space-y-2" aria-label="U.M. proprie del prodotto">
    {query.isError ? <p role="alert" className="text-xs text-destructive">{query.error.message}</p> : null}
    <div className="flex flex-wrap gap-2">
      {value.ids.map((id) => {
        const unit = units.find((u) => u.id === id);
        return <div key={id} className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
          <span className="text-sm">{unit?.code ?? "U.M. non disponibile"}</span>
          <Button type="button" size="icon" variant="ghost" className="size-7" disabled={!editable || busy} aria-label={`Predefinita ${unit?.code ?? "U.M."}`} aria-pressed={value.defaultId === id} title="U.M. predefinita" onClick={() => setDraft({ ...value, defaultId: value.defaultId === id ? null : id })}><Star className={value.defaultId === id ? "fill-primary text-primary" : "text-muted-foreground"} /></Button>
          {editable ? <Button type="button" size="icon" variant="ghost" className="size-7" disabled={busy} aria-label={`Rimuovi ${unit?.code ?? "U.M."} dalle U.M. del prodotto`} onClick={() => setDraft({ ids: value.ids.filter((u) => u !== id), defaultId: value.defaultId === id ? null : value.defaultId })}><X /></Button> : null}
        </div>;
      })}
      {editable ? <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" size="icon" variant="outline" disabled={busy || query.isError} aria-label="Aggiungi U.M. di acquisto del prodotto"><Plus /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-2"><div className="max-h-64 overflow-y-auto">
        {available.filter((u) => !value.ids.includes(u.id)).map((u) => <Button key={u.id} type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { setDraft({ ...value, ids: [...value.ids, u.id] }); setOpen(false); }}>{u.code} — {u.description}</Button>)}
      </div></PopoverContent></Popover> : null}
      {!value.ids.length ? <span className="self-center text-xs text-muted-foreground">Nessuna U.M. impostata</span> : null}
    </div>
    {editable ? <div className="flex justify-end"><Button type="button" size="sm" disabled={busy || query.isError || !draft} onClick={() => mutation.mutate()}><Save />{mutation.isPending ? "Salvataggio…" : "Salva U.M. di acquisto"}</Button></div> : null}
  </section>;
}