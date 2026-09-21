import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Star, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DeliveryDaysPicker, DeliveryHintBadge } from "@/components/suppliers/delivery-days-picker";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SCHEDULE, type DeliverySchedule } from "@/lib/delivery-schedule";
import { dateTime, euro } from "@/lib/product-grid";
import { useDeliverySchedules } from "@/lib/use-delivery-schedules";
import type { CompanyUnit } from "./sales-unit-manager";

/** U.M. con cui si può acquistare una singola referenza fornitore. */
export type PurchaseUnit = {
  id: string;
  unit_id: string;
  code: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  conversion_factor: number | null;
  conversion_type: "esatta" | "indicativa";
};

type Overview = {
  link_id: string;
  supplier_record_id: string;
  supplier_name: string;
  supplier_internal_reference: string | null;
  supplier_product_code: string | null;
  supplier_reference_label: string | null;
  sourcing_priority: number | null;
  purchase_unit_id: string | null;
  purchase_unit_code: string | null;
  conversion_factor: number | null;
  conversion_reference_um: string | null;
  manual_cost: number | null;
  manual_cost_at: string | null;
  danea_net_cost: number | null;
  danea_gross_cost: number | null;
  danea_cost_at: string | null;
  min_quantity: number | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  is_active: boolean;
  notes: string | null;
  origin: "manuale" | "danea";
  b2b_relation_status: string | null;
  purchase_units: PurchaseUnit[];
};

type PendingMatch = {
  id: string;
  product_id: string;
  danea_supplier_code: string | null;
  danea_supplier_name: string | null;
};

type SupplierOption = { id: string; legal_name: string; internal_reference: string | null; archive_id: string | null };

const EMPTY_DRAFT = {
  supplierRecordId: "",
  supplierProductCode: "",
  referenceLabel: "",
  sourcingPriority: "",
  purchaseUnitId: "",
  conversionFactor: "",
  manualCost: "",
  minQuantity: "",
  leadTimeDays: "",
  notes: "",
};

function num(value: string, field?: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(field ? `“${field}” accetta solo numeri: correggi il valore “${value.trim()}”.` : "Valore numerico non valido");
  return parsed;
}

