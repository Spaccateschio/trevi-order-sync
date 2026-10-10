import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { recordInventoryAdjustment } from "@/lib/inventory.functions";

export type PhysicalEdit = { at: string; by: string; from: number; to: number; reason: string };

export type PhysicalQuickEditTarget = {
  companyId: string;
  /** Card della correzione (null = «Senza fornitore»). */
  linkId?: string | null;
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
export const fmtPhysical = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("it-IT", { maximumFractionDigits: 3 }) : "";

const parse = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Correzione dell'ultimo inventario chiuso dalla scheda: sblocco (matita o generale) solo interfaccia;
 * Conferma registra una rettifica = nuovo valore − quantità effettiva attuale (conteggio + rettifiche).
 * Il conteggio originale non viene mai riscritto. Dopo il salvataggio la scheda torna bloccata.
 */
export function usePhysicalCorrection(target: PhysicalQuickEditTarget | null, unlockedAll: boolean) {
  const queryClient = useQueryClient();
  const record = useServerFn(recordInventoryAdjustment);
  const [unlocked, setUnlocked] = useState(false);
  const [relocked, setRelocked] = useState(false);
  const [value, setValue] = useState(fmtPhysical(target?.physical));
  const [reason, setReason] = useState("");
  const editing = Boolean(target) && (unlocked || (unlockedAll && !relocked));

  useEffect(() => { setRelocked(false); }, [unlockedAll]);
  // Da bloccata segue sempre la quantità effettiva più recente (anche modifiche dei colleghi).
  useEffect(() => { if (!editing) setValue(fmtPhysical(target?.physical)); }, [target?.physical, editing]);

  const parsed = parse(value);
  const valid = parsed !== null && parsed >= 0;
  const delta = valid && target ? Math.round((parsed - target.physical) * 1000) / 1000 : 0;
  const needsReason = Boolean(
    target && valid && delta !== 0 && target.previousQuantity !== null &&
    parsed !== target.previousQuantity && !target.countNote?.trim(),
  );

  const lock = () => { setUnlocked(false); if (unlockedAll) setRelocked(true); setReason(""); };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target || !valid) return null;
      await record({
        data: {
          companyId: target.companyId,
          productId: target.productId,
          locationId: target.locationId,
          quantity: delta,
          reason: needsReason ? reason.trim() : AUTO_REASON,
          notes: `Quantità fisica da ${fmtPhysical(target.physical)} a ${fmtPhysical(parsed)} ${target.unit}`,
          referenceCountId: target.countId,
          linkId: target.linkId,
        },
      });
      if (!target.listId) return false;
      const { data } = await supabase.from("shopping_list_items").select("id")
        .eq("list_id", target.listId).eq("product_id", target.productId).limit(1);
      return Boolean(data?.length);
    },
    onSuccess: (inList) => {
      if (inList === null) return;
      toast.success("Quantità fisica aggiornata");
      if (inList) toast.warning("Ricontrolla la quantità da acquistare nella Lista della Spesa", { duration: 8000 });
      lock();
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirm = () => {
    if (!target || !editing) return;
    if (!valid) { toast.error("Inserisci una quantità valida"); return; }
    if (delta === 0) { lock(); return; }
    if (needsReason && reason.trim().length < 3) { toast.error("Indica il motivo della differenza"); return; }
    mutation.mutate();
  };

  const toggle = () => {
    if (editing) lock(); else { setUnlocked(true); setValue(fmtPhysical(target?.physical)); }
  };

  return { editing, value, setValue, reason, setReason, needsReason, confirm, toggle, pending: mutation.isPending };
}
