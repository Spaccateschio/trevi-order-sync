import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { applyProductSaleUnitBatch } from "@/lib/sales-units.functions";

export type CompanyUnit = { id: string; code: string; description: string; status: "attivo" | "disattivato" | "revocato"; usage?: "acquisto" | "vendita" | "entrambi" };
export type ProductSaleUnit = { id: string; product_id: string; unit_id: string; is_active: boolean; is_customer_visible: boolean; is_default: boolean; conversion_factor: number | null; conversion_reference_um: string | null; conversion_type: "esatta" | "indicativa"; needs_review: boolean; units_of_measure: { code: string; description: string } | null };

/**
 * Panoramica in sola lettura delle U.M. con cui il prodotto si acquista:
 * arrivano dalle referenze fornitore, non sono modificabili da qui (★ = predefinita).
 */
export function PurchaseUnitsOverview({ productId }: { productId: string }) {
  const purchaseQuery = useQuery({
    queryKey: ["product-supplier-links", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_supplier_overview", { _product_id: productId });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as { supplier_name: string; is_active: boolean; purchase_units: { code: string; is_default: boolean; is_active: boolean }[] | null }[];
    },
  });
  const purchaseRows = (purchaseQuery.data ?? []).filter((row) => row.is_active);
  if (!purchaseRows.length) return <p className="mt-1 text-sm text-muted-foreground">Nessuna U.M. di acquisto</p>;
  return <ul className="mt-1 space-y-1 text-sm">
    {purchaseRows.map((row, index) => {
      const codes = (row.purchase_units ?? []).filter((unit) => unit.is_active);
      return <li key={`${row.supplier_name}-${index}`} className="min-w-0">
        <span className="font-medium">{codes.length ? codes.map((unit) => `${unit.code}${unit.is_default ? " ★" : ""}`).join(" · ") : "—"}</span>
        <span className="ml-1 text-muted-foreground">{row.supplier_name}</span>
      </li>;
    })}
  </ul>;
}


