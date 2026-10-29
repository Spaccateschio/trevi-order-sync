import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Star } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  buildHabitualMap,
  habitualError,
  setPrimary,
  toggleHabitual,
  type HabitualMap,
  type HabitualState,
} from "@/lib/habitual-locations";

export const habitualKey = (companyId: string) => ["habitual-locations", companyId];

/** Zone abituali per prodotto (non per card/fornitore): una sola lettura per azienda. */
export function useHabitualMap(companyId: string) {
  return useQuery({
    queryKey: habitualKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<HabitualMap> => {
      const { data, error } = await supabase
        .from("product_habitual_locations")
        .select("product_id, location_id, is_primary")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return buildHabitualMap(data);
    },
  });
}

type Ctx = {
  companyId: string;
  map: HabitualMap;
  locations: { id: string; name: string }[];
  canEdit: boolean;
};
const HabitualContext = createContext<Ctx>({ companyId: "", map: new Map(), locations: [], canEdit: false });

export function HabitualZonesProvider({
  companyId,
  map,
  locations,
  isAdmin,
  children,
}: {
  companyId: string;
  map: HabitualMap;
  locations: { id: string; name: string }[];
  isAdmin: boolean;
  children: ReactNode;
}) {
  // Solo per mostrare il comando: il database ricontrolla il ruolo a ogni salvataggio.
  const operator = useQuery({
    queryKey: ["is-operator", companyId],
    enabled: !isAdmin && Boolean(companyId),
    queryFn: async () => {
      const { data } = await supabase.rpc("has_company_role", { _company_id: companyId, _role: "operatore" });
      return Boolean(data);
    },
  });
  const value = useMemo(
    () => ({ companyId, map, locations, canEdit: isAdmin || operator.data === true }),
    [companyId, map, locations, isAdmin, operator.data],
  );
  return <HabitualContext.Provider value={value}>{children}</HabitualContext.Provider>;
}

const EMPTY: HabitualState = { ids: [], primaryId: null };

/** Riga compatta sulla card: «Zona abituale» del prodotto, distinta dalla zona del conteggio. */
export function HabitualZoneControl({ productId, disabled = false }: { productId: string; disabled?: boolean }) {
  const { companyId, map, locations, canEdit } = useContext(HabitualContext);
  const queryClient = useQueryClient();
  const saved = map.get(productId) ?? EMPTY;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HabitualState>(saved);
  useEffect(() => {
    if (open) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const name = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";
  const ordered = [...saved.ids].sort((a, b) => (a === saved.primaryId ? -1 : b === saved.primaryId ? 1 : 0));
  // Senza zone la riga «nessuna» non aggiunge nulla: lascia il posto a un segno «+ zona».
  const hasZones = ordered.length > 0;
  const label = ordered.map(name).join(", ");
  const error = habitualError(draft);

  const save = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.rpc("set_product_habitual_locations", {
        _product_id: productId,
        _location_ids: draft.ids,
        _primary_location_id: draft.primaryId as string,
      });
      if (e) throw new Error(e.message);
    },
    onSuccess: async () => {
      // Tutte le card dello stesso prodotto leggono la stessa mappa: si aggiornano insieme.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: habitualKey(companyId) }),
        queryClient.invalidateQueries({ queryKey: ["product-habitual-locations", productId] }),
      ]);
      toast.success("Zone abituali salvate");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const text = hasZones ? (
    <span className="truncate">
      Zona abituale: <span className="text-foreground">{label}</span>
    </span>
  ) : (
    <span className="shrink-0 font-semibold">+ zona</span>
  );
  if (disabled || !canEdit || !locations.length) {
    // Chi non può modificarle legge solo ciò che c'è: «nessuna» non è una scritta da mostrare.
    if (!hasZones) return null;
    return <p className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground"><MapPin className="size-3 shrink-0" />{text}</p>;
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-full items-center gap-1 text-left text-[11px] leading-tight text-muted-foreground underline-offset-2 hover:underline"
          aria-label={hasZones ? "Modifica zone abituali del prodotto" : "Aggiungi zona abituale al prodotto"}
        >
          <MapPin className="size-3 shrink-0" />
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="text-xs font-semibold">Zone abituali del prodotto</p>
        <p className="text-[11px] text-muted-foreground">
          Vale per tutte le card del prodotto. Non cambia conteggi né giacenze: puoi contare in qualsiasi zona.
        </p>
        <div className="mt-2 divide-y divide-border">
          {locations.map((loc) => {
            const checked = draft.ids.includes(loc.id);
            const primary = draft.primaryId === loc.id;
            return (
              <div key={loc.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                <label className="flex min-w-0 items-center gap-2">
                  <Checkbox checked={checked} disabled={save.isPending} onCheckedChange={() => setDraft((s) => toggleHabitual(s, loc.id))} />
                  <span className="truncate">{loc.name}</span>
                </label>
                {checked ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={primary ? "secondary" : "ghost"}
                    className="h-6 px-1.5 text-[10px]"
                    disabled={save.isPending}
                    onClick={() => setDraft((s) => setPrimary(s, loc.id))}
                    aria-label={`Imposta ${loc.name} come principale`}
                  >
                    <Star className={primary ? "size-3 fill-primary text-primary" : "size-3"} />
                    {primary ? "Principale" : "Principale?"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Annulla</Button>
          <Button size="sm" className="h-7 text-xs" disabled={!!error || save.isPending} onClick={() => save.mutate()}>Salva</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
