import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { recordInventoryAdjustment } from "@/lib/inventory.functions";

export type CountCorrectionTarget = {
  productId: string;
  /** Card della correzione (null = «Senza fornitore»); il database verifica che coincida con il conteggio. */
  linkId?: string | null;
  locationId: string;
  countId: string;
  code: string;
  name: string;
  unit: string;
  countedQuantity: number;
  countedAt: string | null;
};

/**
 * «Correggi conteggio»: il conteggio originale resta intatto; si registra una rettifica
 * separata (differenza tra quantità corretta e contata) con motivo e riferimento al conteggio.
 */
export function CorrectCountDialog({
  companyId,
  listId,
  target,
  onClose,
}: {
  companyId: string;
  listId: string | null;
  target: CountCorrectionTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const record = useServerFn(recordInventoryAdjustment);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const corrected = value.trim() === "" ? null : Number(value.replace(",", "."));
  const valid = corrected !== null && Number.isFinite(corrected) && corrected >= 0;
  const delta = target && valid ? Math.round((corrected - target.countedQuantity) * 1000) / 1000 : null;

  const close = () => {
    setValue("");
    setReason("");
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target || delta === null || delta === 0) throw new Error("Inserisci una quantità diversa da quella contata");
      await record({
        data: {
          companyId,
          productId: target.productId,
          locationId: target.locationId,
          quantity: delta,
          reason: reason.trim(),
          notes: `Correzione del conteggio del ${target.countedAt ? new Date(target.countedAt).toLocaleDateString("it-IT") : "—"}: da ${target.countedQuantity} a ${corrected} ${target.unit}`,
          referenceCountId: target.countId,
          linkId: target.linkId,
        },
      });
      if (!listId) return false;
      const { data } = await supabase
        .from("shopping_list_items")
        .select("id")
        .eq("list_id", listId)
        .eq("product_id", target.productId)
        .limit(1);
      return Boolean(data?.length);
    },
    onSuccess: (inList) => {
      toast.success("Rettifica registrata: il conteggio originale resta nello storico");
      if (inList) toast.warning("Ricontrolla la quantità da acquistare nella Lista della Spesa", { duration: 8000 });
      void queryClient.invalidateQueries();
      close();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correggi conteggio</DialogTitle>
          <DialogDescription>
            {target ? `${target.code} · ${target.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md border bg-muted/40 p-2">
              Conteggio originale: <strong>{target.countedQuantity} {target.unit}</strong>
              {target.countedAt ? ` · ${new Date(target.countedAt).toLocaleDateString("it-IT")}` : ""}
              <br />
              <span className="text-xs text-muted-foreground">
                Non viene modificato: la correzione è una rettifica separata e tracciata.
              </span>
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">Quantità corretta ({target.unit})</span>
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            {delta !== null ? (
              <p className="text-xs">
                Rettifica: <strong>{delta > 0 ? "+" : ""}{delta} {target.unit}</strong>
              </p>
            ) : null}
            <label className="block space-y-1">
              <span className="text-xs font-semibold">Motivo (obbligatorio)</span>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Annulla</Button>
          <Button
            disabled={!valid || delta === 0 || reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Registra rettifica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
