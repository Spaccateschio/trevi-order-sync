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
import { supabase } from "@/integrations/supabase/client";
import { dateTime, euro } from "@/lib/product-grid";
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

function num(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error("Valore numerico non valido");
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

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["product-supplier-links", productId] }),
      queryClient.invalidateQueries({ queryKey: ["product-danea-supplier-matches", productId] }),
      queryClient.invalidateQueries({ queryKey: ["supplier-options", companyId] }),
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
        ...(num(draft.sourcingPriority) !== null ? { _sourcing_priority: num(draft.sourcingPriority) as number } : {}),
        ...(draft.purchaseUnitId ? { _purchase_unit_id: draft.purchaseUnitId } : {}),
        ...(num(draft.conversionFactor) !== null ? { _conversion_factor: num(draft.conversionFactor) as number } : {}),
        ...(daneaUm ? { _conversion_reference_um: daneaUm } : {}),
        ...(num(draft.manualCost) !== null ? { _manual_cost: num(draft.manualCost) as number } : {}),
        ...(num(draft.minQuantity) !== null ? { _min_quantity: num(draft.minQuantity) as number } : {}),
        ...(num(draft.leadTimeDays) !== null ? { _lead_time_days: num(draft.leadTimeDays) as number } : {}),
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
        <Input inputMode="numeric" value={draft.sourcingPriority} disabled={busy} placeholder="Nessuna" onChange={(event) => setDraft((current) => ({ ...current, sourcingPriority: event.target.value }))} />
        <p className="text-xs text-muted-foreground">Più fonti possono avere la stessa priorità: la scelta finale resta nella Lista della Spesa.</p>
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
              <Input inputMode="decimal" aria-label="Conversione stimata" value={draft.conversionFactor} disabled={busy} placeholder="Nessuna" onChange={(event) => setDraft((current) => ({ ...current, conversionFactor: event.target.value }))} />
              <span className="truncate text-sm">{daneaUm ?? "U.M. prodotto"}</span>
            </div>
            <p className="text-xs text-muted-foreground">Compila solo se l’equivalenza è certa: senza conversione il sistema non calcola equivalenti.</p>
          </div>
        </>
      ) : null}
      <div className="space-y-1">
        <Label className="text-xs">Costo concordato (Trevi Fruit)</Label>
        <Input inputMode="decimal" value={draft.manualCost} disabled={busy} placeholder="Nessuno" onChange={(event) => setDraft((current) => ({ ...current, manualCost: event.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quantità minima</Label>
        <Input inputMode="decimal" value={draft.minQuantity} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, minQuantity: event.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Giorni di consegna</Label>
        <Input inputMode="numeric" value={draft.leadTimeDays} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, leadTimeDays: event.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Note</Label>
        <Input value={draft.notes} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
      </div>
    </div>
  );

  return (
    <section aria-labelledby="product-suppliers-title" className="border-t border-border pt-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 id="product-suppliers-title" className="text-sm font-semibold">Fornitori</h3>
          <p className="text-xs text-muted-foreground">Anagrafica fornitori Trevi Fruit · U.M. prodotto Danea: {daneaUm ?? "—"}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{editable ? "Modificabili" : "Sola lettura"}</Badge>
      </div>

      {editable && pending.length ? (
        <div className="mt-3 space-y-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
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

      <div className="mt-3 space-y-2">
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
                  {fieldsFor("update")}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {row.sourcing_priority !== null ? (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => priorityMutation.mutate({ linkId: row.link_id, priority: null })}><Star aria-hidden="true" />Togli priorità</Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => priorityMutation.mutate({ linkId: row.link_id, priority: 1 })}><Star className="fill-current" aria-hidden="true" />Priorità 1</Button>
                    )}
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => statusMutation.mutate({ linkId: row.link_id, action: row.is_active ? "deactivate" : "activate" })}>{row.is_active ? "Disattiva" : "Riattiva"}</Button>
                    <Button type="button" size="sm" disabled={busy} onClick={() => saveMutation.mutate("update")}>Salva</Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!links.length ? <p className="text-sm text-muted-foreground">Nessun fornitore associato a questo prodotto.</p> : null}
      </div>

      {editable ? (
        <div className="mt-3">
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
                <Button type="button" size="sm" disabled={busy} onClick={() => saveMutation.mutate("create")}>Aggiungi</Button>
              </div>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setSelectedLinkId(null); setDraft(EMPTY_DRAFT); setAdding(true); }}><Plus aria-hidden="true" />Aggiungi fornitore</Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
