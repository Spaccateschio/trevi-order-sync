import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ModuleKey } from "@/lib/navigation";

export type PreferenceList = { hidden: ModuleKey[]; order: ModuleKey[] };
export type NavigationPreferences = { sidebar: PreferenceList; dashboard: PreferenceList };

const EMPTY_LIST: PreferenceList = { hidden: [], order: [] };
const EMPTY_PREFERENCES: NavigationPreferences = { sidebar: EMPTY_LIST, dashboard: EMPTY_LIST };

function parseList(value: unknown): PreferenceList {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_LIST };
  const record = value as Record<string, unknown>;
  return {
    hidden: Array.isArray(record["hidden"]) ? record["hidden"].filter((key): key is ModuleKey => typeof key === "string") : [],
    order: Array.isArray(record["order"]) ? record["order"].filter((key): key is ModuleKey => typeof key === "string") : [],
  };
}

export function orderedKeys(keys: ModuleKey[], preference: PreferenceList) {
  const allowed = new Set(keys);
  return [...preference.order.filter((key) => allowed.has(key)), ...keys.filter((key) => !preference.order.includes(key))];
}

export function useNavigationPreferences(userId?: string, companyId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ["navigation-preferences", userId, companyId] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId && companyId),
    queryFn: async (): Promise<NavigationPreferences> => {
      if (!userId || !companyId) return EMPTY_PREFERENCES;
      const { data, error } = await supabase.from("user_navigation_preferences").select("sidebar_items, dashboard_items").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { sidebar: parseList(data.sidebar_items), dashboard: parseList(data.dashboard_items) } : EMPTY_PREFERENCES;
    },
  });
  const save = useMutation({
    mutationFn: async (preferences: NavigationPreferences) => {
      if (!userId || !companyId) throw new Error("Azienda o utente non disponibile");
      const { error } = await supabase.from("user_navigation_preferences").upsert({ user_id: userId, company_id: companyId, sidebar_items: preferences.sidebar as unknown as Json, dashboard_items: preferences.dashboard as unknown as Json }, { onConflict: "user_id,company_id" });
      if (error) throw new Error(error.message);
      return preferences;
    },
    onSuccess: (preferences) => queryClient.setQueryData(queryKey, preferences),
  });
  const reset = useMutation({
    mutationFn: async () => {
      if (!userId || !companyId) return;
      const { error } = await supabase.from("user_navigation_preferences").delete().eq("user_id", userId).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.setQueryData(queryKey, EMPTY_PREFERENCES),
  });
  return { preferences: query.data ?? EMPTY_PREFERENCES, isLoading: query.isLoading, save, reset };
}