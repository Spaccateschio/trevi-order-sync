import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { toSchedule, type DeliverySchedule } from "@/lib/delivery-schedule";

type LinkRow = {
  id: string;
  supplier_record_id: string;
  delivery_weekdays: number[] | null;
  delivery_month_day: number | null;
  supplier_records: { delivery_weekdays: number[] | null; delivery_month_day: number | null } | null;
};

export type LinkDelivery = {
  /** Calendario effettivo: eccezione della referenza se presente, altrimenti quello del fornitore. */
  schedule: DeliverySchedule;
  /** true quando la referenza ha un'eccezione propria. */
  isOverride: boolean;
  supplierSchedule: DeliverySchedule;
};

/**
 * Giorni di consegna per ogni referenza fornitore di un prodotto.
 * Dato informativo: non filtra e non ordina nessuna lista.
 */
export function useDeliverySchedules(productId: string, enabled = true) {
  return useQuery({
    queryKey: ["product-supplier-delivery", productId],
    enabled: enabled && Boolean(productId),
    queryFn: async (): Promise<Record<string, LinkDelivery>> => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select(
          "id, supplier_record_id, delivery_weekdays, delivery_month_day, supplier_records(delivery_weekdays, delivery_month_day)",
        )
        .eq("product_id", productId);
      if (error) throw new Error(error.message);
      const result: Record<string, LinkDelivery> = {};
      for (const row of (data ?? []) as unknown as LinkRow[]) {
        const supplierSchedule = toSchedule(
          row.supplier_records?.delivery_weekdays,
          row.supplier_records?.delivery_month_day,
        );
        const hasOverride = row.delivery_weekdays !== null;
        result[row.id] = {
          isOverride: hasOverride,
          supplierSchedule,
          schedule: hasOverride ? toSchedule(row.delivery_weekdays, row.delivery_month_day) : supplierSchedule,
        };
      }
      return result;
    },
  });
}
