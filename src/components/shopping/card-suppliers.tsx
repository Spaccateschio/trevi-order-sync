import { ALL_VISIBLE, type DisplayPrefs } from "./card-display";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { RowSupplier } from "./use-shopping-list-extras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity, qty } from "@/lib/inventory";
import { euro } from "@/lib/product-grid";
import type { OverviewRow } from "@/lib/shopping-list";
import { assignShoppingListSupplier } from "@/lib/shopping-list.functions";

/**
 * Sezione FORNITORI della card: solo presentazione + la stessa regola di salvataggio della finestra
 * «Fornitori e ripartizione» (assignShoppingListSupplier). Nessuna logica nuova di U.M. o conversione:
 * per le righe in Lista le U.M. arrivano da shopping_item_supplier_units (regole B2B/non B2B del database).
 */

type Unit = { unitId: string; code: string; conversionFactor: number | null; conversionType: string | null };
type CardSupplier = {
  linkId: string;
  supplierRecordId: string;
  name: string;
  isB2B: boolean;
  sourceLinked: boolean;
  allowManual: boolean;
  minQuantity: number | null;
  units: Unit[];
  price: { net: number | null; gross: number | null; unitCode: string | null } | null;
};

type OverviewRead = {
  link_id: string;
  supplier_record_id: string;
  supplier_name: string;
  min_quantity: number | null;
  is_active: boolean;
  purchase_units: { unit_id: string; code: string; is_active: boolean; conversion_factor: number | null; conversion_type: string | null }[] | null;
};
type LinkUnitsRead = {
  link_id: string;
  is_b2b: boolean;
  source_linked: boolean;
  allow_manual: boolean;
  units: { unit_id: string; code: string; conversion_factor: number | null; conversion_type: string | null }[];
};

const MANUAL = "__manuale__";

