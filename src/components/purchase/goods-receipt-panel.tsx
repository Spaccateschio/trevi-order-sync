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
import type { ReceiptItemRow, ReceiptRow } from "@/lib/purchase";
import { confirmGoodsReceipt, setGoodsReceiptItem } from "@/lib/purchase.functions";

type Row = ReceiptItemRow & { declared: number | null };

/** Carico merce: unico momento in cui nascono provenienza e giacenza. */
export function GoodsReceiptPanel({ receiptId }: { receiptId: string }) {
  const queryClient = useQueryClient();
  const runSet = useServerFn(setGoodsReceiptItem);
  const runConfirm = useServerFn(confirmGoodsReceipt);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});

  const receiptQuery = useQuery({
    queryKey: ["goods-receipt", receiptId],
    queryFn: async (): Promise<ReceiptRow | null> => {
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("id, number, status, location_id, received_at, confirmed_at, delivery_id")
        .eq("id", receiptId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ReceiptRow | null;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["goods-receipt-items", receiptId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("goods_receipt_items")
        .select(
          "id, product_id, delivery_item_id, verified_quantity, unit_code, unit_cost, producer_name, producer_lot_code, expiry_date, notes, products(code, description), purchase_delivery_items(declared_quantity)",
        )
        .eq("receipt_id", receiptId)
        .order("created_at");
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Array<
        ReceiptItemRow & { purchase_delivery_items: { declared_quantity: number } | null }
      >).map((row) => ({
        ...row,
        declared: row.purchase_delivery_items?.declared_quantity ?? null,
      }));
    },
  });

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
      await runSet({
        data: {
          receiptItemId: row.id,
          verifiedQuantity: quantity,
          producerName: null,
          producerLotCode: lots[row.id]?.trim() ? lots[row.id].trim() : null,
          expiryDate: null,
          unitCost: null,
          notes: null,
        },
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Quantità verificata aggiornata");
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
            Dichiarato dal fornitore: {row.declared === null ? "—" : qty(row.declared)}{" "}
            {row.unit_code}
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
