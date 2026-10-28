import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Search, Star } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, euro } from "@/lib/product-grid";
import { fetchDaneaArchives } from "@/lib/price-lists";
import { supplierLinkPatch } from "@/lib/supplier-link-patch";
import { PurchaseUnitsEditor } from "./product-suppliers-manager";
import { StockPackagesSection } from "./stock-unit-config";
import type { CompanyUnit } from "./sales-unit-manager";

/**
 * Vista inversa Fornitore → Prodotti forniti.
 * Legge esclusivamente product_supplier_links e scrive solo tramite le RPC
 * già esistenti (manage_product_supplier_link / set_preferred_product_supplier).
 */

type LinkRow = {
  id: string;
  product_id: string;
  supplier_product_code: string | null;
  purchase_unit_id: string | null;
  /** U.M. del prezzo del costo concordato: conservata così com'è quando si salva da qui. */
  price_unit_id: string | null;
  conversion_factor: number | null;
  conversion_reference_um: string | null;
  manual_cost: number | null;
  manual_cost_at: string | null;
  min_quantity: number | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  sourcing_priority: number | null;
  supplier_reference_label: string | null;
  is_active: boolean;
  notes: string | null;
  origin: "manuale" | "danea";
  products: { code: string; description: string | null; archive_id: string | null; danea_um: string | null } | null;
  units_of_measure: { code: string } | null;
  product_supplier_link_units: { id: string; unit_id:string; is_active:boolean; is_default: boolean; units_of_measure: { code: string } | null }[] | null;
};

/** Elenco delle U.M. con cui si può acquistare la referenza (★ = predefinita, facoltativa). */
function purchaseUnitsLabel(row: LinkRow) {
  const codes = (row.product_supplier_link_units ?? [])
    .slice()
    .sort((a, b) => Number(b.is_default) - Number(a.is_default))
    .map((unit) => `${unit.units_of_measure?.code ?? "—"}${unit.is_default ? " ★" : ""}`);
  return codes.length ? codes.join(" · ") : "—";
}

/** Colonne ordinabili della tabella «Prodotti forniti» (clic sull'intestazione). */
type SortKey =
  | "code"
  | "descrizione"
  | "archivio"
  | "cod_fornitore"
  | "um"
  | "costo_danea"
  | "costo_trevi"
  | "qtamin"
  | "consegna"
  | "stato";

const NUMERIC_SORT_KEYS: readonly SortKey[] = ["costo_danea", "costo_trevi", "qtamin", "consegna"];

type ProductOption = {
  id: string;
  code: string;
  description: string | null;
  archive_id: string | null;
};

