import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { parseLocalDate, toSchedule, type DeliverySchedule } from "@/lib/delivery-schedule";

/** «Per quando serve» della Lista di una riga (solo lettura, per gli avvisi di consegna). */
export function useNeededDate(itemId: string | null, enabled = true) {
  const q = useQuery({
    queryKey: ["shopping-item-needed-date", itemId],
    enabled: enabled && Boolean(itemId),
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.from("shopping_list_items").select("shopping_lists(delivery_date)").eq("id", itemId!).maybeSingle();
      return (data?.shopping_lists as unknown as { delivery_date: string | null } | null)?.delivery_date ?? null;
    },
  });
  return q.data ? parseLocalDate(q.data) : null;
}

/** Giorni e preavviso effettivi per collegamento (eccezione del prodotto, altrimenti fornitore). */
export function useLinkTimings(linkIds: string[], enabled = true) {
  const ids = [...new Set(linkIds)].sort();
  return useQuery({
    queryKey: ["link-delivery-timings", ids],
    enabled: enabled && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, { schedule: DeliverySchedule; leadDays: number | null }>> => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("id, lead_time_days, delivery_weekdays, delivery_month_day, supplier_records(delivery_weekdays, delivery_month_day)")
        .in("id", ids);
      if (error) throw new Error(error.message);
      const out: Record<string, { schedule: DeliverySchedule; leadDays: number | null }> = {};
      for (const r of (data ?? []) as unknown as { id: string; lead_time_days: number | null; delivery_weekdays: number[] | null; delivery_month_day: number | null; supplier_records: { delivery_weekdays: number[] | null; delivery_month_day: number | null } | null }[]) {
        out[r.id] = {
          leadDays: r.lead_time_days ?? null,
          schedule: r.delivery_weekdays !== null ? toSchedule(r.delivery_weekdays, r.delivery_month_day) : toSchedule(r.supplier_records?.delivery_weekdays, r.supplier_records?.delivery_month_day),
        };
      }
      return out;
    },
  });
}