function useCardSuppliers(companyId: string, row: OverviewRow, pending: boolean) {
  const productId = row.product_id;

  const overview = useQuery({
    queryKey: ["product-supplier-overview", productId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_supplier_overview", { _product_id: productId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as OverviewRead[]).filter((s) => s.is_active);
    },
  });

  const relations = useQuery({
    queryKey: ["shopping-card-relations", companyId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_customer_relations")
        .select("supplier_record_id, seller_company_id")
        .eq("buyer_company_id", companyId)
        .eq("status", "attivo")
        .not("supplier_record_id", "is", null);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((r) => [r.supplier_record_id as string, r.seller_company_id as string]));
    },
  });

  // Prodotto originale del venditore (collegamento B2B): mai dedotto da nome o codice.
  const source = useQuery({
    queryKey: ["shopping-card-source", productId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("created_from_product_id, created_from_company_id")
        .eq("id", productId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const sourceId = (data?.created_from_product_id as string | null) ?? null;
      let priceUnitCode: string | null = null;
      if (sourceId) {
        const { data: src } = await supabase.from("products").select("price_unit_id").eq("id", sourceId).maybeSingle();
        const unitId = (src?.price_unit_id as string | null) ?? null;
        if (unitId) {
          const { data: um } = await supabase.from("units_of_measure").select("code").eq("id", unitId).maybeSingle();
          priceUnitCode = (um?.code as string | null) ?? null;
        }
      }
      return { sourceId, sellerId: (data?.created_from_company_id as string | null) ?? null, priceUnitCode };
    },
  });

  // Righe in Lista: U.M. decise dal database (stessa lettura della finestra).
  const linkUnits = useQuery({
    queryKey: ["shopping-item-supplier-units", row.item_id],
    enabled: !pending,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shopping_item_supplier_units", { _item_id: row.item_id });
      if (error) throw new Error(error.message);
      return Object.fromEntries(((data ?? []) as unknown as LinkUnitsRead[]).map((r) => [r.link_id, r]));
    },
  });

  // «Da valutare»: U.M. pubblicate dal venditore, solo lettura (il salvataggio avviene dopo Conferma).
  const sellerId = source.data?.sellerId ?? null;
  const sourceId = source.data?.sourceId ?? null;
  const publishedUnits = useQuery({
    queryKey: ["shopping-card-published-units", sourceId],
    enabled: pending && Boolean(sourceId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sale_units")
        .select("unit_id, is_default, units_of_measure(code)")
        .eq("product_id", sourceId!)
        .eq("is_active", true)
        .eq("is_customer_visible", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((u) => ({
        unitId: u.unit_id as string,
        code: ((u.units_of_measure as { code: string } | null)?.code ?? "") as string,
        conversionFactor: null,
        conversionType: null,
      }));
    },
  });

  const price = useQuery({
    queryKey: ["shopping-card-b2b-price", sellerId, sourceId],
    enabled: Boolean(sellerId && sourceId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buyer_catalog_prices", { _seller_company_id: sellerId!, _product_ids: [sourceId!] });
      if (error) throw new Error(error.message);
      const hit = (data ?? [])[0];
      return hit ? { net: hit.net_price === null ? null : Number(hit.net_price), gross: hit.gross_price === null ? null : Number(hit.gross_price) } : null;
    },
  });

  const unitIds = [
    ...new Set(
      [
        ...Object.values(linkUnits.data ?? {}).flatMap((l) => l.units.map((u) => u.unit_id)),
        ...(publishedUnits.data ?? []).map((u) => u.unitId),
        ...(overview.data ?? []).flatMap((s) => (s.purchase_units ?? []).map((u) => u.unit_id)),
      ].filter(Boolean),
    ),
  ].sort();
  const descriptions = useQuery({
    queryKey: ["uom-descriptions", unitIds],
    enabled: unitIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("units_of_measure").select("id, description").in("id", unitIds);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((u) => [u.id as string, (u.description as string | null) ?? null]));
    },
  });

  const suppliers: CardSupplier[] = (overview.data ?? []).map((s) => {
    const seller = relations.data?.get(s.supplier_record_id) ?? null;
    const dbUnits = linkUnits.data?.[s.link_id];
    const isB2B = dbUnits ? dbUnits.is_b2b : Boolean(seller);
    const sourceLinked = dbUnits ? dbUnits.source_linked : Boolean(seller && sourceId && sellerId === seller);
    const units: Unit[] = dbUnits
      ? dbUnits.units.map((u) => ({ unitId: u.unit_id, code: u.code, conversionFactor: u.conversion_factor, conversionType: u.conversion_type }))
      : isB2B
        ? sourceLinked
          ? (publishedUnits.data ?? [])
          : []
        : (s.purchase_units ?? [])
            .filter((u) => u.is_active)
            .map((u) => ({ unitId: u.unit_id, code: u.code, conversionFactor: u.conversion_factor, conversionType: u.conversion_type }));
    return {
      linkId: s.link_id,
      supplierRecordId: s.supplier_record_id,
      name: s.supplier_name,
      isB2B,
      sourceLinked,
      allowManual: dbUnits ? dbUnits.allow_manual : !isB2B,
      minQuantity: s.min_quantity === null ? null : Number(s.min_quantity),
      units,
      price:
        isB2B && sourceLinked && price.data
          ? { ...price.data, unitCode: source.data?.priceUnitCode ?? null }
          : null,
    };
  });

  const label = (unit: { unitId: string; code: string }) => {
    const description = descriptions.data?.get(unit.unitId);
    if (!description || description.trim().toLowerCase() === unit.code.trim().toLowerCase()) return unit.code;
    return `${description.charAt(0).toUpperCase()}${description.slice(1).toLowerCase()} (${unit.code})`;
  };

  return { suppliers, loading: overview.isLoading, label };
}

function B2BBadge() {
  return <span className="shrink-0 rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold leading-4">B2B</span>;
}

function PriceLine({ price }: { price: NonNullable<CardSupplier["price"]> }) {
  const base = price.unitCode ? ` / ${price.unitCode}` : "";
  const parts: string[] = [];
  if (price.net !== null) parts.push(`${euro(price.net)}${base}${price.gross !== null ? " netto" : ""}`);
  if (price.gross !== null) parts.push(`${euro(price.gross)}${base} lordo`);
  if (!parts.length) return null;
  return (
    <p className="text-[11px] leading-tight">
      <span className="font-semibold">{parts.join(" · ")}</span>
      {price.unitCode ? null : <span className="text-muted-foreground"> · U.M. prezzo non indicata</span>}
    </p>
  );
}

type Draft = { unit: string; manual: string; quantity: string; accepted: boolean };