export function SalesUnitManager({ companyId, productId, daneaUm, units, assignments, editable, showPurchase = true }: { companyId: string; productId: string; daneaUm: string | null; units: CompanyUnit[]; assignments: ProductSaleUnit[]; editable: boolean; /** Nella scheda a tab le U.M. d'acquisto vivono nel tab Acquisto. */ showPurchase?: boolean }) {
  const run = useServerFn(applyProductSaleUnitBatch);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProductSaleUnit | null>(null);
  const [offerDeactivation, setOfferDeactivation] = useState(false);
  const [draft, setDraft] = useState<{ active: boolean; visible: boolean; isDefault: boolean; factor: string; conversionType: "esatta" | "indicativa" }>({ active: true, visible: true, isDefault: false, factor: "", conversionType: "indicativa" });

  const selected = useMemo(() => assignments.find((row) => row.id === selectedId) ?? null, [assignments, selectedId]);
  useEffect(() => {
    if (!selected) return;
    setDraft({
      active: selected.is_active,
      visible: selected.is_customer_visible,
      isDefault: selected.is_default,
      factor: selected.conversion_factor?.toString() ?? "",
      conversionType: selected.conversion_type,
    });
  }, [selected]);

  const mutation = useMutation({
    mutationFn: (input: { unitId: string; operation: "add" | "visible" | "active" | "factor" | "default" | "remove"; booleanValue?: boolean | null; factor?: number | null }) => run({ data: { companyId, productIds: [productId], unitId: input.unitId, operation: input.operation, booleanValue: input.booleanValue ?? null, conversionFactor: input.factor ?? null, overwrite: true } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["product-sale-units", companyId] }); toast.success("U.M. vendita aggiornata"); },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const normalizedFactor = draft.factor.trim().replace(",", ".");
      const factor = normalizedFactor ? Number(normalizedFactor) : null;
      if (factor !== null && (!Number.isFinite(factor) || factor <= 0)) throw new Error("La conversione deve essere maggiore di zero");
      if (draft.active !== selected.is_active) await run({ data: { companyId, productIds: [productId], unitId: selected.unit_id, operation: "active", booleanValue: draft.active, conversionFactor: null, overwrite: true } });
      if (draft.visible !== selected.is_customer_visible) await run({ data: { companyId, productIds: [productId], unitId: selected.unit_id, operation: "visible", booleanValue: draft.visible, conversionFactor: null, overwrite: true } });
      if (draft.isDefault && !selected.is_default) await run({ data: { companyId, productIds: [productId], unitId: selected.unit_id, operation: "default", booleanValue: null, conversionFactor: null, overwrite: true } });
      if (factor !== selected.conversion_factor || selected.needs_review) await run({ data: { companyId, productIds: [productId], unitId: selected.unit_id, operation: "factor", booleanValue: null, conversionFactor: factor, overwrite: true } });
      if (draft.conversionType !== selected.conversion_type) await run({ data: { companyId, productIds: [productId], unitId: selected.unit_id, operation: "conversion_type", booleanValue: null, conversionFactor: null, conversionType: draft.conversionType, overwrite: true } });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["product-sale-units", companyId] }); toast.success("Configurazione U.M. salvata"); },
    onError: (error: Error) => toast.error(error.message),
  });

  // Solo le U.M. dell'anagrafica destinate alla vendita (o a entrambi gli usi).
  const available = units.filter((unit) => unit.status === "attivo" && (unit.usage ?? "entrambi") !== "acquisto" && !assignments.some((row) => row.unit_id === unit.id));

  const busy = mutation.isPending || saveMutation.isPending;

  // Sola lettura: le U.M. con cui il prodotto si acquista arrivano dalle referenze fornitore.


  const requestRemoval = (row: ProductSaleUnit) => {
    setOfferDeactivation(row.is_default);
    setRemoveTarget(row);
  };

  const confirmRemoval = async () => {
    if (!removeTarget) return;
    const operation = offerDeactivation ? "active" : "remove";
    const result = await mutation.mutateAsync({ unitId: removeTarget.unit_id, operation, ...(operation === "active" ? { booleanValue: false } : {}) });
    if (operation === "remove" && result.changed === 0) {
      setOfferDeactivation(true);
      return;
    }
    setSelectedId(null);
    setRemoveTarget(null);
    setOfferDeactivation(false);
  };

  return <section aria-labelledby="sale-units-title">
    <div className="flex items-center justify-between gap-2">
      <h3 id="sale-units-title" className="text-sm font-semibold">{showPurchase ? "U.M. del prodotto" : "U.M. ordinabili"}</h3>
      {showPurchase ? <Badge variant="secondary" className="shrink-0">{editable ? "Vendita modificabile" : "Sola lettura"}</Badge> : null}
    </div>

    <div className={showPurchase ? "mt-2 grid gap-3 sm:grid-cols-2" : "mt-2"}>
      {showPurchase ? <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-muted-foreground">Acquisto</p>
        <PurchaseUnitsOverview productId={productId} />
      </div> : null}

      <div className="min-w-0">
        {showPurchase ? <p className="text-xs font-medium uppercase text-muted-foreground">Vendita</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2" aria-label="U.M. vendita associate">
      {assignments.map((row) => {
        const code = row.units_of_measure?.code ?? "—";
        const isSelected = selectedId === row.id;
        return <Button
          key={row.id}
          type="button"
          size="sm"
          variant={isSelected ? "default" : "outline"}
          aria-pressed={isSelected}
          aria-label={`${code}${row.is_default ? ", predefinita" : ""}${row.needs_review ? ", da verificare" : ""}`}
          onClick={() => setSelectedId(isSelected ? null : row.id)}
        >
          {code}{row.is_default ? <Star className="fill-current" aria-hidden="true" /> : null}{row.needs_review ? <AlertTriangle aria-hidden="true" /> : null}
        </Button>;
      })}
      {editable && available.length ? <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild><Button type="button" size="icon" variant="outline" aria-label="Aggiungi U.M. vendita"><Plus /></Button></PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Aggiungi U.M. vendita</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {available.map((unit) => <Button key={unit.id} type="button" variant="ghost" className="h-auto w-full justify-start py-2 text-left" disabled={busy} onClick={async () => { await mutation.mutateAsync({ unitId: unit.id, operation: "add" }); setAddOpen(false); }}><span><strong>{unit.code}</strong><span className="ml-2 text-muted-foreground">{unit.description}</span></span></Button>)}
          </div>
        </PopoverContent>
      </Popover> : null}
      {!assignments.length && !available.length ? <p className="text-sm text-muted-foreground">Nessuna U.M. disponibile.</p> : null}
      {!assignments.length && available.length ? <p className="text-sm text-muted-foreground">Aggiungi la prima U.M. con +.</p> : null}
        </div>
      </div>
    </div>

    {selected ? <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{selected.units_of_measure?.code ?? "—"} — {selected.units_of_measure?.description ?? ""}</strong>{selected.needs_review ? <Badge variant="destructive"><AlertTriangle />U.M. Danea cambiata: verifica la stima</Badge> : null}</div>
      <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <label className="flex min-h-9 items-center justify-between gap-3 sm:justify-start"><Switch disabled={!editable || busy} checked={draft.active} onCheckedChange={(active) => setDraft((current) => ({ ...current, active, isDefault: active ? current.isDefault : false }))} />Attiva</label>
        <label className="flex min-h-9 items-center justify-between gap-3 sm:justify-start"><Switch disabled={!editable || busy} checked={draft.visible} onCheckedChange={(visible) => setDraft((current) => ({ ...current, visible, isDefault: visible ? current.isDefault : false }))} />Visibile cliente</label>
        <label className="flex min-h-9 items-center justify-between gap-3 sm:justify-start"><Switch disabled={!editable || busy || selected.is_default} checked={draft.isDefault} onCheckedChange={(isDefault) => setDraft((current) => ({ ...current, isDefault, active: isDefault ? true : current.active, visible: isDefault ? true : current.visible }))} />Predefinita</label>
      </div>
      <div className="mt-4 grid grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)] items-center gap-2"><span className="text-sm">1 {selected.units_of_measure?.code ?? "U.M."} {draft.conversionType === "esatta" ? "=" : "≈"}</span><Input aria-label={`Conversione ${selected.units_of_measure?.code ?? "U.M."}`} inputMode="decimal" disabled={!editable || busy} value={draft.factor} onChange={(event) => setDraft((current) => ({ ...current, factor: event.target.value }))} placeholder="Nessuna"/><span className="truncate text-sm">{daneaUm ?? "U.M. Danea"}</span></div>
      <div className="mt-3">
        <p className="text-xs text-muted-foreground">Tipo di conversione: una conversione indicativa non determina il totale definitivo, che nasce dalla pesatura in preparazione.</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant={draft.conversionType === "esatta" ? "default" : "outline"} aria-pressed={draft.conversionType === "esatta"} disabled={!editable || busy} onClick={() => setDraft((current) => ({ ...current, conversionType: "esatta" }))}>Esatta (= 12 pz)</Button>
          <Button type="button" size="sm" variant={draft.conversionType === "indicativa" ? "default" : "outline"} aria-pressed={draft.conversionType === "indicativa"} disabled={!editable || busy} onClick={() => setDraft((current) => ({ ...current, conversionType: "indicativa" }))}>Indicativa (≈ 8 kg)</Button>
        </div>
      </div>

      {editable ? <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => requestRemoval(selected)}><Trash2 aria-hidden="true" />Rimuovi U.M.</Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => saveMutation.mutate()}>Salva</Button>
      </div> : null}
    </div> : null}

    <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) { setRemoveTarget(null); setOfferDeactivation(false); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{offerDeactivation ? "Disattivare questa U.M.?" : "Rimuovere questa U.M.?"}</AlertDialogTitle>
          <AlertDialogDescription>{offerDeactivation
            ? `“${removeTarget?.units_of_measure?.code ?? "U.M."} — ${removeTarget?.units_of_measure?.description ?? ""}” non può essere rimossa perché è predefinita o già storicizzata. Puoi disattivarla senza perdere lo storico.`
            : `Rimuovere “${removeTarget?.units_of_measure?.code ?? "U.M."} — ${removeTarget?.units_of_measure?.description ?? ""}” dalle U.M. di vendita di questo prodotto?`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void confirmRemoval(); }}>{offerDeactivation ? "Disattiva" : "Rimuovi"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}