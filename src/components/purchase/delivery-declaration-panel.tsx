import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity, qty } from "@/lib/inventory";
import { LINE_TYPE_LABEL, type DeliveryLineType } from "@/lib/purchase";
import {
  addPurchaseDeliveryExtraItem,
  setPurchaseDeliveryItem,
  submitPurchaseDelivery,
} from "@/lib/purchase.functions";

type DraftRow = {
  id: string;
  product_id: string;
  order_item_id: string | null;
  line_type: DeliveryLineType;
  declared_quantity: number;
  unit_code: string | null;
  declared_weight: number | null;
  declared_producer: string | null;
  declared_producer_lot: string | null;
  declared_expiry: string | null;
  line_notes: string | null;
  missing_reason: string | null;
  products: { code: string; description: string | null } | null;
};

type ProductOption = { id: string; code: string; description: string | null };

/** Compilazione del DICHIARATO: qui non nasce nessuna giacenza. */
export function DeliveryDeclarationPanel({
  deliveryId,
  companyId,
  archiveId,
  onDone,
}: {
  deliveryId: string;
  companyId: string;
  archiveId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const runSet = useServerFn(setPurchaseDeliveryItem);
  const runAdd = useServerFn(addPurchaseDeliveryExtraItem);
  const runSubmit = useServerFn(submitPurchaseDelivery);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [declaredBy, setDeclaredBy] = useState("");
  const [extraProduct, setExtraProduct] = useState("");
  const [extraQuantity, setExtraQuantity] = useState("");
  const [extraType, setExtraType] = useState<"aggiunta_fornitore" | "sostituzione">(
    "aggiunta_fornitore",
  );

  const rowsQuery = useQuery({
    queryKey: ["delivery-draft", deliveryId],
    queryFn: async (): Promise<DraftRow[]> => {
      const { data, error } = await supabase
        .from("purchase_delivery_items")
        .select(
          "id, product_id, order_item_id, line_type, declared_quantity, unit_code, declared_weight, declared_producer, declared_producer_lot, declared_expiry, line_notes, missing_reason, products(code, description)",
        )
        .eq("delivery_id", deliveryId)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DraftRow[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["purchase-products", companyId, archiveId],
    queryFn: async (): Promise<ProductOption[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId)
        .order("code")
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductOption[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["delivery-draft", deliveryId] });

  const saveRow = useMutation({
    mutationFn: async (row: DraftRow) => {
      const raw = edits[row.id];
      const quantity = raw === undefined ? null : parseQuantity(raw);
      if (raw !== undefined && quantity === null) throw new Error("Quantità non valida");
      await runSet({
        data: {
          deliveryItemId: row.id,
          declaredQuantity: quantity,
          declaredWeight: null,
          declaredProducer: null,
          declaredProducerLot: lots[row.id]?.trim() || null,
          declaredExpiry: null,
          lineNotes: null,
          missingReason: quantity === 0 ? "Non disponibile" : null,
        },
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Riga dichiarata aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addExtra = useMutation({
    mutationFn: async () => {
      const quantity = parseQuantity(extraQuantity);
      if (!extraProduct || quantity === null || quantity <= 0) {
        throw new Error("Scegli il prodotto e indica una quantità");
      }
      await runAdd({
        data: {
          deliveryId,
          productId: extraProduct,
          declaredQuantity: quantity,
          lineType: extraType,
          replacesOrderItemId: null,
          unitCode: null,
          lineNotes: null,
        },
      });
    },
    onSuccess: async () => {
      setExtraProduct("");
      setExtraQuantity("");
      await refresh();
      toast.success("Riga aggiunta alla dichiarazione");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = useMutation({
    mutationFn: () =>
      runSubmit({
        data: {
          deliveryId,
          notes: null,
          actorLabel: declaredBy.trim() ? declaredBy.trim() : null,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Dichiarazione inviata: nessuna giacenza modificata");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = rowsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Quello che il fornitore dichiara resta un dato a parte: la giacenza cambia soltanto con la
        conferma del carico merce.
      </p>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{row.products?.code}</span>
              <span className="text-xs text-muted-foreground">{row.products?.description}</span>
            </div>
            {row.line_type !== "ordinata" ? (
              <Badge variant="outline" className="mt-2 text-[10px] uppercase">
                {LINE_TYPE_LABEL[row.line_type]}
              </Badge>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground">
                Quantità dichiarata {row.unit_code ? `(${row.unit_code})` : ""}
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={edits[row.id] ?? String(row.declared_quantity)}
                  onChange={(event) =>
                    setEdits((prev) => ({ ...prev, [row.id]: event.target.value }))
                  }
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Lotto del produttore (se disponibile)
                <Input
                  className="mt-1"
                  value={lots[row.id] ?? row.declared_producer_lot ?? ""}
                  onChange={(event) =>
                    setLots((prev) => ({ ...prev, [row.id]: event.target.value }))
                  }
                />
              </label>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => saveRow.mutate(row)}
                  disabled={saveRow.isPending}
                >
                  Salva riga
                </Button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && !rowsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Nessuna riga da dichiarare.</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium">Aggiungi una riga non presente nell'ordine</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Select value={extraProduct} onValueChange={setExtraProduct}>
            <SelectTrigger className="sm:col-span-2">
              <SelectValue placeholder="Prodotto" />
            </SelectTrigger>
            <SelectContent>
              {(productsQuery.data ?? []).map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.code} — {product.description ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            inputMode="decimal"
            placeholder="Quantità"
            value={extraQuantity}
            onChange={(event) => setExtraQuantity(event.target.value)}
          />
          <Select
            value={extraType}
            onValueChange={(value) => setExtraType(value as "aggiunta_fornitore" | "sostituzione")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aggiunta_fornitore">Aggiunto dal fornitore</SelectItem>
              <SelectItem value="sostituzione">Sostituzione</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => addExtra.mutate()}
          disabled={addExtra.isPending}
        >
          <Plus className="mr-1 h-4 w-4" /> Aggiungi
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Chi dichiara
          <Input
            className="mt-1 w-56"
            value={declaredBy}
            onChange={(event) => setDeclaredBy(event.target.value)}
            placeholder="Nome di chi ha comunicato"
          />
        </label>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || rows.length === 0}>
          <Send className="mr-1 h-4 w-4" /> Invia dichiarazione
        </Button>
        <span className="text-xs text-muted-foreground">
          Totale dichiarato: {qty(rows.reduce((sum, row) => sum + Number(row.declared_quantity), 0))}
        </span>
      </div>
    </div>
  );
}
