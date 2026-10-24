import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { manualLinksForPurchaseUnits, planPurchaseUnitApply, type QuickApplyConversion } from "@/lib/purchase-unit-apply";
import type { CompanyUnit } from "./sales-unit-manager";

type OverviewRow = {
  link_id: string;
  supplier_name: string;
  is_active: boolean;
  b2b_relation_status: string | null;
  purchase_units: { id: string; unit_id: string; code: string; is_active: boolean; is_default: boolean }[];
};

function parseFactor(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Impostazione rapida delle U.M. di acquisto: si scelgono qui U.M., conversione
 * e predefinita una sola volta e un tasto le applica a tutte le referenze
 * manuali attive del prodotto. Le referenze B2B restano intoccate (U.M. dal
 * catalogo pubblicato del venditore) e non si rimuove mai una U.M. esistente.
 */
export function PurchaseUnitsQuickApply({
  companyId,
  productId,
  daneaUm,
  units,
  editable,
}: {
  companyId: string;
  productId: string;
  daneaUm: string | null;
  units: CompanyUnit[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [defaultUnitId, setDefaultUnitId] = useState<string | null>(null);
  const [savedConversions, setSavedConversions] = useState<Record<string, QuickApplyConversion>>({});
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [factorDraft, setFactorDraft] = useState("");
  const [conversionType, setConversionType] = useState<"esatta" | "indicativa">("indicativa");
  const [addOpen, setAddOpen] = useState(false);

  const linksQuery = useQuery({
    queryKey: ["product-supplier-links", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_supplier_overview", { _product_id: productId });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OverviewRow[];
    },
  });
  const links = linksQuery.data ?? [];
  const manualLinks = useMemo(() => manualLinksForPurchaseUnits(links), [links]);
  const b2bCount = links.filter((link) => link.is_active && link.b2b_relation_status === "attivo").length;
  const available = units.filter((unit) => unit.status === "attivo" && (unit.usage ?? "entrambi") !== "vendita");

  const unitById = useMemo(() => new Map(available.map((unit) => [unit.id, unit])), [available]);

  const plannedConversions = useMemo(() => {
    const map: Record<string, QuickApplyConversion | undefined> = {};
    for (const unitId of selectedUnits) {
      if (activeChip === unitId) {
        const factor = parseFactor(factorDraft);
        if (factor !== null) map[unitId] = { factor, type: conversionType };
      } else {
        map[unitId] = savedConversions[unitId];
      }
    }
    return map;
  }, [selectedUnits, activeChip, factorDraft, conversionType, savedConversions]);

  const factorInvalid = activeChip !== null && factorDraft.trim() !== "" && parseFactor(factorDraft) === null;

  const selectChip = (unitId: string) => {
    setActiveChip(unitId);
    setFactorDraft(savedConversions[unitId]?.factor?.toString() ?? "");
    setConversionType(savedConversions[unitId]?.type ?? "indicativa");
  };

  const toggleUnit = (unitId: string) => {
    setSelectedUnits((current) => (current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId]));
    if (defaultUnitId === unitId) setDefaultUnitId(null);
  };

  // Se una U.M. selezionata viene tolta, non resta come predefinita.
  useEffect(() => {
    setDefaultUnitId((current) => (current && selectedUnits.includes(current) ? current : null));
  }, [selectedUnits]);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const ops = planPurchaseUnitApply(links, selectedUnits, defaultUnitId, plannedConversions);
      if (!ops.length) return 0;
      for (const op of ops) {
        const { error } = await supabase.rpc("manage_product_supplier_link_unit", {
          _company_id: companyId,
          _link_id: op.linkId,
          _unit_id: op.unitId,
          _action: op.action,
          ...(op.action === "set_conversion" && op.conversionFactor !== null
            ? { _conversion_factor: op.conversionFactor, _conversion_type: op.conversionType ?? "indicativa" }
            : {}),
        });
        if (error) throw new Error(error.message);
      }
      return ops.length;
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ["product-supplier-links", productId] });
      toast.success(count ? `U.M. applicate: ${count} aggiornamenti su ${manualLinks.length} referenze` : "Nessuna modifica necessaria");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!editable) return null;

  const busy = applyMutation.isPending;
  const canApply = manualLinks.length > 0 && selectedUnits.length > 0 && !factorInvalid;

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">Impostazione rapida</p>
        <p className="text-xs text-muted-foreground">
          {manualLinks.length ? `${manualLinks.length} referenze manuali${b2bCount ? ` · ${b2bCount} B2B escluse` : ""}` : "Solo fornitori B2B: le U.M. arrivano dal catalogo pubblicato"}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Scegli le U.M. una volta e applicale a tutti i fornitori manuali: aggiunge solo quelle mancanti, non tocca le B2B e non rimuove nulla.</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {selectedUnits.map((unitId) => {
          const unit = unitById.get(unitId);
          if (!unit) return null;
          return (
            <Button
              key={unitId}
              type="button"
              size="sm"
              variant={activeChip === unitId ? "default" : "outline"}
              aria-pressed={activeChip === unitId}
              aria-label={`${unit.code}${defaultUnitId === unitId ? ", predefinita" : ""}`}
              disabled={busy}
              onClick={() => (activeChip === unitId ? setActiveChip(null) : selectChip(unitId))}
            >
              {unit.code}
              {defaultUnitId === unitId ? <Star className="fill-current" aria-hidden="true" /> : null}
            </Button>
          );
        })}
        {available.filter((unit) => !selectedUnits.includes(unit.id)).length ? (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="icon" variant="outline" aria-label="Aggiungi U.M. all'impostazione rapida" disabled={busy}><Plus /></Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Aggiungi U.M. all'impostazione rapida</p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {available.filter((unit) => !selectedUnits.includes(unit.id)).map((unit) => (
                  <Button
                    key={unit.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start py-2 text-left"
                    disabled={busy}
                    onClick={() => { toggleUnit(unit.id); setAddOpen(false); }}
                  >
                    <span><strong>{unit.code}</strong><span className="ml-2 text-muted-foreground">{unit.description}</span></span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        {!selectedUnits.length ? <span className="text-xs text-muted-foreground">Nessuna U.M. selezionata: aggiungila con +.</span> : null}
      </div>

      {activeChip && unitById.get(activeChip) ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">{unitById.get(activeChip)!.code} — {unitById.get(activeChip)!.description}</strong>
            <Button type="button" size="icon" variant="ghost" aria-label="Togli la U.M. dall'impostazione rapida" disabled={busy} onClick={() => { toggleUnit(activeChip); setActiveChip(null); }}><X aria-hidden="true" /></Button>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)] items-center gap-2">
            <span className="text-sm">1 {unitById.get(activeChip)!.code} {conversionType === "esatta" ? "=" : "≈"}</span>
            <Input inputMode="decimal" aria-label={`Conversione ${unitById.get(activeChip)!.code}`} value={factorDraft} disabled={busy} placeholder="Nessuna" onChange={(event) => setFactorDraft(event.target.value)} />
            <span className="truncate text-sm">{daneaUm ?? "U.M. prodotto"}</span>
          </div>
          {factorInvalid ? <p role="alert" className="text-xs text-destructive">Inserisci un numero maggiore di zero.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={conversionType === "esatta" ? "default" : "outline"} aria-pressed={conversionType === "esatta"} disabled={busy} onClick={() => setConversionType("esatta")}>Esatta</Button>
            <Button type="button" size="sm" variant={conversionType === "indicativa" ? "default" : "outline"} aria-pressed={conversionType === "indicativa"} disabled={busy} onClick={() => setConversionType("indicativa")}>Indicativa</Button>
            <Button type="button" size="sm" variant={defaultUnitId === activeChip ? "default" : "outline"} aria-pressed={defaultUnitId === activeChip} disabled={busy} onClick={() => setDefaultUnitId(defaultUnitId === activeChip ? null : activeChip)}>
              <Star className={defaultUnitId === activeChip ? "fill-current" : ""} aria-hidden="true" />Predefinita
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">{selectedUnits.length} U.M. selezionate</Badge>
        <Button type="button" size="sm" disabled={!canApply || busy} onClick={() => applyMutation.mutate()}>
          {busy ? "Applicazione…" : `Applica a tutti i fornitori (${manualLinks.length})`}
        </Button>
      </div>
    </div>
  );
}
