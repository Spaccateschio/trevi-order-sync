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
import {
  isTranslatable,
  packProposal,
  sharePercent,
  type AssignmentRow,
  type OverviewRow,
} from "@/lib/shopping-list";
import { assignShoppingListSupplier } from "@/lib/shopping-list.functions";

type PurchaseUnit = {
  id: string;
  unit_id: string;
  code: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  conversion_factor: number | null;
  conversion_type: "esatta" | "indicativa";
};

type SupplierOption = {
  link_id: string;
  supplier_record_id: string;
  supplier_name: string;
  purchase_unit_code: string | null;
  conversion_factor: number | null;
  conversion_reference_um: string | null;
  manual_cost: number | null;
  manual_cost_at: string | null;
  danea_net_cost: number | null;
  danea_cost_at: string | null;
  min_quantity: number | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  sourcing_priority: number | null;
  supplier_reference_label: string | null;
  is_active: boolean;
  purchase_units: PurchaseUnit[] | null;
};

type Draft = { quantity: string; packs: string; accepted: boolean; unitId: string };

/**
 * Ripartizione della quantità tra fornitori: nessuna redistribuzione automatica e nessun
 * arrotondamento imposto. Le confezioni intere restano una proposta da confermare.
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
}) {
  const queryClient = useQueryClient();
  const runAssign = useServerFn(assignShoppingListSupplier);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const suppliersQuery = useQuery({
    queryKey: ["product-supplier-overview", item.product_id],
    enabled: open,
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data, error } = await supabase.rpc("product_supplier_overview", {
        _product_id: item.product_id,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SupplierOption[];
    },
  });

  // Giorni di consegna: sola segnalazione, nessun filtro sulle righe.
  const deliveries = useDeliverySchedules(item.product_id, open).data ?? {};

  const assignmentsQuery = useQuery({
    queryKey: ["shopping-list-assignments", item.item_id],
    enabled: open,
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from("shopping_list_item_suppliers")
        .select(
          "id, item_id, product_supplier_link_id, supplier_record_id, assigned_quantity, purchase_quantity, purchase_unit_code, conversion_factor, min_warning_accepted, notes",
        )
        .eq("item_id", item.item_id);
      if (error) throw new Error(error.message);
      return (data ?? []) as AssignmentRow[];
    },
  });

  useEffect(() => {
    if (!open) {
      setDrafts({});
      return;
    }
    const existing = assignmentsQuery.data;
    if (!existing) return;
    // Le righe già salvate aggiornano i campi; le quantità digitate e non ancora salvate
    // per gli altri fornitori restano intatte.
    setDrafts((current) => {
      const next = { ...current };
      for (const row of existing) {
        next[row.product_supplier_link_id] = {
          quantity: String(row.assigned_quantity),
          packs: row.purchase_quantity !== null ? String(row.purchase_quantity) : "",
          accepted: row.min_warning_accepted,
          unitId: next[row.product_supplier_link_id]?.unitId ?? "",
        };
      }
      return next;
    });
  }, [open, assignmentsQuery.data]);


  const mutation = useMutation({
    mutationFn: (input: {
      action: "set" | "remove";
      linkId: string;
      quantity: number | null;
      packs: number | null;
      accepted: boolean;
      unitId?: string | null;
    }) =>
      runAssign({
        data: {
          companyId,
          itemId: item.item_id,
          action: input.action,
          linkId: input.linkId,
          assignedQuantity: input.quantity,
          purchaseQuantity: input.packs,
          minWarningAccepted: input.accepted,
          notes: null,
          purchaseUnitId: input.unitId ?? null,
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping-list-assignments", item.item_id] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] }),
      ]);
      toast.success("Assegnazione aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suppliers = (suppliersQuery.data ?? []).filter((row) => row.is_active);
  const assignments = assignmentsQuery.data ?? [];
  const assignedTotal = assignments.reduce((sum, row) => sum + Number(row.assigned_quantity), 0);
  const remaining = Number(item.decided_quantity) - assignedTotal;
  const unit = item.unit_code ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item.description ?? item.code} · da acquistare {qty(item.decided_quantity)} {unit}
          </DialogTitle>
          <DialogDescription>
            Assegna la quantità a uno o più fornitori. Cambiare un fornitore non modifica gli altri.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <span>
            Da acquistare <strong>{qty(item.decided_quantity)}</strong> {unit}
          </span>
          <span>
            Assegnati <strong>{qty(assignedTotal)}</strong> {unit}
          </span>
          <span className={remaining < 0 ? "font-semibold text-destructive" : ""}>
            {remaining < 0
              ? `Assegnati ${qty(assignedTotal)} su ${qty(item.decided_quantity)}: correggi tu le quantità`
              : `Residuo ${qty(remaining)} ${unit}`}
          </span>
        </div>

        {!suppliers.length ? (
          <p className="text-sm text-muted-foreground">
            Nessun fornitore attivo per questo prodotto: associane uno dalla scheda prodotto.
          </p>
        ) : null}

        <ul className="divide-y divide-border">
          {suppliers.map((supplier) => {
            const draft = drafts[supplier.link_id] ?? { quantity: "", packs: "", accepted: false, unitId: "" };
            const existing = assignments.find((row) => row.product_supplier_link_id === supplier.link_id);
            const quantity = parseQuantity(draft.quantity) ?? 0;
            // U.M. acquistabili della referenza: la scelta è dell'operatore, la predefinita è solo un suggerimento.
            const purchaseUnits = (supplier.purchase_units ?? []).filter((row) => row.is_active);
            const chosen =
              purchaseUnits.find((row) => row.unit_id === draft.unitId) ??
              purchaseUnits.find((row) => row.is_default) ??
              (purchaseUnits.length === 1 ? purchaseUnits[0] : null);
            const purchaseCode = chosen?.code ?? supplier.purchase_unit_code ?? supplier.conversion_reference_um;
            // Senza conversione registrata non esistono equivalenze: nessuna proposta a confezioni.
            const factor = chosen ? chosen.conversion_factor : supplier.conversion_factor;
            const translatable = isTranslatable(item.unit_code, purchaseCode, factor);
            const proposal = packProposal(quantity, factor);
            const belowMin =
              supplier.min_quantity !== null && quantity > 0 && quantity < Number(supplier.min_quantity);

            return (
              <li key={supplier.link_id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{supplier.supplier_name}</span>
                  {supplier.supplier_reference_label ? (
                    <span className="text-xs text-muted-foreground">{supplier.supplier_reference_label}</span>
                  ) : null}
                  {supplier.sourcing_priority !== null ? (
                    <Badge variant="secondary">
                      <Star className="fill-current" aria-hidden="true" />
                      Priorità {supplier.sourcing_priority}
                    </Badge>
                  ) : null}
                  {existing ? (
                    <Badge variant="outline">
                      {qty(existing.assigned_quantity)} {unit} ·{" "}
                      {sharePercent(Number(existing.assigned_quantity), assignedTotal)}%
                    </Badge>
                  ) : null}
                  {deliveries[supplier.link_id] ? (
                    <DeliveryHintBadge schedule={deliveries[supplier.link_id]!.schedule} />
                  ) : null}
                </div>

                <p className="text-xs text-muted-foreground">
                  U.M. acquisto {purchaseCode ?? "—"}
                  {factor
                    ? ` · 1 ${purchaseCode} ${chosen?.conversion_type === "esatta" ? "=" : "≈"} ${qty(factor)} ${supplier.conversion_reference_um ?? unit}`
                    : " · nessuna conversione"}
                  {supplier.min_quantity !== null ? ` · minimo ${qty(supplier.min_quantity)}` : ""}
                  {supplier.lead_time_days !== null ? ` · consegna ${supplier.lead_time_days} gg` : ""}
                  {supplier.danea_net_cost !== null ? ` · costo Danea ${euro(supplier.danea_net_cost)}` : ""}
                  {supplier.manual_cost !== null ? ` · costo Trevi Fruit ${euro(supplier.manual_cost)}` : ""}
                </p>

                {purchaseUnits.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Acquisto in:</span>
                    {purchaseUnits.map((row) => (
                      <Button
                        key={row.id}
                        type="button"
                        size="sm"
                        variant={chosen?.unit_id === row.unit_id ? "default" : "outline"}
                        aria-pressed={chosen?.unit_id === row.unit_id}
                        disabled={!editable || mutation.isPending}
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [supplier.link_id]: { ...draft, unitId: row.unit_id, packs: "" },
                          }))
                        }
                      >
                        {row.code}
                        {row.is_default ? <Star className="fill-current" aria-hidden="true" /> : null}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs">
                    Quantità ({unit || "U.M. lista"})
                    <Input
                      className="mt-1 h-9 w-28"
                      inputMode="decimal"
                      value={draft.quantity}
                      disabled={!editable}
                      aria-label={`Quantità ${supplier.supplier_name}`}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [supplier.link_id]: { ...draft, quantity: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Quantità da acquistare ({purchaseCode ?? "U.M. acquisto"})
                    <Input
                      className="mt-1 h-9 w-28"
                      inputMode="decimal"
                      value={draft.packs}
                      disabled={!editable}
                      aria-label={`Quantità da acquistare ${supplier.supplier_name}`}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [supplier.link_id]: { ...draft, packs: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editable || quantity <= 0 || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        action: "set",
                        linkId: supplier.link_id,
                        quantity,
                        packs: parseQuantity(draft.packs),
                        accepted: belowMin ? draft.accepted : false,
                        unitId: chosen?.unit_id ?? null,
                      })
                    }
                  >
                    Salva
                  </Button>
                  {existing ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!editable || mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          action: "remove",
                          linkId: supplier.link_id,
                          quantity: null,
                          packs: null,
                          accepted: false,
                        })
                      }
                    >
                      <Trash2 aria-hidden="true" />
                      Togli
                    </Button>
                  ) : null}
                </div>

                {proposal && quantity > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {qty(quantity)} {unit} ≈ {qty(Number(proposal.rawPacks.toFixed(2)))} {purchaseCode}
                    {proposal.exact ? null : (
                      <>
                        {" "}
                        · in confezioni intere {proposal.wholePacks} {purchaseCode} ≈ {qty(proposal.equivalent)}{" "}
                        {unit} (+{qty(proposal.surplus)} {unit})
                        {editable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="ml-1 h-6 px-2"
                            onClick={() =>
                              setDrafts((current) => ({
                                ...current,
                                [supplier.link_id]: { ...draft, packs: String(proposal.wholePacks) },
                              }))
                            }
                          >
                            Usa {proposal.wholePacks}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </p>
                ) : null}

                {!translatable ? (
                  <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    Conversione {unit}↔{purchaseCode} mancante: imposta la conversione nella scheda prodotto,
                    altrimenti la riga non può essere completata.
                  </p>
                ) : null}

                {belowMin ? (
                  <label className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <input
                      type="checkbox"
                      checked={draft.accepted}
                      disabled={!editable}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [supplier.link_id]: { ...draft, accepted: event.target.checked },
                        }))
                      }
                    />
                    Sotto il minimo di {supplier.supplier_name} ({qty(supplier.min_quantity)} {unit}):
                    procedo comunque
                  </label>
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
