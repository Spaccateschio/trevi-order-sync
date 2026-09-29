import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PackageCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, parseQuantity, qty } from "@/lib/inventory";
import { priceLabel, receiptValue, type ReceiptItemRow, type ReceiptRow } from "@/lib/purchase";
import { confirmGoodsReceipt, setGoodsReceiptItem } from "@/lib/purchase.functions";

type Row = ReceiptItemRow & {
  declared: number | null;
  declaredPurchase: number | null;
  purchaseUnit: string | null;
};

/** Carico merce: unico momento in cui nascono provenienza e giacenza. */
export function GoodsReceiptPanel({ receiptId }: { receiptId: string }) {
  const queryClient = useQueryClient();
  const runSet = useServerFn(setGoodsReceiptItem);
  const runConfirm = useServerFn(confirmGoodsReceipt);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [priceUnits, setPriceUnits] = useState<Record<string, string>>({});
  const [priceQuantities, setPriceQuantities] = useState<Record<string, string>>({});

  const receiptQuery = useQuery({
    queryKey: ["goods-receipt", receiptId],
    queryFn: async (): Promise<(ReceiptRow & { company_id: string }) | null> => {
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("id, company_id, number, status, location_id, received_at, confirmed_at, delivery_id")
        .eq("id", receiptId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as (ReceiptRow & { company_id: string }) | null;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["goods-receipt-items", receiptId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("goods_receipt_items")
        .select(
          "id, product_id, delivery_item_id, verified_quantity, unit_code, unit_cost, price_unit_id, price_unit_code, price_quantity, producer_name, producer_lot_code, expiry_date, notes, products(code, description), purchase_delivery_items(declared_quantity, declared_purchase_quantity, accepted_purchase_quantity, purchase_unit_code)",
        )
        .eq("receipt_id", receiptId)
        .order("created_at");
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Array<
        ReceiptItemRow & { purchase_delivery_items: { declared_quantity: number | null; declared_purchase_quantity: number | null; accepted_purchase_quantity: number | null; purchase_unit_code: string | null } | null }
      >).map((row) => ({
        ...row,
        declared: row.purchase_delivery_items?.declared_quantity ?? null,
        declaredPurchase:
          row.purchase_delivery_items?.accepted_purchase_quantity ??
          row.purchase_delivery_items?.declared_purchase_quantity ??
          null,
        purchaseUnit: row.purchase_delivery_items?.purchase_unit_code ?? null,
      }));
    },
  });

  const companyId = receiptQuery.data?.company_id ?? null;
  // U.M. dell'anagrafica aziendale proposte per il prezzo; per un fornitore non B2B si può scrivere un codice libero.
  const unitsQuery = useQuery({
    queryKey: ["company-units-for-price", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units_of_measure")
        .select("id, code")
        .eq("company_id", companyId as string)
        .eq("status", "attivo")
        .order("code");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const companyUnits = unitsQuery.data ?? [];

  /** Quantità del prezzo proposta solo quando la U.M. del prezzo coincide con quella d'ordine o di magazzino. */
  const proposedPriceQuantity = (row: Row, unitCode: string | null, verified: number | null) => {
    const code = (unitCode ?? "").trim().toLowerCase();
    if (!code) return null;
    if (row.purchaseUnit && code === row.purchaseUnit.trim().toLowerCase()) return row.declaredPurchase;
    if (row.unit_code && code === row.unit_code.trim().toLowerCase()) return verified;
    return null;
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["goods-receipt", receiptId] }),
      queryClient.invalidateQueries({ queryKey: ["goods-receipt-items", receiptId] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["product-stock"] }),
      queryClient.invalidateQueries({ queryKey: ["product-lots"] }),
    ]);
  };

  const saveRow = useMutation({
    mutationFn: async (row: Row) => {
      const raw = edits[row.id];
      const quantity = raw === undefined ? null : parseQuantity(raw);
      if (raw !== undefined && quantity === null) throw new Error("Quantità non valida");
      const rawCost = costs[row.id];
      const cost = rawCost === undefined || rawCost.trim() === "" ? null : parseQuantity(rawCost);
      if (rawCost !== undefined && rawCost.trim() !== "" && cost === null) throw new Error("Prezzo non valido");
      const rawUnit = priceUnits[row.id];
      const unitCode = rawUnit === undefined ? undefined : rawUnit.trim();
      const matched = unitCode ? companyUnits.find((unit) => unit.code.toLowerCase() === unitCode.toLowerCase()) : undefined;
      const rawPq = priceQuantities[row.id];
      const pq = rawPq === undefined || rawPq.trim() === "" ? null : parseQuantity(rawPq);
      if (rawPq !== undefined && rawPq.trim() !== "" && (pq === null || pq <= 0)) throw new Error("Quantità del prezzo non valida");
      await runSet({
        data: {
          receiptItemId: row.id,
          verifiedQuantity: quantity,
          producerName: null,
          producerLotCode: lots[row.id]?.trim() || null,
          expiryDate: null,
          unitCost: cost,
          notes: null,
          priceUnitId: matched?.id ?? null,
          priceUnitCode: unitCode ? (matched?.code ?? unitCode) : null,
          clearPriceUnit: unitCode === "",
          priceQuantity: pq,
          clearPriceQuantity: rawPq !== undefined && rawPq.trim() === "",
        },
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Riga del carico aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirm = useMutation({
    mutationFn: () => runConfirm({ data: { receiptId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Carico confermato: provenienze e giacenza aggiornate");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const receipt = receiptQuery.data;
  const rows = itemsQuery.data ?? [];
  const editable = receipt?.status === "bozza";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{receipt?.number}</span>
        <Badge variant={receipt?.status === "confermato" ? "default" : "outline"}>
          {receipt?.status === "confermato" ? "Confermato" : "Da confermare"}
        </Badge>
        {receipt?.confirmed_at ? (
          <span className="text-xs text-muted-foreground">
            Confermato il {dateTimeShort(receipt.confirmed_at)}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Dichiarato e verificato restano due valori distinti: la giacenza nasce dal verificato, solo
        alla conferma.
      </p>

      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{row.products?.code}</span>
            <span className="text-xs text-muted-foreground">{row.products?.description}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.declared === null && row.declaredPurchase !== null ? (
              <>Dichiarate: {qty(row.declaredPurchase)} {row.purchaseUnit}</>
            ) : (
              <>
                Dichiarato dal fornitore: {row.declared === null ? "—" : qty(row.declared)}{" "}
                {row.unit_code}
              </>
            )}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Quantità verificata {row.unit_code ? `(${row.unit_code})` : ""}
              <Input
                className="mt-1"
                inputMode="decimal"
                disabled={!editable}
                value={edits[row.id] ?? String(row.verified_quantity)}
                onChange={(event) => setEdits((prev) => ({ ...prev, [row.id]: event.target.value }))}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Lotto del produttore (dall'etichetta)
              <Input
                className="mt-1"
                disabled={!editable}
                value={lots[row.id] ?? row.producer_lot_code ?? ""}
                onChange={(event) => setLots((prev) => ({ ...prev, [row.id]: event.target.value }))}
                placeholder="Se assente lascia vuoto"
              />
            </label>
            <div className="hidden" />
          </div>
          {(() => {
            const verifiedRaw = edits[row.id];
            const verified = verifiedRaw === undefined ? row.verified_quantity : parseQuantity(verifiedRaw);
            const costRaw = costs[row.id];
            const cost = costRaw === undefined ? row.unit_cost : costRaw.trim() === "" ? null : parseQuantity(costRaw);
            const unitCode = (priceUnits[row.id] ?? row.price_unit_code ?? "").trim() || null;
            const pqRaw = priceQuantities[row.id];
            const proposal = proposedPriceQuantity(row, unitCode, verified);
            const pq = pqRaw === undefined ? (row.price_quantity ?? proposal) : pqRaw.trim() === "" ? null : parseQuantity(pqRaw);
            const result = receiptValue({ unitCost: cost, priceUnitCode: unitCode, priceQuantity: pq, stockQuantity: verified });
            return (
              <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    Prezzo (€)
                    <Input className="mt-1" inputMode="decimal" disabled={!editable} value={costRaw ?? (row.unit_cost === null ? "" : String(row.unit_cost))} placeholder="Non indicato" onChange={(event) => setCosts((prev) => ({ ...prev, [row.id]: event.target.value }))} />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    U.M. del prezzo
                    <Input className="mt-1" list={`price-units-${row.id}`} disabled={!editable} value={priceUnits[row.id] ?? row.price_unit_code ?? ""} placeholder="Non indicata" onChange={(event) => setPriceUnits((prev) => ({ ...prev, [row.id]: event.target.value }))} />
                    <datalist id={`price-units-${row.id}`}>
                      {companyUnits.map((unit) => <option key={unit.id} value={unit.code} />)}
                    </datalist>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Quantità del prezzo {unitCode ? `(${unitCode})` : ""}
                    <Input className="mt-1" inputMode="decimal" disabled={!editable || !unitCode} value={pqRaw ?? (row.price_quantity === null ? (proposal === null ? "" : String(proposal)) : String(row.price_quantity))} placeholder={unitCode ? "Da inserire" : "Indica prima la U.M."} onChange={(event) => setPriceQuantities((prev) => ({ ...prev, [row.id]: event.target.value }))} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cost === null ? "Prezzo non indicato." : `Prezzo: ${priceLabel(cost, unitCode)}.`}{" "}
                  {result
                    ? `Valore merce: ${priceLabel(result.value, null).replace(" · U.M. prezzo non indicata", "")}${
                        result.stockUnitCost !== null ? ` · Costo a magazzino: ${priceLabel(result.stockUnitCost, row.unit_code)}` : ""
                      }`
                    : cost !== null
                      ? "Valore non calcolabile: servono U.M. e quantità del prezzo."
                      : ""}
                </p>
              </div>
            );
          })()}
          <div className="mt-2 flex">
            <div className="flex items-end">
              {editable ? (
                <Button size="sm" variant="secondary" onClick={() => saveRow.mutate(row)}>
                  Salva
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ))}

      {editable ? (
        <Button onClick={() => confirm.mutate()} disabled={confirm.isPending || rows.length === 0}>
          <PackageCheck className="mr-1 h-4 w-4" /> Conferma il carico merce
        </Button>
      ) : null}
    </div>
  );
}
