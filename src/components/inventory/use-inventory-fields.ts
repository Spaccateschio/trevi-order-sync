import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Colonne/campi configurabili dell'Inventario.
 * Usa la STESSA tabella della griglia Prodotti (user_grid_preferences):
 * nessun secondo sistema di preferenze.
 */

export type InventoryFieldId =
  | "preferito"
  | "zona"
  | "categoria"
  | "sottocategoria"
  | "fornitore"
  | "prezzo_acquisto"
  | "scorta_minima"
  | "fabbisogno"
  | "nota"
  | "ultimo_conteggio"
  | "non_conforme"
  | "proposta";

export const INVENTORY_FIELDS: { id: InventoryFieldId; label: string; defaultVisible: boolean }[] = [
  { id: "preferito", label: "Preferito", defaultVisible: true },
  { id: "zona", label: "Zona", defaultVisible: true },
  { id: "categoria", label: "Categoria", defaultVisible: false },
  { id: "sottocategoria", label: "Sottocategoria", defaultVisible: false },
  { id: "fornitore", label: "Fornitore", defaultVisible: false },
  { id: "prezzo_acquisto", label: "Prezzo acquisto", defaultVisible: false },
  { id: "scorta_minima", label: "Scorta minima", defaultVisible: false },
  { id: "fabbisogno", label: "Fabbisogno", defaultVisible: false },
  { id: "nota", label: "Nota", defaultVisible: true },
  { id: "ultimo_conteggio", label: "Ultimo conteggio", defaultVisible: false },
  { id: "non_conforme", label: "Non conforme", defaultVisible: true },
  { id: "proposta", label: "Da proporre per acquisto", defaultVisible: true },
];

export type InventoryFieldVisibility = Partial<Record<InventoryFieldId, boolean>>;

const DEFAULTS: InventoryFieldVisibility = Object.fromEntries(
  INVENTORY_FIELDS.map((field) => [field.id, field.defaultVisible]),
) as InventoryFieldVisibility;

function deviceClassOf() {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 640 ? "smartphone" : "desktop";
}

export function useInventoryFieldPreferences(gridKey: string) {
  const [deviceClass, setDeviceClass] = useState<string>("desktop");
  const [userId, setUserId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<InventoryFieldVisibility>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDeviceClass(deviceClassOf());
    const onResize = () => setDeviceClass(deviceClassOf());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const preferencesQuery = useQuery({
    queryKey: ["inventory-field-preferences", gridKey, userId, deviceClass],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_grid_preferences")
        .select("columns")
        .eq("user_id", userId!)
        .eq("grid_key", gridKey)
        .eq("device_class", deviceClass)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    if (preferencesQuery.isLoading) return;
    const stored = preferencesQuery.data?.columns as { visibility?: InventoryFieldVisibility } | null;
    setVisibility({ ...DEFAULTS, ...(stored?.visibility ?? {}) });
    setReady(true);
  }, [preferencesQuery.data, preferencesQuery.isLoading]);

  useEffect(() => {
    if (!ready || !userId) return;
    void supabase
      .from("user_grid_preferences")
      .upsert(
        {
          user_id: userId,
          grid_key: gridKey,
          device_class: deviceClass,
          columns: { visibility } as unknown as Json,
        },
        { onConflict: "user_id,grid_key,device_class" },
      )
      .then(({ error }) => {
        if (error) console.error(error.message);
      });
  }, [deviceClass, gridKey, ready, userId, visibility]);

  const reset = useCallback(() => setVisibility(DEFAULTS), []);
  const isVisible = useCallback(
    (id: InventoryFieldId) => visibility[id] !== false,
    [visibility],
  );
  const fields = useMemo(() => INVENTORY_FIELDS, []);

  return { fields, visibility, setVisibility, reset, isVisible, deviceClass, ready };
}
