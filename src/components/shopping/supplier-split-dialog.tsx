import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DeliveryHintBadge } from "@/components/suppliers/delivery-days-picker";
import { supabase } from "@/integrations/supabase/client";
import { useDeliverySchedules } from "@/lib/use-delivery-schedules";
import { parseQuantity, qty } from "@/lib/inventory";
import { euro } from "@/lib/product-grid";
import { sharePercent, type AssignmentRow, type OverviewRow } from "@/lib/shopping-list";
import { assignShoppingListSupplier } from "@/lib/shopping-list.functions";

type SupplierOption = {
  link_id: string;
  supplier_record_id: string;
  supplier_name: string;
  min_quantity: number | null;
  lead_time_days: number | null;
  manual_cost: number | null;
  danea_net_cost: number | null;
  sourcing_priority: number | null;
  supplier_reference_label: string | null;
  is_active: boolean;
};

type UnitOption = {
  unit_id: string;
  code: string;
  is_default: boolean;
  conversion_factor: number | null;
  conversion_type: "esatta" | "indicativa" | null;
};

type LinkUnits = {
  link_id: string;
  is_b2b: boolean;
  source_linked: boolean;
  purchasable: boolean;
  allow_manual: boolean;
  units: UnitOption[];
};

const MANUAL = "__manuale__";

/** Nuova ripartizione in preparazione: U.M. sempre scelta esplicitamente (nessuna predefinita automatica). */
type Draft = { unit: string; manual: string; quantity: string; accepted: boolean };
const EMPTY: Draft = { unit: "", manual: "", quantity: "", accepted: false };

/**
 * Ripartizione della quantità tra fornitori. Ogni ripartizione = quantità + U.M. d'acquisto del fornitore.
 * B2B: solo U.M. pubblicate dal venditore. Non B2B: U.M. esistente oppure «Altra U.M.» (senza conversione).
 * La quantità totale della Lista non viene mai toccata.
 */