export function ProductSuppliersManager({
  companyId,
  productId,
  productArchiveId,
  daneaUm,
  units,
  editable,
}: {
  companyId: string;
  productId: string;
  productArchiveId: string | null;
  daneaUm: string | null;
  units: CompanyUnit[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [matchChoice, setMatchChoice] = useState<Record<string, string>>({});

  const linksQuery = useQuery({
    queryKey: ["product-supplier-links", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_supplier_overview", { _product_id: productId });
      if (error) throw new Error(error.message);
      return (data ?? []) as Overview[];
    },
  });

  const matchesQuery = useQuery({
    queryKey: ["product-danea-supplier-matches", productId],
    enabled: editable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_danea_supplier_matches")
        .select("id, product_id, danea_supplier_code, danea_supplier_name")
        .eq("product_id", productId)
        .eq("status", "da_associare");
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingMatch[];
    },
  });

  const suppliersQuery = useQuery({
    queryKey: ["supplier-options", companyId],
    enabled: editable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_records")
        .select("id, legal_name, internal_reference, archive_id")
        .eq("buyer_company_id", companyId)
        .neq("status", "revocato")
        .order("legal_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as SupplierOption[];
    },
  });

  const links = linksQuery.data ?? [];
  const selected = useMemo(() => links.find((row) => row.link_id === selectedLinkId) ?? null, [links, selectedLinkId]);

  useEffect(() => {
    if (!selected) return;
    setAdding(false);
    setDraft({
      supplierRecordId: selected.supplier_record_id,
      supplierProductCode: selected.supplier_product_code ?? "",
      referenceLabel: selected.supplier_reference_label ?? "",
      sourcingPriority: selected.sourcing_priority?.toString() ?? "",
      purchaseUnitId: selected.purchase_unit_id ?? "",
      conversionFactor: selected.conversion_factor?.toString() ?? "",
      manualCost: selected.manual_cost?.toString() ?? "",
      minQuantity: selected.min_quantity?.toString() ?? "",
      leadTimeDays: selected.lead_time_days?.toString() ?? "",
      notes: selected.notes ?? "",
    });
  }, [selected]);

  const deliveryQuery = useDeliverySchedules(productId);
  const deliveries = deliveryQuery.data ?? {};

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["product-supplier-links", productId] }),
      queryClient.invalidateQueries({ queryKey: ["product-danea-supplier-matches", productId] }),
      queryClient.invalidateQueries({ queryKey: ["supplier-options", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["product-supplier-delivery", productId] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (mode: "create" | "update") => {
      const supplierRecordId = mode === "create" ? draft.supplierRecordId : "";
      if (mode === "create" && !supplierRecordId) throw new Error("Scegli un fornitore");
      const payload = {
        _company_id: companyId,
        _action: mode as string,
        ...(mode === "update" && selected ? { _link_id: selected.link_id } : {}),
        ...(mode === "create" ? { _product_id: productId, _supplier_record_id: supplierRecordId } : {}),
        _supplier_product_code: draft.supplierProductCode,
        _supplier_reference_label: draft.referenceLabel,
        ...(num(draft.sourcingPriority, "Priorità di approvvigionamento") !== null ? { _sourcing_priority: num(draft.sourcingPriority, "Priorità di approvvigionamento") as number } : {}),
        ...(draft.purchaseUnitId ? { _purchase_unit_id: draft.purchaseUnitId } : {}),
        ...(num(draft.conversionFactor, "Conversione") !== null ? { _conversion_factor: num(draft.conversionFactor, "Conversione") as number } : {}),
        ...(daneaUm ? { _conversion_reference_um: daneaUm } : {}),
        ...(num(draft.manualCost, "Costo concordato") !== null ? { _manual_cost: num(draft.manualCost, "Costo concordato") as number } : {}),
        ...(num(draft.minQuantity, "Quantità minima") !== null ? { _min_quantity: num(draft.minQuantity, "Quantità minima") as number } : {}),
        ...(num(draft.leadTimeDays, "Giorni di consegna") !== null ? { _lead_time_days: num(draft.leadTimeDays, "Giorni di consegna") as number } : {}),
        _notes: draft.notes,
      };
      const { data: linkId, error } = await supabase.rpc("manage_product_supplier_link", payload);
      if (error) throw new Error(error.message);
      // In creazione la U.M. scelta (facoltativa) diventa la prima U.M. acquistabile, predefinita.
      if (mode === "create" && linkId && draft.purchaseUnitId) {
        const args = { _company_id: companyId, _link_id: linkId as string, _unit_id: draft.purchaseUnitId };
        const factor = num(draft.conversionFactor);
        const { error: addError } = await supabase.rpc("manage_product_supplier_link_unit", {
          ...args,
          _action: "add",
          ...(factor !== null ? { _conversion_factor: factor } : {}),
        });
        if (addError) throw new Error(addError.message);
        const { error: defaultError } = await supabase.rpc("manage_product_supplier_link_unit", { ...args, _action: "set_default" });
        if (defaultError) throw new Error(defaultError.message);
      }
    },
    onSuccess: async (_data, mode) => {
      await refresh();
      if (mode === "create") {
        setAdding(false);
        setDraft(EMPTY_DRAFT);
      }
      toast.success("Fornitore del prodotto salvato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { linkId: string; action: "activate" | "deactivate" | "delete_link" }) => {
      const { error } = await supabase.rpc("manage_product_supplier_link", {
        _company_id: companyId,
        _action: input.action,
        _link_id: input.linkId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setSelectedLinkId(null);
      await refresh();
      toast.success("Associazione aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const priorityMutation = useMutation({
    mutationFn: async (input: { linkId: string; priority: number | null }) => {
      const { error } = await supabase.rpc("manage_product_supplier_link", {
        _company_id: companyId,
        _action: "set_priority",
        _link_id: input.linkId,
        ...(input.priority !== null ? { _sourcing_priority: input.priority } : {}),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Priorità di approvvigionamento aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matchMutation = useMutation({
    mutationFn: async (input: { matchId: string; action: "link_existing" | "create_supplier" | "ignore"; supplierRecordId?: string }) => {
      const { error } = await supabase.rpc("resolve_danea_supplier_match", {
        _company_id: companyId,
        _match_id: input.matchId,
        _action: input.action,
        ...(input.supplierRecordId ? { _supplier_record_id: input.supplierRecordId } : {}),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Fornitore Danea riconciliato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = saveMutation.isPending || statusMutation.isPending || priorityMutation.isPending || matchMutation.isPending;
  // U.M. proponibili per l'acquisto: uso "acquisto" o "entrambi".
  const purchaseUnits = units.filter((unit) => unit.status === "attivo" && (unit.usage ?? "entrambi") !== "vendita");
  const availableSuppliers = (suppliersQuery.data ?? []).filter(
    (supplier) => supplier.archive_id === null || supplier.archive_id === productArchiveId,
  );
  const pending = matchesQuery.data ?? [];

  const linkedLabel = (status: string | null) => {
    if (!status) return null;
    if (status === "attivo") return "Collegato Trevi Fruit";
    if (status === "in_attesa") return "Collegamento in attesa";
    if (status === "sospeso") return "Collegamento sospeso";
    return "Collegamento chiuso";
  };

  /** Segnala subito i campi numerici compilati con testo: contorno rosso + messaggio sotto il campo. */
  const isInvalidNumber = (value: string) => {
    const normalized = value.trim().replace(",", ".");
    return normalized !== "" && !Number.isFinite(Number(normalized));
  };
  const invalidClass = (value: string) => (isInvalidNumber(value) ? "border-destructive ring-1 ring-destructive focus-visible:ring-destructive" : "");
  const numberError = (value: string) => (isInvalidNumber(value) ? <p className="text-xs font-medium text-destructive">Inserisci solo un numero</p> : null);
  const hasFieldErrors = [draft.sourcingPriority, draft.conversionFactor, draft.manualCost, draft.minQuantity, draft.leadTimeDays].some(isInvalidNumber);

  const fieldsFor = (mode: "create" | "update") => (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">Codice articolo presso il fornitore</Label>
        <Input value={draft.supplierProductCode} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, supplierProductCode: event.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Descrizione della referenza del fornitore</Label>
        <Input value={draft.referenceLabel} disabled={busy} placeholder="Es. sacco 10 kg" onChange={(event) => setDraft((current) => ({ ...current, referenceLabel: event.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Priorità di approvvigionamento (facoltativa)</Label>
        <Input type="number" min={1} step={1} inputMode="numeric" aria-invalid={isInvalidNumber(draft.sourcingPriority)} className={invalidClass(draft.sourcingPriority)} value={draft.sourcingPriority} disabled={busy} placeholder="Es. 1 (prima scelta)" onChange={(event) => setDraft((current) => ({ ...current, sourcingPriority: event.target.value }))} />
        {numberError(draft.sourcingPriority)}
        <p className="text-xs text-muted-foreground">Solo un numero: 1 = prima scelta. Più fonti possono avere la stessa priorità, la scelta finale resta nella Lista della Spesa.</p>
      </div>
      {mode === "create" ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Prima U.M. di acquisto (facoltativa)</Label>
            <Select value={draft.purchaseUnitId || "nessuna"} disabled={busy} onValueChange={(value) => setDraft((current) => ({ ...current, purchaseUnitId: value === "nessuna" ? "" : value }))}>
              <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nessuna">Nessuna</SelectItem>
                {purchaseUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code} — {unit.description}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Dopo il salvataggio potrai aggiungere altre U.M. con cui acquistare questa referenza.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conversione (facoltativa) verso {daneaUm ?? "U.M. prodotto"}</Label>
            <div className="grid grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm">1 {draft.purchaseUnitId ? purchaseUnits.find((unit) => unit.id === draft.purchaseUnitId)?.code ?? "U.M." : "U.M."} ≈</span>
              <Input inputMode="decimal" aria-label="Conversione stimata" aria-invalid={isInvalidNumber(draft.conversionFactor)} className={invalidClass(draft.conversionFactor)} value={draft.conversionFactor} disabled={busy} placeholder="Nessuna" onChange={(event) => setDraft((current) => ({ ...current, conversionFactor: event.target.value }))} />
              <span className="truncate text-sm">{daneaUm ?? "U.M. prodotto"}</span>
            </div>
            {numberError(draft.conversionFactor)}
            <p className="text-xs text-muted-foreground">Compila solo se l’equivalenza è certa: senza conversione il sistema non calcola equivalenti.</p>
          </div>
        </>
      ) : null}
      <div className="space-y-1">
        <Label className="text-xs">Costo concordato (Trevi Fruit)</Label>
        <Input inputMode="decimal" aria-invalid={isInvalidNumber(draft.manualCost)} className={invalidClass(draft.manualCost)} value={draft.manualCost} disabled={busy} placeholder="Nessuno" onChange={(event) => setDraft((current) => ({ ...current, manualCost: event.target.value }))} />
        {numberError(draft.manualCost)}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quantità minima</Label>
        <Input inputMode="decimal" aria-invalid={isInvalidNumber(draft.minQuantity)} className={invalidClass(draft.minQuantity)} value={draft.minQuantity} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, minQuantity: event.target.value }))} />
        {numberError(draft.minQuantity)}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Giorni di consegna</Label>
        <Input type="number" min={0} step={1} inputMode="numeric" aria-invalid={isInvalidNumber(draft.leadTimeDays)} className={invalidClass(draft.leadTimeDays)} value={draft.leadTimeDays} disabled={busy} placeholder="Es. 2" onChange={(event) => setDraft((current) => ({ ...current, leadTimeDays: event.target.value }))} />
        {numberError(draft.leadTimeDays)}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Note</Label>
        <Input value={draft.notes} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
      </div>
    </div>
  );

  return (
    <section aria-labelledby="product-suppliers-title" className="border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="product-suppliers-title" className="text-sm font-semibold">Fornitori</h3>
        <Badge variant="secondary" className="shrink-0">{editable ? "Modificabili" : "Sola lettura"}</Badge>
      </div>

      {editable && pending.length ? (
        <div className="mt-2 space-y-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
          <p className="text-sm font-semibold">Fornitore Danea da associare</p>
          {pending.map((match) => (
            <div key={match.id} className="space-y-2 border-t border-border pt-2 first:border-0 first:pt-0">
              <p className="text-sm">
                {match.danea_supplier_name ?? "Senza nome"}
                {match.danea_supplier_code ? <span className="ml-2 font-mono text-xs text-muted-foreground">{match.danea_supplier_code}</span> : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={matchChoice[match.id] ?? ""} disabled={busy} onValueChange={(value) => setMatchChoice((current) => ({ ...current, [match.id]: value }))}>
                  <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Collega a un fornitore…" /></SelectTrigger>
                  <SelectContent>
                    {(suppliersQuery.data ?? [])
                      .filter((supplier) => supplier.archive_id === null || supplier.archive_id === productArchiveId)
                      .map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.legal_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" disabled={busy || !matchChoice[match.id]} onClick={() => { const choice = matchChoice[match.id]; if (choice) matchMutation.mutate({ matchId: match.id, action: "link_existing", supplierRecordId: choice }); }}>Collega</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => matchMutation.mutate({ matchId: match.id, action: "create_supplier" })}>Crea anagrafica</Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => matchMutation.mutate({ matchId: match.id, action: "ignore" })}>Ignora</Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-2 space-y-2">
        {links.map((row) => {
          const isSelected = row.link_id === selectedLinkId;
          const label = linkedLabel(row.b2b_relation_status);
          return (
            <div key={row.link_id} className={`rounded-md border p-3 ${isSelected ? "border-primary" : "border-border"}`}>
              <button type="button" className="w-full text-left" aria-expanded={isSelected} onClick={() => setSelectedLinkId(isSelected ? null : row.link_id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Truck aria-hidden="true" className="size-4 text-muted-foreground" />
                  <strong className="text-sm">{row.supplier_name}</strong>
                  {row.supplier_reference_label ? <span className="text-xs text-muted-foreground">{row.supplier_reference_label}</span> : null}
                  {row.sourcing_priority !== null ? <Badge><Star className="fill-current" aria-hidden="true" />Priorità {row.sourcing_priority}</Badge> : null}
                  {!row.is_active ? <Badge variant="outline">Disattivato</Badge> : null}
                  {label ? <Badge variant="secondary"><Link2 aria-hidden="true" />{label}</Badge> : null}
                  {deliveries[row.link_id] ? <DeliveryHintBadge schedule={deliveries[row.link_id]!.schedule} /> : null}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div><dt className="text-muted-foreground">Cod. fornitore</dt><dd className="font-mono">{row.supplier_product_code ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Priorità</dt><dd>{row.sourcing_priority ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">U.M. acquistabili</dt><dd>{(row.purchase_units ?? []).length ? (row.purchase_units ?? []).map((unit) => `${unit.code}${unit.is_default ? " ★" : ""}`).join(" · ") : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Costo Danea</dt><dd>{row.danea_net_cost !== null ? `${euro(row.danea_net_cost)} · ${dateTime(row.danea_cost_at)}` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Costo Trevi Fruit</dt><dd>{row.manual_cost !== null ? `${euro(row.manual_cost)} · ${dateTime(row.manual_cost_at)}` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Q.tà minima</dt><dd>{row.min_quantity ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Consegna</dt><dd>{row.lead_time_days !== null ? `${row.lead_time_days} gg` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Origine</dt><dd>{row.origin === "danea" ? "Danea" : "Manuale"}</dd></div>
                  <div><dt className="text-muted-foreground">Note</dt><dd className="truncate">{row.notes ?? "—"}</dd></div>
                </dl>
              </button>

              {isSelected && editable ? (
                <div className="mt-3 border-t border-border pt-3">
                  <PurchaseUnitsEditor
                    companyId={companyId}
                    linkId={row.link_id}
                    baseUm={daneaUm}
                    assigned={row.purchase_units ?? []}
                    units={purchaseUnits}
                    disabled={busy}
                    onChanged={refresh}
                  />
                  <LinkDeliveryEditor
                    linkId={row.link_id}
                    delivery={deliveries[row.link_id] ?? null}
                    disabled={busy}
                    onChanged={refresh}
                  />
                  {fieldsFor("update")}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {row.sourcing_priority !== null ? (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => priorityMutation.mutate({ linkId: row.link_id, priority: null })}><Star aria-hidden="true" />Togli priorità</Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => priorityMutation.mutate({ linkId: row.link_id, priority: 1 })}><Star className="fill-current" aria-hidden="true" />Priorità 1</Button>
                    )}
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => statusMutation.mutate({ linkId: row.link_id, action: row.is_active ? "deactivate" : "activate" })}>{row.is_active ? "Disattiva" : "Riattiva"}</Button>
                    <Button type="button" size="sm" disabled={busy || hasFieldErrors} onClick={() => saveMutation.mutate("update")}>Salva</Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!links.length && !adding ? (
          editable ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Nessun fornitore associato</p>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setSelectedLinkId(null); setDraft(EMPTY_DRAFT); setAdding(true); }}><Plus aria-hidden="true" />Aggiungi</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun fornitore associato</p>
          )
        ) : null}
      </div>

      {editable ? (
        <div className="mt-2">
          {adding ? (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="space-y-1">
                <Label className="text-xs">Fornitore</Label>
                <Select value={draft.supplierRecordId} disabled={busy} onValueChange={(value) => setDraft((current) => ({ ...current, supplierRecordId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Scegli un fornitore" /></SelectTrigger>
                  <SelectContent>
                    {availableSuppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.legal_name}{supplier.internal_reference ? ` · ${supplier.internal_reference}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!availableSuppliers.length ? <p className="text-xs text-muted-foreground">Nessun fornitore disponibile per questo archivio.</p> : null}
              </div>
              {fieldsFor("create")}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); }}>Annulla</Button>
                <Button type="button" size="sm" disabled={busy || hasFieldErrors} onClick={() => saveMutation.mutate("create")}>Aggiungi</Button>
              </div>
            </div>
          ) : links.length ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setSelectedLinkId(null); setDraft(EMPTY_DRAFT); setAdding(true); }}><Plus aria-hidden="true" />Aggiungi fornitore</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Giorni di consegna della singola referenza: normalmente ereditati dal fornitore,
 * con la possibilità di impostare un'eccezione valida solo per questo prodotto.
 */
function LinkDeliveryEditor({
  linkId,
  delivery,
  disabled,
  onChanged,
}: {
  linkId: string;
  delivery: { schedule: DeliverySchedule; isOverride: boolean; supplierSchedule: DeliverySchedule } | null;
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [override, setOverride] = useState(delivery?.isOverride ?? false);
  const [schedule, setSchedule] = useState<DeliverySchedule>(delivery?.schedule ?? DEFAULT_SCHEDULE);

  useEffect(() => {
    setOverride(delivery?.isOverride ?? false);
    setSchedule(delivery?.schedule ?? DEFAULT_SCHEDULE);
  }, [delivery?.isOverride, delivery?.schedule]);

  const save = useMutation({
    mutationFn: async (input: { inherit: boolean; schedule: DeliverySchedule }) => {
      const { error } = await supabase.rpc("set_product_supplier_delivery_schedule", {
        _link_id: linkId,
        _inherit: input.inherit,
        ...(input.inherit ? {} : { _weekdays: input.schedule.weekdays, _month_day: input.schedule.monthDay ?? undefined }),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await onChanged();
      toast.success("Giorni di consegna aggiornati");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = disabled || save.isPending;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold">Giorni di consegna</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={override}
            disabled={busy}
            onCheckedChange={(next) => {
              setOverride(next);
              if (!next) save.mutate({ inherit: true, schedule });
            }}
          />
          Eccezione per questo prodotto
        </label>
      </div>
      {override ? (
        <>
          <DeliveryDaysPicker schedule={schedule} onChange={setSchedule} disabled={busy} label="Giorni validi per questo prodotto" />
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={busy} onClick={() => save.mutate({ inherit: false, schedule })}>
              Salva giorni
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Eredita i giorni impostati nella scheda del fornitore. Solo informativo: non blocca gli ordini.
        </p>
      )}
    </div>
  );
}

/**
 * U.M. con cui è possibile acquistare una singola referenza fornitore.
 * La predefinita è facoltativa: una referenza può restare senza U.M. preferita.
 */
function PurchaseUnitsEditor({
  companyId,
  linkId,
  baseUm,
  assigned,
  units,
  disabled,
  onChanged,
}: {
  companyId: string;
  linkId: string;
  baseUm: string | null;
  assigned: PurchaseUnit[];
  units: CompanyUnit[];
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [factor, setFactor] = useState("");
  const [conversionType, setConversionType] = useState<"esatta" | "indicativa">("indicativa");

  const selected = assigned.find((row) => row.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    setFactor(selected.conversion_factor?.toString() ?? "");
    setConversionType(selected.conversion_type);
  }, [selected]);

  const mutation = useMutation({
    mutationFn: async (input: {
      unitId: string;
      action: "add" | "remove" | "set_default" | "clear_default" | "set_conversion";
      conversionFactor?: number | null;
      conversionType?: "esatta" | "indicativa";
    }) => {
      const { error } = await supabase.rpc("manage_product_supplier_link_unit", {
        _company_id: companyId,
        _link_id: linkId,
        _unit_id: input.unitId,
        _action: input.action,
        ...(input.conversionFactor !== null && input.conversionFactor !== undefined ? { _conversion_factor: input.conversionFactor } : {}),
        ...(input.conversionType ? { _conversion_type: input.conversionType } : {}),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await onChanged();
      toast.success("U.M. di acquisto aggiornate");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = disabled || mutation.isPending;
  const available = units.filter((unit) => !assigned.some((row) => row.unit_id === unit.id));

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold">U.M. con cui posso acquistare questa referenza</p>
      <p className="text-xs text-muted-foreground">La predefinita (★) è facoltativa: se manca, la sceglierai nella Lista della Spesa.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {assigned.map((row) => (
          <Button
            key={row.id}
            type="button"
            size="sm"
            variant={selectedId === row.id ? "default" : "outline"}
            aria-pressed={selectedId === row.id}
            aria-label={`${row.code}${row.is_default ? ", predefinita" : ""}`}
            disabled={busy}
            onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
          >
            {row.code}
            {row.is_default ? <Star className="fill-current" aria-hidden="true" /> : null}
          </Button>
        ))}
        {available.length ? (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="icon" variant="outline" aria-label="Aggiungi U.M. di acquisto" disabled={busy}><Plus /></Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Aggiungi U.M. di acquisto</p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {available.map((unit) => (
                  <Button
                    key={unit.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start py-2 text-left"
                    disabled={busy}
                    onClick={async () => { await mutation.mutateAsync({ unitId: unit.id, action: "add" }); setAddOpen(false); }}
                  >
                    <span><strong>{unit.code}</strong><span className="ml-2 text-muted-foreground">{unit.description}</span></span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        {!assigned.length ? <span className="text-xs text-muted-foreground">Nessuna U.M. di acquisto: aggiungila con +.</span> : null}
      </div>

      {selected ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Label className="text-xs">Conversione (facoltativa) verso {baseUm ?? "U.M. prodotto"}</Label>
          <div className="grid grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)] items-center gap-2">
            <span className="text-sm">1 {selected.code} {conversionType === "esatta" ? "=" : "≈"}</span>
            <Input inputMode="decimal" aria-label={`Conversione ${selected.code}`} value={factor} disabled={busy} placeholder="Nessuna" onChange={(event) => setFactor(event.target.value)} />
            <span className="truncate text-sm">{baseUm ?? "U.M. prodotto"}</span>
          </div>
          {factor.trim() ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={conversionType === "esatta" ? "default" : "outline"} aria-pressed={conversionType === "esatta"} disabled={busy} onClick={() => setConversionType("esatta")}>Esatta</Button>
              <Button type="button" size="sm" variant={conversionType === "indicativa" ? "default" : "outline"} aria-pressed={conversionType === "indicativa"} disabled={busy} onClick={() => setConversionType("indicativa")}>Indicativa</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Senza conversione il sistema non calcola equivalenti: fabbisogno e quantità acquistata restano separati.</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {selected.is_default ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => mutation.mutate({ unitId: selected.unit_id, action: "clear_default" })}><Star aria-hidden="true" />Togli predefinita</Button>
            ) : (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => mutation.mutate({ unitId: selected.unit_id, action: "set_default" })}><Star className="fill-current" aria-hidden="true" />Predefinita</Button>
            )}
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => { mutation.mutate({ unitId: selected.unit_id, action: "remove" }); setSelectedId(null); }}><Trash2 aria-hidden="true" />Rimuovi</Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                const normalized = factor.trim().replace(",", ".");
                const value = normalized ? Number(normalized) : null;
                if (value !== null && (!Number.isFinite(value) || value <= 0)) { toast.error("La conversione deve essere maggiore di zero"); return; }
                mutation.mutate({ unitId: selected.unit_id, action: "set_conversion", conversionFactor: value, conversionType });
              }}
            >
              Salva conversione
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
