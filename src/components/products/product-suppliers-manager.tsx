import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, ShoppingBag, Star, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DeliveryDaysPicker, DeliveryHintBadge } from "@/components/suppliers/delivery-days-picker";
import { supabase } from "@/integrations/supabase/client";
import { SupplierConversionsSection } from "./stock-unit-config";
import { DEFAULT_SCHEDULE, deliveryScheduleSummary, type DeliverySchedule } from "@/lib/delivery-schedule";
import { dateTime, euro } from "@/lib/product-grid";
import { useDeliverySchedules } from "@/lib/use-delivery-schedules";
import { allowedPurchaseUnits, companyProductPurchaseUnitsOptions, sharedPurchaseUnitChoices, productPurchaseUnitsOptions } from "@/lib/product-purchase-units";
import { supplierLinkPatch } from "@/lib/supplier-link-patch";
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
  priceUnitId: "",
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
  const [directOpen, setDirectOpen] = useState(false);
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

  const ownUnitsQuery = useQuery(productPurchaseUnitsOptions(companyId, productId));
  const sharedUnitsQuery = useQuery(companyProductPurchaseUnitsOptions(companyId));
  const activeUnits = useMemo(() => allowedPurchaseUnits(units, companyId), [units, companyId]);
  const configuredUnits = activeUnits.filter((unit) => ownUnitsQuery.data?.some((u) => u.unit_id === unit.id));
  const directSelected = new Set(configuredUnits.map((unit) => unit.id));

  // U.M. del prezzo del costo concordato (solo fornitori non B2B): letta direttamente dalla referenza.
  const priceUnitsQuery = useQuery({
    queryKey: ["product-supplier-price-units", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("id, price_unit_id")
        .eq("product_id", productId);
      if (error) throw new Error(error.message);
      return Object.fromEntries((data ?? []).map((row) => [row.id, row.price_unit_id])) as Record<string, string | null>;
    },
  });

  // Articolo B2B realmente collegato (identità del collegamento), mostrato accanto al codice.
  const b2bItemsQuery = useQuery({
    queryKey: ["product-supplier-b2b-items", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("id, b2b_item_id")
        .eq("product_id", productId)
        .not("b2b_item_id", "is", null);
      if (error) throw new Error(error.message);
      const ids = (data ?? []).map((row) => row.b2b_item_id as string);
      if (!ids.length) return {} as Record<string, { code: string; description: string | null }>;
      const { data: items } = await supabase.from("products").select("id, code, description").in("id", ids);
      const byId = new Map((items ?? []).map((item) => [item.id, item]));
      return Object.fromEntries((data ?? []).flatMap((row) => {
        const item = byId.get(row.b2b_item_id as string);
        return item ? [[row.id, { code: item.code, description: item.description }]] : [];
      })) as Record<string, { code: string; description: string | null }>;
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

  const allLinks = linksQuery.data ?? [];
  // I collegamenti disattivati («Scollega dal prodotto») spariscono dall'elenco normale:
  // restano recuperabili solo dietro «Mostra disattivati», per una eventuale riattivazione.
  const [showInactive, setShowInactive] = useState(false);
  const links = allLinks.filter((row) => row.is_active);
  const inactiveLinks = allLinks.filter((row) => !row.is_active);
  const visibleLinks = (showInactive ? allLinks : links).slice().sort((a,b) => Number(b.is_preferred)-Number(a.is_preferred) || a.supplier_name.localeCompare(b.supplier_name,"it"));
  const selected = useMemo(() => visibleLinks.find((row) => row.link_id === selectedLinkId) ?? null, [visibleLinks, selectedLinkId]);

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
      priceUnitId: priceUnitsQuery.data?.[selected.link_id] ?? "",
      minQuantity: selected.min_quantity?.toString() ?? "",
      leadTimeDays: selected.lead_time_days?.toString() ?? "",
      notes: selected.notes ?? "",
    });
  }, [selected, priceUnitsQuery.data]);

  const deliveryQuery = useDeliverySchedules(productId);
  const deliveries = deliveryQuery.data ?? {};

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["product-supplier-links", productId] }),
      queryClient.invalidateQueries({ queryKey: ["product-supplier-price-units", productId] }),
      queryClient.invalidateQueries({ queryKey: ["product-danea-supplier-matches", productId] }),
      queryClient.invalidateQueries({ queryKey: ["supplier-options", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["product-supplier-delivery", productId] }),
      // Aggiorna anche le colonne «Fornitori collegati» / «U.M. acquisto per fornitore» dell'elenco Prodotti.
      queryClient.invalidateQueries({ queryKey: ["product-purchase-units", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["prodotti-fornitori", companyId] }),
    ]);
  };

  const isB2b = selected?.b2b_relation_status === "attivo";

  const saveMutation = useMutation({
    mutationFn: async (mode: "create" | "update") => {
      const supplierRecordId = mode === "create" ? draft.supplierRecordId : "";
      if (mode === "create" && !supplierRecordId) throw new Error("Scegli un fornitore");
      if (mode === "update") {
        if (!selected) throw new Error("Scegli la referenza da modificare");
        const patch = supplierLinkPatch({ supplier_product_code: selected.supplier_product_code }, { supplier_product_code: draft.supplierProductCode.trim() || null });
        const { error } = await supabase.rpc("patch_product_supplier_link", { _link_id: selected.link_id, _patch: patch });
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.rpc("manage_product_supplier_link", {
        _company_id: companyId, _action: "create", _product_id: productId,
        _supplier_record_id: supplierRecordId, _supplier_product_code: draft.supplierProductCode,
      });
      if (error) throw new Error(error.message);
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
    mutationFn: async (input: { linkId: string; action: "activate" | "deactivate" }) => {
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

  // «Disattiva» / «Scollega dal prodotto»: conferma, poi il DB toglie il fornitore dalle Liste aperte e lo disattiva
  // in un'unica operazione (rifiuta con Lista confermata o quota già in ordine, senza modifiche).
  const [unlinkTarget, setUnlinkTarget] = useState<{ linkId: string; name: string; kind: "deactivate" | "unlink" } | null>(null);
  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await (supabase.rpc as any)("deactivate_product_supplier_link_with_lists", {
        _company_id: companyId,
        _link_id: linkId,
      });
      if (error) throw new Error(error.message);
      return data as { removed_from_lists: number };
    },
    onSuccess: async (result) => {
      setUnlinkTarget(null);
      setSelectedLinkId(null);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success(result?.removed_from_lists ? `Fornitore disattivato e tolto dalla Lista (${result.removed_from_lists} prodotto)` : "Fornitore disattivato");
    },
    onError: (error: Error) => toast.error(error.message, { duration: 10000 }),
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

  // Stelle = destinazioni abituali (più fornitori e/o acquisto diretto); solo amministratori, deciso dal DB.
  const directStarQuery = useQuery({
    queryKey: ["product-direct-star", companyId, productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_direct_purchase_preferences")
        .select("is_preferred").eq("company_id", companyId).eq("product_id", productId).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.is_preferred);
    },
  });
  const directStarred = directStarQuery.data ?? false;
  const starMutation = useMutation({
    mutationFn: async (input: { linkId: string | null; on: boolean }) => {
      const { error } = await supabase.rpc("toggle_product_destination_star", {
        _company_id: companyId, _product_id: productId,
        ...(input.linkId ? { _link_id: input.linkId } : {}), _direct: input.linkId === null, _on: input.on,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_d, input) => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["product-direct-star", companyId, productId] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-card-preference", companyId, productId] }),
      ]);
      toast.success(input.on ? "Stella aggiunta" : "Stella tolta");
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

  const busy = saveMutation.isPending || statusMutation.isPending || priorityMutation.isPending || matchMutation.isPending || starMutation.isPending;
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
  const hasFieldErrors = false;

  const fieldsFor = (_mode: "create" | "update") => (
    <div className="mt-3 space-y-1">
      <Label className="text-xs">Codice articolo presso il fornitore</Label>
      <Input value={draft.supplierProductCode} disabled={busy} onChange={event => setDraft(current => ({ ...current, supplierProductCode: event.target.value }))} />
    </div>
  );

  return (
    <section aria-labelledby="product-suppliers-title" className="border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="product-suppliers-title" className="text-sm font-semibold">Fornitori</h3>
        <Badge variant="secondary" className="shrink-0">{editable ? "Modificabili" : "Sola lettura"}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={directOpen || directStarred} onClick={() => setDirectOpen(true)}>
          <ShoppingBag aria-hidden="true" />Acquisto diretto
        </Button>
      </div>

      {directOpen || directStarred ? (
        <article className="mt-2 rounded-md border border-accent bg-accent/10 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-2">
              <h4 className="flex items-start gap-2 text-sm font-semibold">
                <button type="button" className="mt-0.5 shrink-0 disabled:opacity-60" disabled={!editable || busy}
                  aria-label={directStarred ? "Acquisto diretto: togli la stella" : "Metti la stella all'acquisto diretto"}
                  title={directStarred ? "Destinazione abituale (tocca per togliere)" : "Aggiungi la stella: destinazione abituale"}
                  onClick={() => starMutation.mutate({ linkId: null, on: !directStarred })}>
                  <Star className={directStarred ? "size-4 fill-primary text-primary" : "size-4 text-muted-foreground"} aria-hidden="true" />
                </button>
                <ShoppingBag className="mt-0.5 size-4 shrink-0" />Acquisto diretto — compro io
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Acquisto personale</Badge>
                {directStarred ? <Badge>Con la stella: proposto nella Lista</Badge> : null}
              </div>
            </div>
            <Button type="button" size="icon" variant="ghost" title="Togli acquisto diretto" aria-label="Togli acquisto diretto" disabled={busy}
              onClick={() => { setDirectOpen(false); if (directStarred) starMutation.mutate({ linkId: null, on: false }); }}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            <Label className="text-xs">U.M. con cui acquisti direttamente</Label>
            {configuredUnits.length ? (
              <div className="flex flex-wrap gap-2">
                {configuredUnits.map((unit) => {
                  const on = directSelected.has(unit.id);
                  return (
                    <Button
                      key={unit.id}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      title={`${unit.code} — ${unit.description}`}
                      aria-pressed={on}
                      disabled
                    >
                      {unit.code}{ownUnitsQuery.data?.find((u) => u.unit_id === unit.id)?.is_default ? " ★" : ""}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna U.M. di acquisto impostata.</p>
            )}
            <p className="text-xs text-muted-foreground">U.M. di acquisto del prodotto</p>
          </div>
        </article>
      ) : null}

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
        {inactiveLinks.length ? (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? "Nascondi disattivati" : `Mostra disattivati (${inactiveLinks.length})`}
            </Button>
          </div>
        ) : null}
        {visibleLinks.map((row) => {
          const purchaseChoices = sharedPurchaseUnitChoices(row.purchase_units ?? [], sharedUnitsQuery.data ?? [], productId, row.b2b_relation_status === "attivo");
          const isSelected = row.link_id === selectedLinkId;
          const label = linkedLabel(row.b2b_relation_status);
          return (
            <div key={row.link_id} className={`rounded-md border p-3 ${isSelected ? "border-primary" : "border-border"}`}>
              <Button type="button" variant="ghost" className="block h-auto w-full whitespace-normal px-0 text-left hover:bg-transparent" aria-expanded={isSelected} onClick={() => setSelectedLinkId(isSelected ? null : row.link_id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    role="button"
                    tabIndex={editable && row.is_active ? 0 : -1}
                    aria-disabled={!editable || !row.is_active || busy}
                    aria-label={row.is_preferred ? `${row.supplier_name}: togli la stella` : `Metti la stella a ${row.supplier_name}`}
                    title={row.is_preferred ? "Destinazione abituale (tocca per togliere)" : "Aggiungi la stella: destinazione abituale"}
                    className="shrink-0"
                    onClick={(event) => { event.stopPropagation(); if (editable && row.is_active && !busy) starMutation.mutate({ linkId: row.link_id, on: !row.is_preferred }); }}
                    onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && editable && row.is_active && !busy) { event.preventDefault(); event.stopPropagation(); starMutation.mutate({ linkId: row.link_id, on: !row.is_preferred }); } }}
                  >
                    <Star className={row.is_preferred ? "size-4 fill-primary text-primary" : "size-4 text-muted-foreground"} aria-hidden="true" />
                  </span>
                  <Truck aria-hidden="true" className="size-4 text-muted-foreground" />
                  <strong className="text-sm">{row.supplier_name}</strong>
                  {!row.is_active ? <Badge variant="outline">Disattivato</Badge> : null}
                  {label ? <Badge variant="secondary"><Link2 aria-hidden="true" />{label}</Badge> : null}
                  {deliveries[row.link_id] ? <DeliveryHintBadge schedule={deliveries[row.link_id]!.schedule} /> : null}
                </div>
                <p className="mt-2 text-xs font-normal leading-relaxed text-muted-foreground">
                  {deliveries[row.link_id] ? deliveryScheduleSummary(deliveries[row.link_id]) : "Consegna: caricamento giorni…"}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div><dt className="text-muted-foreground">Cod. fornitore</dt><dd className="font-mono">{row.supplier_product_code ?? "—"}</dd></div>
                  {b2bItemsQuery.data?.[row.link_id] ? (
                    <div className="col-span-2"><dt className="text-muted-foreground">Articolo B2B collegato</dt><dd><span className="font-mono">{b2bItemsQuery.data[row.link_id]!.code}</span> · {b2bItemsQuery.data[row.link_id]!.description ?? "—"}</dd></div>
                  ) : null}
                  <div><dt className="text-muted-foreground">U.M. acquistabili</dt><dd>{purchaseChoices.length ? purchaseChoices.map((unit) => `${unit.code}${unit.is_default ? " ★" : ""}`).join(" · ") : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Costo Danea</dt><dd>{row.danea_net_cost !== null ? `${euro(row.danea_net_cost)} · ${dateTime(row.danea_cost_at)}` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Origine</dt><dd>{row.origin === "danea" ? "Danea" : "Manuale"}</dd></div>
                </dl>
              </Button>

              {isSelected && editable ? (
                <div className="mt-3 border-t border-border pt-3">
                  <PurchaseUnitsEditor
                    companyId={companyId}
                    linkId={row.link_id}
                    productId={productId}
                    assigned={row.purchase_units ?? []}
                    isB2B={row.b2b_relation_status === "attivo"}
                    units={units}
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
                    {row.is_active ? (
                      <>
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setUnlinkTarget({ linkId: row.link_id, name: row.supplier_name ?? "fornitore", kind: "deactivate" })}>Disattiva</Button>
                        <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => setUnlinkTarget({ linkId: row.link_id, name: row.supplier_name ?? "fornitore", kind: "unlink" })}><Trash2 aria-hidden="true" />Scollega dal prodotto</Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => statusMutation.mutate({ linkId: row.link_id, action: "activate" })}>Riattiva</Button>
                    )}
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
      <AlertDialog open={unlinkTarget !== null} onOpenChange={(open) => { if (!open && !unlinkMutation.isPending) setUnlinkTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{unlinkTarget?.kind === "unlink" ? "Scollegare il fornitore dal prodotto?" : "Disattivare il fornitore?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinkTarget?.name} non sarà più proposto per questo prodotto. Se è scelto in una Lista della Spesa aperta, lo tolgo da quel prodotto della Lista.
              Ordini e storico restano invariati; potrai riattivarlo da «Mostra disattivati». Con una Lista confermata o una quota già in ordine non viene modificato nulla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={unlinkMutation.isPending} onClick={(event) => { event.preventDefault(); if (unlinkTarget) unlinkMutation.mutate(unlinkTarget.linkId); }}>
              {unlinkTarget?.kind === "unlink" ? "Scollega" : "Disattiva"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        ...(input.inherit ? {} : { _weekdays: input.schedule.weekdays }),
        ...(!input.inherit && input.schedule.monthDay !== null ? { _month_day: input.schedule.monthDay } : {}),
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
export function PurchaseUnitsEditor({ companyId, productId, linkId, assigned, units, disabled, onChanged, isB2B = true }: {
  companyId: string; productId: string; linkId: string; assigned: PurchaseUnit[];
  units: CompanyUnit[]; disabled: boolean; onChanged: () => Promise<void>;
  isB2B?: boolean;
}) {
  const shared = useQuery(companyProductPurchaseUnitsOptions(companyId));
  const inherited = sharedPurchaseUnitChoices(assigned, shared.data ?? [], productId, isB2B)
    .filter(u => !assigned.some(a => a.is_active && a.unit_id === u.unit_id));
  const mutation = useMutation({
    mutationFn: async (input: {unitId:string; action:"remove"|"set_default"|"clear_default"}) => {
      const {error}=await supabase.rpc("manage_product_supplier_link_unit",{_company_id:companyId,_link_id:linkId,_unit_id:input.unitId,_action:input.action});
      if(error) throw new Error(error.message);
    }, onSuccess: async()=>{await onChanged();toast.success("U.M. aggiornata");}, onError:(e:Error)=>toast.error(e.message)
  });
  return <div className="space-y-2">
    <Label>U.M. usate</Label>
    {inherited.map(u => <div key={u.unit_id} className="flex items-center gap-2 border-b border-border py-2"><span className="font-medium">{u.code}</span>{u.is_default ? <Star className="size-4 fill-primary text-primary" aria-label="U.M. preferita del prodotto" /> : null}<Badge variant="secondary">Del prodotto</Badge></div>)}
    {assigned.filter(u=>u.is_active).sort((a,b)=>Number(b.is_default)-Number(a.is_default)||a.code.localeCompare(b.code,"it")).map(u=><div key={u.id} className="border-b border-border py-2">
      <div className="flex items-center gap-2"><span className="font-medium">{u.code}</span>
        <Button size="icon" variant="ghost" aria-label={`${u.is_default?"Togli":"Metti"} stella U.M. ${u.code}`} disabled={disabled||mutation.isPending} onClick={()=>mutation.mutate({unitId:u.unit_id,action:u.is_default?"clear_default":"set_default"})}><Star className={u.is_default?"fill-current":""}/></Button>
        <Button size="icon" variant="ghost" aria-label={`Rimuovi U.M. ${u.code}`} disabled={disabled||mutation.isPending} onClick={()=>mutation.mutate({unitId:u.unit_id,action:"remove"})}><Trash2/></Button>
      </div>
      <SupplierConversionsSection productId={productId} units={units} editable={!disabled} linkUnitId={u.id}/>
    </div>)}
    {!assigned.some(u=>u.is_active)&&!inherited.length?<p className="text-sm text-muted-foreground">Nessuna U.M. impostata per questa referenza.</p>:null}
  </div>;
}
