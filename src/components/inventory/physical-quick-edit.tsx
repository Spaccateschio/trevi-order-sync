import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { recordInventoryAdjustment } from "@/lib/inventory.functions";

export type PhysicalEdit = { at: string; by: string; from: number; to: number; reason: string };

export type PhysicalQuickEditTarget = {
  companyId: string;
  listId: string | null;
  productId: string;
  locationId: string;
  countId: string;
  unit: string;
  countedQuantity: number;
  countedAt: string | null;
  physical: number;
  previousQuantity: number | null;
  countNote: string | null;
  edits: PhysicalEdit[];
};

const AUTO_REASON = "Correzione quantità fisica";
const fmt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("it-IT", { maximumFractionDigits: 3 }) : "—";

/**
 * Correzione rapida dell'ultimo inventario chiuso: il conteggio originale resta intatto,
 * ogni modifica è una rettifica tracciata (differenza rispetto alla quantità fisica attuale).
 * Motivo obbligatorio solo se la nuova quantità si discosta dalla giacenza attesa prima
 * dell'inventario e il conteggio non ha già una nota che spieghi la differenza.
 */
export function PhysicalQuickEdit({ target, unlockedAll }: { target: PhysicalQuickEditTarget; unlockedAll: boolean }) {
  const queryClient = useQueryClient();
  const record = useServerFn(recordInventoryAdjustment);
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState(fmt(target.physical));
  const [reason, setReason] = useState("");
  const editing = unlocked || unlockedAll;

  // Il valore mostrato segue sempre la quantità fisica più recente (anche modifiche dei colleghi).
  useEffect(() => {
    setValue(fmt(target.physical));
  }, [target.physical]);

  const parsed = value.trim() === "" ? null : Number(value.replace(/\./g, "").replace(",", "."));
  const valid = parsed !== null && Number.isFinite(parsed) && parsed >= 0;
  const delta = valid ? Math.round((parsed - target.physical) * 1000) / 1000 : 0;
  const needsReason =
    valid &&
    delta !== 0 &&
    target.previousQuantity !== null &&
    parsed !== target.previousQuantity &&
    !target.countNote?.trim();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!valid || delta === 0) return null;
      await record({
        data: {
          companyId: target.companyId,
          productId: target.productId,
          locationId: target.locationId,
          quantity: delta,
          reason: needsReason ? reason.trim() : AUTO_REASON,
          notes: `Quantità fisica da ${fmt(target.physical)} a ${fmt(parsed)} ${target.unit}`,
          referenceCountId: target.countId,
        },
      });
      if (!target.listId) return false;
      const { data } = await supabase
        .from("shopping_list_items")
        .select("id")
        .eq("list_id", target.listId)
        .eq("product_id", target.productId)
        .limit(1);
      return Boolean(data?.length);
    },
    onSuccess: (inList) => {
      if (inList === null) return;
      toast.success("Quantità fisica aggiornata");
      if (inList) toast.warning("Ricontrolla la quantità da acquistare nella Lista della Spesa", { duration: 8000 });
      setReason("");
      setUnlocked(false);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setValue(fmt(target.physical));
    },
  });

  const save = () => {
    if (!valid) {
      setValue(fmt(target.physical));
      return;
    }
    if (delta === 0) return;
    if (needsReason && reason.trim().length < 3) return;
    mutation.mutate();
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Input
          className="h-10 min-w-0 flex-1 px-2 text-right text-base font-bold"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          readOnly={!editing}
          disabled={mutation.isPending}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => { if (editing && !needsReason) save(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && editing) {
              event.preventDefault();
              save();
            }
          }}
          aria-label="Quantità fisica"
        />
        <Button
          type="button"
          variant={editing ? "secondary" : "outline"}
          size="sm"
          className="h-10 w-9 shrink-0 px-0"
          aria-label={editing ? "Blocca quantità" : "Modifica quantità fisica"}
          title={editing ? "Blocca" : "Modifica"}
          disabled={unlockedAll}
          onClick={() => { setUnlocked((v) => !v); setValue(fmt(target.physical)); }}
        >
          {editing ? <Lock className="size-4" /> : <Pencil className="size-4" />}
        </Button>
      </div>
      {editing && needsReason ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-destructive">
            Risultavano {fmt(target.previousQuantity ?? 0)} {target.unit}: indica il motivo della differenza.
          </p>
          <div className="flex gap-1.5">
            <Input className="h-8 text-xs" placeholder="Motivo (es. merce scartata)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" className="h-8" disabled={reason.trim().length < 3 || mutation.isPending} onClick={save}>
              Salva
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
