import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShoppingListStatus } from "@/lib/shopping-list";
import type { ShoppingListOrderStatus } from "./shopping-list-status";

export type ShoppingListHistoryRow = {
  id: string;
  name: string;
  number: string | null;
  status: ShoppingListStatus;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  delivery_date: string | null;
  shopping_list_items: { count: number }[];
  purchase_orders: (ShoppingListOrderStatus & { supplier_record_id: string | null })[];
  who: string;
};

/** Lettura condivisa da finestra e pagina Storico; nessuna scrittura. */
export function useShoppingListHistory(companyId: string, enabled: boolean, closedOnly = false) {
  return useQuery({
    queryKey: ["shopping-list-history", companyId, closedOnly ? "chiuse" : "tutte"],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<ShoppingListHistoryRow[]> => {
      let query = supabase
        .from("shopping_lists")
        .select("id, name, number, status, created_at, confirmed_at, confirmed_by, delivery_date, shopping_list_items(count), purchase_orders(id, supplier_record_id, status, sent_at, seen_by_supplier_at)")
        .eq("company_id", companyId);
      if (closedOnly) query = query.not("number", "is", null).order("confirmed_at", { ascending: false });
      else query = query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const ids = [...new Set((data ?? []).map((row) => row.confirmed_by).filter(Boolean))] as string[];
      const { data: people, error: peopleError } = ids.length
        ? await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", ids)
        : { data: [], error: null };
      if (peopleError) throw new Error(peopleError.message);
      const names = new Map((people ?? []).map((person) => [person.user_id, [person.first_name, person.last_name].filter(Boolean).join(" ")]));
      return (data ?? []).map((row) => ({
        ...row,
        status: row.status as ShoppingListStatus,
        who: row.confirmed_by ? (names.get(row.confirmed_by) ?? "—") : "—",
      })) as unknown as ShoppingListHistoryRow[];
    },
  });
}
