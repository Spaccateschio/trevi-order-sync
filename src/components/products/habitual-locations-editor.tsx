import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { habitualError, setPrimary, toggleHabitual, type HabitualState } from "@/lib/habitual-locations";

/** Zone abituali del prodotto: solo organizzative, non creano card né toccano giacenze o conteggi. */
export function HabitualLocationsEditor({
  companyId,
  productId,
  locations,
  isAdmin,
}: {
  companyId: string;
  productId: string;
  locations: { location_id: string; location_name: string }[];
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const key = ["product-habitual-locations", productId];

  const current = useQuery({
    queryKey: key,
    queryFn: async (): Promise<HabitualState> => {
      const { data, error } = await supabase
        .from("product_habitual_locations")
        .select("location_id, is_primary")
        .eq("product_id", productId);
      if (error) throw new Error(error.message);
      return { ids: data.map((r) => r.location_id), primaryId: data.find((r) => r.is_primary)?.location_id ?? null };
    },
  });

  // Solo per mostrare i comandi: il database ricontrolla comunque il ruolo.
  const operator = useQuery({
    queryKey: ["is-operator", companyId],
    enabled: !isAdmin,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_company_role", { _company_id: companyId, _role: "operatore" });
      return Boolean(data);
    },
  });
  const canEdit = isAdmin || operator.data === true;

  const [draft, setDraft] = useState<HabitualState>({ ids: [], primaryId: null });
  useEffect(() => {
    if (current.data) setDraft(current.data);
  }, [current.data]);

  const dirty =
    !!current.data &&
    (draft.primaryId !== current.data.primaryId ||
      draft.ids.length !== current.data.ids.length ||
      draft.ids.some((id) => !current.data!.ids.includes(id)));
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
    onSuccess: () => {
      toast.success("Zone abituali salvate");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!locations.length) return null;

  return (
    <section className="mt-4 border-t border-border pt-3">
      <h4 className="text-sm font-semibold">Zone abituali</h4>
      <p className="text-xs text-muted-foreground">
        Dove si trova di solito il prodotto. Puoi comunque contarlo in qualsiasi zona.
      </p>
      <div className="mt-2 divide-y divide-border">
        {locations.map((loc) => {
          const checked = draft.ids.includes(loc.location_id);
          const primary = draft.primaryId === loc.location_id;
          return (
            <div key={loc.location_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <label className="flex min-w-0 items-center gap-2">
                <Checkbox
                  checked={checked}
                  disabled={!canEdit || save.isPending}
                  onCheckedChange={() => setDraft((s) => toggleHabitual(s, loc.location_id))}
                  aria-label={`Zona abituale ${loc.location_name}`}
                />
                <span className="truncate">{loc.location_name}</span>
              </label>
              {checked ? (
                <Button
                  type="button"
                  size="sm"
                  variant={primary ? "secondary" : "ghost"}
                  disabled={!canEdit || save.isPending}
                  onClick={() => setDraft((s) => setPrimary(s, loc.location_id))}
                  aria-label={`Imposta ${loc.location_name} come principale`}
                >
                  <Star className={primary ? "fill-primary text-primary" : "text-muted-foreground"} />
                  <span className="text-xs">{primary ? "Principale" : "Rendi principale"}</span>
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {canEdit && dirty ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          {error ? <p className="mr-auto text-xs text-destructive">{error}</p> : null}
          <Button size="sm" variant="ghost" onClick={() => current.data && setDraft(current.data)}>
            Annulla
          </Button>
          <Button size="sm" disabled={!!error || save.isPending} onClick={() => save.mutate()}>
            Salva zone
          </Button>
        </div>
      ) : null}
    </section>
  );
}
