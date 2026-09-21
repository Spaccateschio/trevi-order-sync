import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Plus, Search, Star } from "lucide-react";
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
};

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
          "id, product_id, supplier_product_code, purchase_unit_id, conversion_factor, conversion_reference_um, manual_cost, manual_cost_at, min_quantity, lead_time_days, is_preferred, sourcing_priority, supplier_reference_label, is_active, notes, origin, products(code, description, archive_id, danea_um), units_of_measure(code)",
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

  const unitsQuery = useQuery({
    queryKey: ["company-units", companyId],
    queryFn: async () => {
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
      const { error } = await supabase.rpc("manage_product_supplier_link", {
        _company_id: companyId,
        _action: "update",
        _link_id: row.id,
        _supplier_product_code: draft.supplierProductCode,
        ...(draft.purchaseUnitId ? { _purchase_unit_id: draft.purchaseUnitId } : {}),
        ...(num(draft.conversionFactor) !== null
          ? { _conversion_factor: num(draft.conversionFactor) as number }
          : {}),
        ...(row.products?.danea_um ? { _conversion_reference_um: row.products.danea_um } : {}),
        ...(num(draft.manualCost) !== null ? { _manual_cost: num(draft.manualCost) as number } : {}),
        ...(num(draft.minQuantity) !== null ? { _min_quantity: num(draft.minQuantity) as number } : {}),
        ...(num(draft.leadTimeDays) !== null ? { _lead_time_days: num(draft.leadTimeDays) as number } : {}),
        _notes: draft.notes,
      });
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
    return rows
      .filter((row) => {
        if (statusFilter === "attivi" && !row.is_active) return false;
        if (statusFilter === "non_attivi" && row.is_active) return false;
        if (statusFilter === "preferiti" && row.sourcing_priority === null) return false;
        if (!needle) return true;
        return (
          (row.products?.code ?? "").toLowerCase().includes(needle) ||
          (row.products?.description ?? "").toLowerCase().includes(needle) ||
          (row.supplier_product_code ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((left, right) => (left.products?.code ?? "").localeCompare(right.products?.code ?? "", "it"));
  }, [rows, statusFilter, term]);

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

  const activeUnits = (unitsQuery.data ?? []).filter((unit) => unit.status === "attivo");

  const costCell = (row: LinkRow) => {
    const cost = costByProduct.get(row.product_id);
    if (!cost || cost.supplier_net_price === null) return "—";
    return `${euro(Number(cost.supplier_net_price))} · ${dateTime(cost.received_at)}`;
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
        <div className="space-y-1">
          <Label className="text-xs">U.M. di acquisto</Label>
          <Select
            value={draft.purchaseUnitId || "nessuna"}
            disabled={busy}
            onValueChange={(value) =>
              setDraft((current) => ({ ...current, purchaseUnitId: value === "nessuna" ? "" : value }))
            }
          >
            <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nessuna">Nessuna</SelectItem>
              {activeUnits.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.code} · {unit.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            Conversione {row.products?.danea_um ? `(1 U.M. acquisto ≈ … ${row.products.danea_um})` : ""}
          </Label>
          <Input
            inputMode="decimal"
            value={draft.conversionFactor}
            disabled={busy}
            placeholder="Da inserire manualmente"
            onChange={(event) => setDraft((current) => ({ ...current, conversionFactor: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Costo manuale Trevi Fruit</Label>
          <Input
            inputMode="decimal"
            value={draft.manualCost}
            disabled={busy}
            placeholder="Nessuno"
            onChange={(event) => setDraft((current) => ({ ...current, manualCost: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quantità minima</Label>
          <Input
            inputMode="decimal"
            value={draft.minQuantity}
            disabled={busy}
            onChange={(event) => setDraft((current) => ({ ...current, minQuantity: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Giorni di consegna</Label>
          <Input
            inputMode="numeric"
            value={draft.leadTimeDays}
            disabled={busy}
            onChange={(event) => setDraft((current) => ({ ...current, leadTimeDays: event.target.value }))}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Note</Label>
          <Input
            value={draft.notes}
            disabled={busy}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => preferredMutation.mutate({ linkId: row.id, priority: row.sourcing_priority === null ? 1 : null })}
        >
          <Star className={row.sourcing_priority !== null ? "fill-current" : ""} aria-hidden="true" />
          {row.sourcing_priority !== null ? "Togli priorità" : "Priorità 1"}
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
            {rows.length} associazion{rows.length === 1 ? "e" : "i"} · archivio fornitore:{" "}
            {supplierArchiveId ? archiveName(supplierArchiveId) : "fornitore manuale (nessun archivio)"}
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
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

      {/* Desktop/tablet: tabella compatta */}
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50 text-left">
            <tr className="[&>th]:border-r [&>th]:border-border [&>th]:px-2 [&>th]:py-1.5 [&>th:last-child]:border-r-0">
              <th>Codice</th>
              <th>Descrizione</th>
              <th>Archivio</th>
              <th>Cod. fornitore</th>
              <th>U.M. acquisto</th>
              <th>Costo Danea</th>
              <th>Costo Trevi Fruit</th>
              <th>Q.tà min.</th>
              <th>Consegna</th>
              <th>Stato</th>
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
                  <td>
                    {row.units_of_measure?.code ?? "—"}
                    {row.conversion_factor
                      ? ` · 1 ≈ ${row.conversion_factor} ${row.conversion_reference_um ?? ""}`
                      : ""}
                  </td>
                  <td>{costCell(row)}</td>
                  <td>
                    {row.manual_cost !== null ? `${euro(Number(row.manual_cost))} · ${dateTime(row.manual_cost_at)}` : "—"}
                  </td>
                  <td>{row.min_quantity ?? "—"}</td>
                  <td>{row.lead_time_days !== null ? `${row.lead_time_days} gg` : "—"}</td>
                  <td className="whitespace-nowrap">
                    {row.sourcing_priority !== null ? (
                      <Badge className="mr-1">
                        <Star className="fill-current" aria-hidden="true" />
                        Priorità {row.sourcing_priority}
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
                    <td colSpan={10} className="p-2">
                      {isAdmin ? editor(row) : <p className="text-xs text-muted-foreground">Sola lettura.</p>}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!filtered.length ? (
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
                {row.sourcing_priority !== null ? (
                  <Badge>
                    <Star className="fill-current" aria-hidden="true" />
                    Priorità {row.sourcing_priority}
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
                  <dt className="text-muted-foreground">U.M. acquisto</dt>
                  <dd>
                    {row.units_of_measure?.code ?? "—"}
                    {row.conversion_factor
                      ? ` · 1 ≈ ${row.conversion_factor} ${row.conversion_reference_um ?? ""}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Costo Danea</dt>
                  <dd>{costCell(row)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Costo Trevi Fruit</dt>
                  <dd>
                    {row.manual_cost !== null
                      ? `${euro(Number(row.manual_cost))} · ${dateTime(row.manual_cost_at)}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Q.tà min. · consegna</dt>
                  <dd>
                    {row.min_quantity ?? "—"} · {row.lead_time_days !== null ? `${row.lead_time_days} gg` : "—"}
                  </dd>
                </div>
              </dl>
            </button>
            {openId === row.id && isAdmin ? <div className="mt-3">{editor(row)}</div> : null}
          </div>
        ))}
        {!filtered.length ? (
          <p className="text-xs text-muted-foreground">Nessun prodotto associato a questo fornitore.</p>
        ) : null}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aggiungi prodotti al fornitore</DialogTitle>
            <DialogDescription>
              Selezione multipla. Vengono create solo le associazioni: U.M., conversioni, costi, quantità minima e
              tempi restano da completare sulla singola riga.
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