export function SupplierSplitDialog({
  companyId,
  item,
  open,
  onOpenChange,
  editable,
}: {
  companyId: string;
  item: OverviewRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable: boolean;
  b2bSupplierIds?: Set<string>;
}) {
  const queryClient = useQueryClient();
  const runAssign = useServerFn(assignShoppingListSupplier);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (!open) setDrafts({});
  }, [open]);

  const suppliersQuery = useQuery({
    queryKey: ["product-supplier-overview", item.product_id],
    enabled: open,
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data, error } = await supabase.rpc("product_supplier_overview", { _product_id: item.product_id });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SupplierOption[];
    },
  });

  const unitsQuery = useQuery({
    queryKey: ["shopping-item-supplier-units", item.item_id],
    enabled: open,
    queryFn: async (): Promise<Record<string, LinkUnits>> => {
      const { data, error } = await supabase.rpc("shopping_item_supplier_units", { _item_id: item.item_id });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as LinkUnits[];
      return Object.fromEntries(rows.map((row) => [row.link_id, row]));
    },
  });

  const deliveries = useDeliverySchedules(item.product_id, open).data ?? {};

  const assignmentsQuery = useQuery({
    queryKey: ["shopping-list-assignments", item.item_id],
    enabled: open,
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from("shopping_list_item_suppliers")
        .select(
          "id, item_id, product_supplier_link_id, supplier_record_id, assigned_quantity, purchase_quantity, purchase_unit_id, purchase_unit_code, conversion_factor, min_warning_accepted, notes",
        )
        .eq("item_id", item.item_id);
      if (error) throw new Error(error.message);
      return (data ?? []) as AssignmentRow[];
    },
  });

  const mutation = useMutation({
    mutationFn: (input: {
      action: "set" | "remove";
      linkId: string;
      packs: number | null;
      accepted: boolean;
      unitId?: string | null;
      manualUnitCode?: string | null;
      assignmentId?: string | null;
    }) =>
      runAssign({
        data: {
          companyId,
          itemId: item.item_id,
          action: input.action,
          linkId: input.linkId,
          assignedQuantity: null,
          purchaseQuantity: input.packs,
          minWarningAccepted: input.accepted,
          notes: null,
          purchaseUnitId: input.unitId ?? null,
          assignmentId: input.assignmentId ?? null,
          manualUnitCode: input.manualUnitCode ?? null,
        },
      }),
    onSuccess: async (_data, input) => {
      if (input.action === "set") setDrafts((current) => ({ ...current, [input.linkId]: EMPTY }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping-list-assignments", item.item_id] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-assignments"] }),
      ]);
      toast.success("Ripartizione aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suppliers = (suppliersQuery.data ?? []).filter((row) => row.is_active);
  const unitsByLink = unitsQuery.data ?? {};
  const assignments = assignmentsQuery.data ?? [];
  // Solo le ripartizioni con equivalente entrano nel totale: «Non convertibile» non vale 0.
  const assignedTotal = assignments.reduce((sum, row) => sum + Number(row.assigned_quantity ?? 0), 0);
  const unconvertible = assignments.filter((row) => row.assigned_quantity === null).length;
  // «Mancano» arriva solo dal database (shopping_list_item_state): fornitori + acquisto diretto.
  const remaining = item.remaining === null || item.remaining === undefined ? null : Number(item.remaining);
  const directQuery = useQuery({
    queryKey: ["shopping-direct-quota", item.item_id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("manual_purchase_quantity, manual_purchase_unit_code")
        .eq("id", item.item_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.manual_purchase_quantity == null
        ? null
        : { quantity: Number(data.manual_purchase_quantity), unit: (data.manual_purchase_unit_code as string | null) ?? "" };
    },
  });
  const direct = directQuery.data ?? null;
  const unit = item.unit_code ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item.description ?? item.code}
            {item.decided_quantity !== null ? ` · da acquistare ${qty(item.decided_quantity)} ${unit}` : ""}
          </DialogTitle>
          <DialogDescription>
            Ripartisci l'acquisto tra uno o più fornitori, ognuno con la sua U.M. La quantità da acquistare non cambia.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
            <p className="text-[11px] text-muted-foreground">Da acquistare</p>
            <p className="text-lg font-semibold leading-tight">{item.decided_quantity !== null ? `${qty(item.decided_quantity)} ${unit}` : "—"}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
            <p className="text-[11px] text-muted-foreground">Assegnate</p>
            <p className="text-lg font-semibold leading-tight">{qty(assignedTotal)} {unit}</p>
            {unconvertible ? <p className="text-[10px] font-semibold text-destructive">+{unconvertible} non convertibil{unconvertible === 1 ? "e" : "i"}</p> : null}
          </div>
          <div
            className={`rounded-md border px-2 py-1.5 ${
              remaining !== null && remaining < 0
                ? "border-destructive bg-destructive/10 text-destructive"
                : remaining === 0
                  ? "border-success bg-success/10"
                  : "border-primary bg-primary/10"
            }`}
          >
            <p className="text-[11px]">Mancano</p>
            <p className="text-lg font-semibold leading-tight">{remaining === null ? "—" : `${qty(remaining)} ${unit}`}</p>
          </div>
        </div>

        {direct ? (
          <p className="text-sm">
            Acquisto diretto (sola lettura): <strong>{qty(direct.quantity)} {direct.unit}</strong>
          </p>
        ) : null}

        {!suppliers.length ? (
          <p className="text-sm text-muted-foreground">Nessun fornitore attivo per questo prodotto: associane uno dalla scheda prodotto.</p>
        ) : null}

        <ul className="divide-y divide-border">
          {suppliers.map((supplier) => {
            const info = unitsByLink[supplier.link_id];
            const options = info?.units ?? [];
            const draft = drafts[supplier.link_id] ?? EMPTY;
            const rows = assignments.filter((row) => row.product_supplier_link_id === supplier.link_id);
            const isManual = draft.unit === MANUAL;
            const chosen = options.find((row) => row.unit_id === draft.unit) ?? null;
            const packs = parseQuantity(draft.quantity);
            const code = isManual ? draft.manual.trim().toUpperCase() : chosen?.code ?? "";
            const equivalent = chosen?.conversion_factor && packs ? packs * Number(chosen.conversion_factor) : null;
            const belowMin =
              supplier.min_quantity !== null && equivalent !== null && equivalent < Number(supplier.min_quantity);
            // Acquistabilità decisa solo dal database (shopping_item_supplier_units.purchasable).
            const b2bBlocked = Boolean(info?.is_b2b && (!info.source_linked || info.purchasable === false));
            const canSave =
              editable &&
              !mutation.isPending &&
              !b2bBlocked &&
              (packs ?? 0) > 0 &&
              (isManual ? code.length > 0 : Boolean(chosen));

            return (
              <li key={supplier.link_id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{supplier.supplier_name}</span>
                  {info?.is_b2b ? (
                    <span className="rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold leading-4">B2B</span>
                  ) : null}
                  {supplier.supplier_reference_label ? (
                    <span className="text-xs text-muted-foreground">{supplier.supplier_reference_label}</span>
                  ) : null}
                  {supplier.sourcing_priority !== null ? (
                    <Badge variant="secondary">
                      <Star className="fill-current" aria-hidden="true" />
                      Priorità {supplier.sourcing_priority}
                    </Badge>
                  ) : null}
                  {deliveries[supplier.link_id] ? <DeliveryHintBadge schedule={deliveries[supplier.link_id]!.schedule} /> : null}
                </div>

                <p className="text-xs text-muted-foreground">
                  {supplier.min_quantity !== null ? `Minimo ${qty(supplier.min_quantity)} ${unit}` : "Nessun minimo"}
                  {supplier.lead_time_days !== null ? ` · consegna ${supplier.lead_time_days} gg` : ""}
                  {supplier.danea_net_cost !== null ? ` · costo Danea ${euro(supplier.danea_net_cost)}` : ""}
                  {supplier.manual_cost !== null ? ` · costo Trevi Fruit ${euro(supplier.manual_cost)}` : ""}
                </p>

                {rows.length ? (
                  <ul className="space-y-1">
                    {rows.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-sm bg-muted/40 px-2 py-1 text-sm">
                        <span className="font-semibold">
                          {row.purchase_quantity !== null
                            ? `${qty(row.purchase_quantity)} ${row.purchase_unit_code ?? ""}`
                            : `${qty(row.assigned_quantity)} ${unit}`}
                        </span>
                        {row.assigned_quantity === null ? (
                          <span className="text-xs font-semibold text-destructive">· Non convertibile</span>
                        ) : row.purchase_unit_code && row.purchase_unit_code !== unit ? (
                          <span className="text-xs text-muted-foreground">≈ {qty(row.assigned_quantity)} {unit}</span>
                        ) : null}
                        {row.assigned_quantity !== null && assignedTotal > 0 ? (
                          <span className="text-xs text-muted-foreground">· {sharePercent(Number(row.assigned_quantity), assignedTotal)}%</span>
                        ) : null}
                        {editable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-7 px-2"
                            disabled={mutation.isPending}
                            aria-label={`Togli ${row.purchase_unit_code ?? ""} di ${supplier.supplier_name}`}
                            onClick={() =>
                              mutation.mutate({ action: "remove", linkId: supplier.link_id, packs: null, accepted: false, assignmentId: row.id })
                            }
                          >
                            <Trash2 aria-hidden="true" />
                            Togli
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {b2bBlocked ? (
                  <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    {info?.purchasable === false ? "Non in catalogo del fornitore" : "Prodotto del fornitore non collegato: U.M. non disponibili"}
                  </p>
                ) : editable ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">U.M.:</span>
                      {options.map((row) => (
                        <Button
                          key={row.unit_id}
                          type="button"
                          size="sm"
                          variant={draft.unit === row.unit_id ? "default" : "outline"}
                          aria-pressed={draft.unit === row.unit_id}
                          className="h-8 px-2"
                          onClick={() => setDrafts((c) => ({ ...c, [supplier.link_id]: { ...draft, unit: row.unit_id } }))}
                        >
                          {row.code}
                        </Button>
                      ))}
                      {info?.allow_manual ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={isManual ? "default" : "outline"}
                          aria-pressed={isManual}
                          className="h-8 px-2"
                          onClick={() => setDrafts((c) => ({ ...c, [supplier.link_id]: { ...draft, unit: MANUAL } }))}
                        >
                          Altra U.M.
                        </Button>
                      ) : null}
                      {info?.is_b2b && !options.length ? (
                        <span className="text-xs text-destructive">Il venditore non ha pubblicato U.M. per questo prodotto</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      {isManual ? (
                        <label className="text-xs">
                          Altra U.M.
                          <Input
                            className="mt-1 h-9 w-32 uppercase"
                            maxLength={20}
                            placeholder="es. PEDANE"
                            value={draft.manual}
                            aria-label={`Altra U.M. ${supplier.supplier_name}`}
                            onChange={(e) => setDrafts((c) => ({ ...c, [supplier.link_id]: { ...draft, manual: e.target.value } }))}
                          />
                        </label>
                      ) : null}
                      <label className="text-xs">
                        Quantità {code ? `(${code})` : ""}
                        <Input
                          className="mt-1 h-9 w-28"
                          inputMode="decimal"
                          value={draft.quantity}
                          aria-label={`Quantità ${supplier.supplier_name}`}
                          onChange={(e) => setDrafts((c) => ({ ...c, [supplier.link_id]: { ...draft, quantity: e.target.value } }))}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canSave}
                        onClick={() =>
                          mutation.mutate({
                            action: "set",
                            linkId: supplier.link_id,
                            packs,
                            accepted: belowMin ? draft.accepted : false,
                            unitId: isManual ? null : chosen?.unit_id ?? null,
                            manualUnitCode: isManual ? draft.manual : null,
                          })
                        }
                      >
                        Salva
                      </Button>
                    </div>
                    {packs && (chosen || isManual) ? (
                      <p className="text-xs text-muted-foreground">
                        {qty(packs)} {code}{" "}
                        {equivalent !== null ? (
                          <>
                            {chosen?.conversion_type === "esatta" ? "=" : "≈"} {qty(Number(equivalent.toFixed(3)))} {unit}
                          </>
                        ) : (
                          <span className="font-semibold text-destructive">· Non convertibile (non conta nel totale assegnato)</span>
                        )}
                      </p>
                    ) : null}
                    {belowMin ? (
                      <label className="flex items-center gap-2 text-xs text-destructive">
                        <input
                          type="checkbox"
                          checked={draft.accepted}
                          onChange={(e) => setDrafts((c) => ({ ...c, [supplier.link_id]: { ...draft, accepted: e.target.checked } }))}
                        />
                        Sotto il minimo di {supplier.supplier_name} ({qty(supplier.min_quantity)} {unit}): procedo comunque
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