const EMPTY_DRAFT = {
  supplierProductCode: "",
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

export function SupplierProductsManager({
  companyId,
  supplierRecordId,
  supplierArchiveId,
  isAdmin,
}: {
  companyId: string;
  supplierRecordId: string;
  supplierArchiveId: string | null;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"tutti" | "attivi" | "non_attivi" | "preferiti">("tutti");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [addOpen, setAddOpen] = useState(false);
  const [addTerm, setAddTerm] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const linksQuery = useQuery({
    queryKey: ["supplier-product-links", supplierRecordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select(
          "id, product_id, supplier_product_code, purchase_unit_id, price_unit_id, conversion_factor, conversion_reference_um, manual_cost, manual_cost_at, min_quantity, lead_time_days, is_preferred, sourcing_priority, supplier_reference_label, is_active, notes, origin, products!product_supplier_links_product_id_fkey(code, description, archive_id, danea_um), units_of_measure!product_supplier_links_purchase_unit_id_fkey(code), product_supplier_link_units(id, unit_id, is_active, is_default, units_of_measure!product_supplier_link_units_unit_id_fkey(code))",
        )
        .eq("supplier_record_id", supplierRecordId);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LinkRow[];
    },
  });

  const rows = linksQuery.data ?? [];
  const productIds = rows.map((row) => row.product_id);

  const costsQuery = useQuery({
    queryKey: ["supplier-product-danea-costs", supplierRecordId, productIds.length],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_supplier_costs")
        .select("product_id, supplier_net_price, received_at")
        .in("product_id", productIds);
      return (data ?? []) as { product_id: string; supplier_net_price: number | null; received_at: string | null }[];
    },
  });

  const archivesQuery = useQuery({
    queryKey: ["danea-archives", companyId],
    queryFn: () => fetchDaneaArchives(companyId),
  });

  // U.M. dell'azienda: servono per mostrare e gestire le confezioni del prodotto
  // (archivio unico product_stock_packages, condiviso con la scheda prodotto).
  const unitsQuery = useQuery({
    queryKey: ["company-units", companyId],
    queryFn: async (): Promise<CompanyUnit[]> => {
      const { data, error } = await supabase
        .from("units_of_measure")
        .select("id, code, description, status")
        .eq("company_id", companyId)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as CompanyUnit[];
    },
  });


  const productsQuery = useQuery({
    queryKey: ["supplier-addable-products", companyId, supplierArchiveId],
    enabled: addOpen,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, code, description, archive_id")
        .eq("company_id", companyId)
        .order("code");
      if (supplierArchiveId) query = query.eq("archive_id", supplierArchiveId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductOption[];
    },
  });

  const archiveName = (archiveId: string | null) =>
    (archivesQuery.data ?? []).find((archive) => archive.id === archiveId)?.name ?? "—";

  const costByProduct = useMemo(
    () => new Map((costsQuery.data ?? []).map((row) => [row.product_id, row])),
    [costsQuery.data],
  );

  const sortValue = (row: LinkRow, key: SortKey): string | number | null => {
    switch (key) {
      case "code":
        return row.products?.code ?? "";
      case "descrizione":
        return row.products?.description ?? "";
      case "archivio":
        return archiveName(row.products?.archive_id ?? null);
      case "cod_fornitore":
        return row.supplier_product_code ?? "";
      case "um":
        return purchaseUnitsLabel(row);
      case "costo_danea":
        return costByProduct.get(row.product_id)?.supplier_net_price ?? null;
      case "costo_trevi":
        return row.manual_cost;
      case "qtamin":
        return row.min_quantity;
      case "consegna":
        return row.lead_time_days;
      case "stato":
        return row.is_active ? "attivo" : "non attivo";
    }
  };

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current && current.key === key ? (current.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 },
    );

  const sortIcon = (key: SortKey) => {
    if (!sort || sort.key !== key) return null;
    return sort.dir === 1 ? (
      <ArrowUp className="h-3 w-3" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden="true" />
    );
  };

  const ariaSort = (key: SortKey) =>
    sort && sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined;

  const open = rows.find((row) => row.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    setDraft({
      supplierProductCode: open.supplier_product_code ?? "",
      purchaseUnitId: open.purchase_unit_id ?? "",
      conversionFactor: open.conversion_factor?.toString() ?? "",
      manualCost: open.manual_cost?.toString() ?? "",
      minQuantity: open.min_quantity?.toString() ?? "",
      leadTimeDays: open.lead_time_days?.toString() ?? "",
      notes: open.notes ?? "",
    });
  }, [open]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["supplier-product-links", supplierRecordId] }),
      queryClient.invalidateQueries({ queryKey: ["product-supplier-links"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (row: LinkRow) => {
      const patch = supplierLinkPatch({supplier_product_code: row.supplier_product_code}, {supplier_product_code:draft.supplierProductCode.trim()||null});
      const { error } = await supabase.rpc("patch_product_supplier_link", { _link_id: row.id, _patch: patch });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Associazione aggiornata");
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
      await refresh();
      toast.success("Stato aggiornato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preferredMutation = useMutation({
    mutationFn: async (input: { linkId: string; priority: number | null }) => {
      const { error } = await supabase.rpc("toggle_product_destination_star", {
        _company_id:companyId, _product_id:rows.find(r=>r.id===input.linkId)?.product_id ?? "", _link_id:input.linkId, _direct:false, _on:input.priority!==null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Stella aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const productId of ids) {
        const { error } = await supabase.rpc("manage_product_supplier_link", {
          _company_id: companyId,
          _action: "create",
          _product_id: productId,
          _supplier_record_id: supplierRecordId,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async (_data, ids) => {
      setAddOpen(false);
      setPicked(new Set());
      setAddTerm("");
      await refresh();
      toast.success(`${ids.length} prodott${ids.length === 1 ? "o" : "i"} associat${ids.length === 1 ? "o" : "i"}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    saveMutation.isPending || statusMutation.isPending || preferredMutation.isPending || addMutation.isPending;

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (statusFilter === "attivi" && !row.is_active) return false;
      if (statusFilter === "non_attivi" && row.is_active) return false;
      if (statusFilter === "preferiti" && !row.is_preferred) return false;
      if (!needle) return true;
      return (
        (row.products?.code ?? "").toLowerCase().includes(needle) ||
        (row.products?.description ?? "").toLowerCase().includes(needle) ||
        (row.supplier_product_code ?? "").toLowerCase().includes(needle)
      );
    });
    if (!sort) {
      return matched.sort((left, right) =>
        (left.products?.code ?? "").localeCompare(right.products?.code ?? "", "it"),
      );
    }
    const numeric = NUMERIC_SORT_KEYS.includes(sort.key);
    return matched.sort((left, right) => {
      const leftValue = sortValue(left, sort.key);
      const rightValue = sortValue(right, sort.key);
      let result: number;
      if (numeric) {
        const l = typeof leftValue === "number" ? leftValue : Number.POSITIVE_INFINITY;
        const r = typeof rightValue === "number" ? rightValue : Number.POSITIVE_INFINITY;
        result = l === r ? 0 : l < r ? -1 : 1;
      } else {
        result = String(leftValue).localeCompare(String(rightValue), "it");
      }
      return result * sort.dir;
    });
  }, [rows, statusFilter, term, sort, costByProduct, archivesQuery.data]);

  const addable = useMemo(() => {
    const linked = new Set(rows.map((row) => row.product_id));
    const needle = addTerm.trim().toLowerCase();
    return (productsQuery.data ?? []).filter((product) => {
      if (linked.has(product.id)) return false;
      if (!needle) return true;
      return (
        product.code.toLowerCase().includes(needle) || (product.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [addTerm, productsQuery.data, rows]);


  const costCell = (row: LinkRow) => {
    const cost = costByProduct.get(row.product_id);
    if (!cost || cost.supplier_net_price === null) return "—";
    return row.products?.danea_um ? `${euro(Number(cost.supplier_net_price))} / ${row.products.danea_um} · ${dateTime(cost.received_at)}` : "—";
  };

  const editor = (row: LinkRow) => (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Codice articolo presso il fornitore</Label>
          <Input
            value={draft.supplierProductCode}
            disabled={busy}
            onChange={(event) => setDraft((current) => ({ ...current, supplierProductCode: event.target.value }))}
          />
        </div>
        <div className="sm:col-span-2"><PurchaseUnitsEditor companyId={companyId} productId={row.product_id} linkId={row.id} assigned={(row.product_supplier_link_units ?? []).map(u=>({...u,unit_id:u.unit_id,code:u.units_of_measure?.code??"—",description:"",is_active:u.is_active,conversion_factor:null,conversion_type:"indicativa" as const}))} units={unitsQuery.data??[]} disabled={busy} onChanged={refresh}/></div>
      </div>
      <div className="border-t border-border pt-2">
        <StockPackagesSection
          productId={row.product_id}
          units={unitsQuery.data ?? []}
          editable={isAdmin}
          note="Le confezioni sono del prodotto: valgono per tutti i fornitori e sono le stesse che vedi nella scheda prodotto."
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => preferredMutation.mutate({ linkId: row.id, priority: !row.is_preferred ? 1 : null })}
        >
          <Star className={row.is_preferred ? "fill-current" : ""} aria-hidden="true" />
          {row.is_preferred ? "Togli stella" : "Stella fornitore"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => statusMutation.mutate({ linkId: row.id, action: row.is_active ? "deactivate" : "activate" })}
        >
          {row.is_active ? "Disattiva" : "Riattiva"}
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <Link to="/vendite/prodotti" search={{ prodotto: row.product_id }}>
            <ExternalLink aria-hidden="true" />
            Apri scheda prodotto
          </Link>
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => saveMutation.mutate(row)}>
          Salva
        </Button>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="supplier-products-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 id="supplier-products-title" className="text-sm font-semibold">
            Prodotti forniti
          </h3>
          <p className="text-xs text-muted-foreground">
            {linksQuery.isError ? "Associazioni non disponibili" : linksQuery.isPending ? "Caricamento associazioni…" : `${rows.length} associazion${rows.length === 1 ? "e" : "i"}`} · archivio fornitore:{" "}
            {supplierArchiveId ? archiveName(supplierArchiveId) : "fornitore manuale (nessun archivio)"}
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={linksQuery.isPending || linksQuery.isError} onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" />
            Aggiungi prodotti
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Cerca prodotti forniti"
            className="h-9 pl-8"
            placeholder="Codice o descrizione"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti</SelectItem>
            <SelectItem value="attivi">Solo attivi</SelectItem>
            <SelectItem value="non_attivi">Solo non attivi</SelectItem>
            <SelectItem value="preferiti">Solo preferiti</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {linksQuery.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border border-destructive/40 p-3 text-sm">
          <p>Impossibile caricare i prodotti associati. I collegamenti salvati non sono stati modificati.</p>
          <Button type="button" size="sm" variant="outline" disabled={linksQuery.isFetching} onClick={() => void linksQuery.refetch()}>
            Riprova
          </Button>
        </div>
      ) : null}

      {/* Desktop/tablet: tabella compatta */}
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50 text-left">
            <tr className="[&>th]:border-r [&>th]:border-border [&>th]:px-2 [&>th]:py-1.5 [&>th:last-child]:border-r-0">
              {(
                [
                  ["code", "Codice"],
                  ["descrizione", "Descrizione"],
                  ["archivio", "Archivio"],
                  ["cod_fornitore", "Cod. fornitore"],
                  ["um", "U.M. acquistabili"],
                  ["costo_danea", "Costo Danea"],
                  ["stato", "Stato"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} aria-sort={ariaSort(key)}>
                  <button type="button" className="flex items-center gap-1 text-left" onClick={() => toggleSort(key)}>
                    {label}
                    {sortIcon(key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className="cursor-pointer border-t border-border hover:bg-muted/40 [&>td]:border-r [&>td]:border-border [&>td]:px-2 [&>td]:py-1.5 [&>td:last-child]:border-r-0"
                  onClick={() => setOpenId(openId === row.id ? null : row.id)}
                >
                  <td className="font-mono">{row.products?.code ?? "—"}</td>
                  <td className="max-w-[18rem] truncate">{row.products?.description ?? "—"}</td>
                  <td>{archiveName(row.products?.archive_id ?? null)}</td>
                  <td className="font-mono">{row.supplier_product_code ?? "—"}</td>
                  <td>{purchaseUnitsLabel(row)}</td>
                  <td>{costCell(row)}</td>
                  <td className="whitespace-nowrap">
                    {row.is_preferred ? (
                      <Badge className="mr-1">
                        <Star className="fill-current" aria-hidden="true" />
                        Preferito
                      </Badge>
                    ) : null}
                    {row.is_active ? (
                      <Badge variant="secondary">Attivo</Badge>
                    ) : (
                      <Badge variant="outline">Non attivo</Badge>
                    )}
                  </td>
                </tr>
                {openId === row.id ? (
                  <tr key={`${row.id}-editor`} className="border-t border-border bg-muted/20">
                    <td colSpan={7} className="p-2">
                      {isAdmin ? editor(row) : <p className="text-xs text-muted-foreground">Sola lettura.</p>}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!linksQuery.isPending && !linksQuery.isError && !filtered.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Nessun prodotto associato a questo fornitore.</p>
        ) : null}
      </div>

      {/* Smartphone: schede touch */}
      <div className="space-y-2 sm:hidden">
        {filtered.map((row) => (
          <div key={row.id} className="rounded-lg border border-border p-3">
            <button
              type="button"
              className="w-full text-left"
              aria-expanded={openId === row.id}
              onClick={() => setOpenId(openId === row.id ? null : row.id)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{row.products?.code ?? "—"}</span>
                {row.is_preferred ? (
                  <Badge>
                    <Star className="fill-current" aria-hidden="true" />
                    Preferito
                  </Badge>
                ) : null}
                {!row.is_active ? <Badge variant="outline">Non attivo</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm font-medium">{row.products?.description ?? "—"}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <dt className="text-muted-foreground">Archivio</dt>
                  <dd>{archiveName(row.products?.archive_id ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cod. fornitore</dt>
                  <dd className="font-mono">{row.supplier_product_code ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">U.M. acquistabili</dt>
                  <dd>{purchaseUnitsLabel(row)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Costo Danea</dt>
                  <dd>{costCell(row)}</dd>
                </div>

              </dl>
            </button>
            {openId === row.id && isAdmin ? <div className="mt-3">{editor(row)}</div> : null}
          </div>
        ))}
        {!linksQuery.isPending && !linksQuery.isError && !filtered.length ? (
          <p className="text-xs text-muted-foreground">Nessun prodotto associato a questo fornitore.</p>
        ) : null}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aggiungi prodotti al fornitore</DialogTitle>
            <DialogDescription>
              Le U.M. del prodotto vengono ereditate dal nuovo collegamento.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Cerca prodotti da associare"
              className="h-9 pl-8"
              placeholder="Codice o descrizione"
              value={addTerm}
              onChange={(event) => setAddTerm(event.target.value)}
            />
          </div>

          <div className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {addable.map((product) => (
              <label key={product.id} className="flex items-center gap-2 px-2 py-2 text-sm">
                <Checkbox
                  checked={picked.has(product.id)}
                  onCheckedChange={(checked) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (checked) next.add(product.id);
                      else next.delete(product.id);
                      return next;
                    })
                  }
                />
                <span className="font-mono text-xs">{product.code}</span>
                <span className="min-w-0 flex-1 truncate">{product.description ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{archiveName(product.archive_id)}</span>
              </label>
            ))}
            {!addable.length ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Nessun prodotto disponibile per questo fornitore.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annulla
            </Button>
            <Button disabled={busy || !picked.size} onClick={() => addMutation.mutate(Array.from(picked))}>
              Associa {picked.size ? `(${picked.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
