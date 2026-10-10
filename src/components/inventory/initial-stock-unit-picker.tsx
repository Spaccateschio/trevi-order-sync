import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Options = {
  already_set: boolean;
  suggested_unit_id: string | null;
  source: "fornitore" | "fornitori" | "danea" | "ambiguo" | "nessuna";
  units: { id: string; code: string; description: string | null }[];
};

const SOURCE_LABEL: Record<Options["source"], string> = {
  fornitore: "proposta dal fornitore della card",
  fornitori: "proposta dai fornitori",
  danea: "proposta da Danea",
  ambiguo: "fornitori con U.M. diverse: scegli tu",
  nessuna: "nessuna proposta: scegli tu",
};

/**
 * Prima impostazione della U.M. di magazzino dalla card Inventario.
 * La proposta è solo un suggerimento: si salva soltanto con «Conferma U.M.».
 * Autorizzazioni, blocco di riga e divieto di cambio sono decisi dal database.
 */
export function InitialStockUnitPicker({ productId, linkId }: { productId: string; linkId: string | null }) {
  const queryClient = useQueryClient();
  const options = useQuery({
    queryKey: ["initial-stock-unit-options", productId, linkId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("initial_stock_unit_options", { _product_id: productId, _link_id: linkId as string });
      if (error) throw error;
      return data as unknown as Options;
    },
  });
  const [unitId, setUnitId] = useState<string>("");
  useEffect(() => {
    if (!unitId && options.data?.suggested_unit_id) setUnitId(options.data.suggested_unit_id);
  }, [options.data?.suggested_unit_id, unitId]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_initial_stock_unit", { _product_id: productId, _unit_id: unitId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("U.M. di magazzino impostata");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (options.isError) {
    return <p className="text-[10px] text-destructive">Impossibile caricare le U.M.: {(options.error as Error).message}</p>;
  }
  const data = options.data;
  return (
    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <Select value={unitId} onValueChange={setUnitId} disabled={!data || save.isPending}>
        <SelectTrigger className="h-9 text-xs" aria-label="U.M. di magazzino">
          <SelectValue placeholder="Scegli U.M." />
        </SelectTrigger>
        <SelectContent>
          {data?.units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.code}{unit.description ? ` · ${unit.description}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" className="h-9 text-xs" disabled={!unitId || save.isPending} onClick={() => save.mutate()}>
        <Check className="size-4" />
        Conferma U.M.
      </Button>
      {data ? (
        <p className="col-span-full text-[10px] leading-snug text-muted-foreground">
          {SOURCE_LABEL[data.source]}. Una volta confermata, solo un amministratore può cambiarla dalla scheda prodotto.
        </p>
      ) : null}
    </div>
  );
}