export function CardSuppliers({
  companyId,
  row,
  pending,
  editable,
  assignments,
  show = ALL_VISIBLE,
}: {
  companyId: string;
  row: OverviewRow;
  pending: boolean;
  editable: boolean;
  assignments: RowSupplier[];
  /** Solo visualizzazione: non cambia salvataggi né regole. */
  show?: DisplayPrefs;
}) {
  const queryClient = useQueryClient();
  const runAssign = useServerFn(assignShoppingListSupplier);
  const { suppliers, loading, label } = useCardSuppliers(companyId, row, pending);
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<{ id: string; quantity: string } | null>(null);
  const unit = row.unit_code ?? "";

  const mutation = useMutation({
    mutationFn: (input: {
      action: "set" | "remove";
      linkId: string;
      packs: number | null;
      accepted: boolean;
      unitId: string | null;
      manualUnitCode: string | null;
      assignmentId: string | null;
    }) =>
      runAssign({
        data: {
          companyId,
          itemId: row.item_id,
          action: input.action,
          linkId: input.linkId,
          assignedQuantity: null,
          purchaseQuantity: input.packs,
          minWarningAccepted: input.accepted,
          notes: null,
          purchaseUnitId: input.unitId,
          assignmentId: input.assignmentId,
          manualUnitCode: input.manualUnitCode,
        },
      }),
    onSuccess: async (_data, input) => {
      setDrafts((current) => ({ ...current, [input.linkId]: { unit: "", manual: "", quantity: "", accepted: false } }));
      setEditing(null);
      setAdding(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping-list-assignments", row.item_id] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-assignments"] }),
      ]);
      toast.success(input.action === "remove" ? "Ripartizione tolta" : "Ripartizione salvata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canWrite = editable && !pending;

  if (loading) return <p className="text-xs text-muted-foreground">Caricamento fornitori…</p>;

  const savedLine = (a: RowSupplier) => {
    const isEditing = editing?.id === a.id;
    const packs = isEditing ? parseQuantity(editing.quantity) : null;
    return (
      <li key={a.id} className="space-y-1 rounded-sm bg-muted/40 px-1.5 py-1">
        <div className="flex min-w-0 items-center gap-1 text-xs">
          <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
          {show.b2b && a.isB2B ? <B2BBadge /> : null}
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-20 text-right"
              inputMode="decimal"
              autoFocus
              value={editing.quantity}
              aria-label={`Quantità ${a.name}`}
              onChange={(e) => setEditing({ id: a.id, quantity: e.target.value })}
            />
            <span className="text-xs font-semibold">{a.purchaseUnitCode ?? unit}</span>
            <Button
              type="button"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={mutation.isPending || !packs || packs <= 0}
              onClick={() =>
                mutation.mutate({
                  action: "set",
                  linkId: a.linkId,
                  packs,
                  accepted: true,
                  unitId: a.purchaseUnitId,
                  manualUnitCode: a.purchaseUnitId ? null : a.purchaseUnitCode,
                  assignmentId: a.id,
                })
              }
            >
              Salva
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 w-8 px-0" aria-label="Annulla modifica" onClick={() => setEditing(null)}>
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-1 text-xs">
            <span className="font-bold">
              {a.purchaseQuantity !== null ? `${qty(a.purchaseQuantity)} ${a.purchaseUnitCode ?? ""}` : `${a.quantity === null ? "—" : qty(a.quantity)} ${unit}`}
            </span>
            {!show.conversion ? null : a.quantity === null ? (
              <span className="text-[11px] font-semibold text-destructive">· Non convertibile</span>
            ) : a.purchaseUnitCode && a.purchaseUnitCode !== unit ? (
              <span className="text-[11px] text-muted-foreground">≈ {qty(a.quantity)} {unit}</span>
            ) : null}
            {canWrite ? (
              <span className="ml-auto flex items-center">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-1.5 text-[11px]"
                  disabled={mutation.isPending || a.purchaseQuantity === null}
                  onClick={() => setEditing({ id: a.id, quantity: a.purchaseQuantity === null ? "" : String(a.purchaseQuantity) })}
                >
                  <Pencil className="size-3" aria-hidden="true" /> Modifica
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-1.5 text-[11px] text-destructive"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ action: "remove", linkId: a.linkId, packs: null, accepted: false, unitId: null, manualUnitCode: null, assignmentId: a.id })
                  }
                >
                  <Trash2 className="size-3" aria-hidden="true" /> Togli
                </Button>
              </span>
            ) : null}
          </div>
        )}
      </li>
    );
  };

  const supplierBlock = (s: CardSupplier) => {
    const draft = drafts[s.linkId] ?? { unit: "", manual: "", quantity: "", accepted: false };
    const set = (patch: Partial<Draft>) => setDrafts((c) => ({ ...c, [s.linkId]: { ...draft, ...patch } }));
    const b2bBlocked = s.isB2B && !s.sourceLinked;
    const noUnits = s.isB2B && s.sourceLinked && !s.units.length;
    const single = s.units.length === 1 && !s.allowManual;
    const unitValue = single ? s.units[0]!.unitId : draft.unit;
    const isManual = unitValue === MANUAL;
    const chosen = s.units.find((u) => u.unitId === unitValue) ?? null;
    const packs = parseQuantity(draft.quantity);
    const code = isManual ? draft.manual.trim().toUpperCase() : chosen?.code ?? "";
    const equivalent = chosen?.conversionFactor && packs ? packs * Number(chosen.conversionFactor) : null;
    const belowMin = s.minQuantity !== null && equivalent !== null && equivalent < s.minQuantity;
    const canSave =
      canWrite && !mutation.isPending && !b2bBlocked && (packs ?? 0) > 0 && (isManual ? code.length > 0 : Boolean(chosen)) && (!belowMin || draft.accepted);

    return (
      <li key={s.linkId} className="space-y-1 rounded-sm border border-border px-1.5 py-1">
        <div className="flex min-w-0 items-center gap-1 text-xs">
          <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
          {show.b2b && s.isB2B ? <B2BBadge /> : null}
        </div>
        {show.price && s.price ? <PriceLine price={s.price} /> : null}
        {b2bBlocked ? (
          <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertTriangle className="size-3" aria-hidden="true" /> Prodotto del fornitore non collegato: U.M. non disponibili
          </p>
        ) : noUnits ? (
          <p className="text-[11px] font-medium text-destructive">U.M. acquisto non pubblicate dal venditore</p>
        ) : show.purchaseUnit && (s.units.length || s.allowManual) ? (
          <p className="text-[11px] leading-tight text-muted-foreground">
            Acquisto in: <span className="font-medium text-foreground">{s.units.map(label).join(" · ") || "—"}</span>
            {s.allowManual ? " · Altra U.M." : ""}
          </p>
        ) : null}

        {canWrite && !b2bBlocked && !noUnits ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <Input
                className="h-8 w-16 text-right"
                inputMode="decimal"
                placeholder="Qtà"
                value={draft.quantity}
                aria-label={`Quantità ${s.name}`}
                onChange={(e) => set({ quantity: e.target.value })}
              />
              {single ? (
                <span className="text-xs font-semibold">{label(s.units[0]!)}</span>
              ) : (
                <Select value={draft.unit} onValueChange={(value) => set({ unit: value })}>
                  <SelectTrigger className="h-8 w-auto min-w-24 max-w-40 text-xs" aria-label={`U.M. ${s.name}`}>
                    <SelectValue placeholder="U.M." />
                  </SelectTrigger>
                  <SelectContent>
                    {s.units.map((u) => (
                      <SelectItem key={u.unitId} value={u.unitId}>{label(u)}</SelectItem>
                    ))}
                    {s.allowManual ? <SelectItem value={MANUAL}>Altra U.M.</SelectItem> : null}
                  </SelectContent>
                </Select>
              )}
              {isManual ? (
                <Input
                  className="h-8 w-24 uppercase"
                  maxLength={20}
                  placeholder="es. PEDANE"
                  value={draft.manual}
                  aria-label={`Altra U.M. ${s.name}`}
                  onChange={(e) => set({ manual: e.target.value })}
                />
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={!canSave}
                onClick={() =>
                  mutation.mutate({
                    action: "set",
                    linkId: s.linkId,
                    packs,
                    accepted: belowMin ? draft.accepted : false,
                    unitId: isManual ? null : chosen?.unitId ?? null,
                    manualUnitCode: isManual ? draft.manual : null,
                    assignmentId: null,
                  })
                }
              >
                Salva
              </Button>
            </div>
            {show.conversion && packs && (chosen || (isManual && code)) ? (
              <p className="text-[11px] text-muted-foreground">
                {qty(packs)} {code}{" "}
                {equivalent !== null ? (
                  <>
                    {chosen?.conversionType === "esatta" ? "=" : "≈"} {qty(Number(equivalent.toFixed(3)))} {unit}
                  </>
                ) : (
                  <span className="font-semibold text-destructive">· Non convertibile</span>
                )}
              </p>
            ) : null}
            {belowMin ? (
              <label className="flex items-center gap-1.5 text-[11px] text-destructive">
                <input type="checkbox" checked={draft.accepted} onChange={(e) => set({ accepted: e.target.checked })} />
                Sotto il minimo ({qty(s.minQuantity)} {unit}): procedo comunque
              </label>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  if (!suppliers.length && !assignments.length) return <p className="text-xs font-medium">Fornitore da definire</p>;

  const showAvailable = !assignments.length || adding;
  return (
    <div className="space-y-1">
      {assignments.length && show.splits ? <ul className="space-y-1">{assignments.map(savedLine)}</ul> : null}
      {showAvailable ? <ul className="space-y-1">{suppliers.map(supplierBlock)}</ul> : null}
      {pending && suppliers.length ? (
        <p className="text-[11px] text-muted-foreground">La ripartizione si salva dopo «Conferma».</p>
      ) : null}
      {canWrite && assignments.length && suppliers.length ? (
        <Button type="button" size="sm" variant="outline" className="h-8 w-full px-2 text-xs" onClick={() => setAdding((v) => !v)}>
          {adding ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {adding ? "Chiudi" : "Aggiungi altro fornitore"}
        </Button>
      ) : null}
    </div>
  );
}
