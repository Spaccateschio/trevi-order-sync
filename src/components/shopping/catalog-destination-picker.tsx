import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { destinationFromToggles, type CatalogDestination } from "@/lib/catalog-destination";
import { readCardPreference } from "@/lib/shopping-card-reads";
import { pickFromCardReads } from "@/lib/supplier-brief";
import { chooseListDestinations } from "@/lib/supplier-memory";

/**
 * Spunte dei fornitori e «Acquisto diretto» per una card «Non in lista».
 * Solo letture e bozza locale: la scelta si scrive al Conferma del Carrello.
 */
export function CatalogDestinationPicker({ companyId, productId, value, onChange }: {
  companyId: string;
  productId: string;
  value: CatalogDestination | null;
  onChange: (dest: CatalogDestination) => void;
}) {
  const poolQuery = useQuery({
    queryKey: ["shopping-catalog-destination-pool", companyId, productId],
    staleTime: 60_000,
    queryFn: async () => {
      const [overview, options, preference] = await Promise.all([
        supabase.rpc("product_supplier_overview", { _product_id: productId }),
        supabase.rpc("product_supplier_b2b_options", { _company_id: companyId, _product_id: productId }),
        readCardPreference(`${companyId}:${productId}`),
      ]);
      if (overview.error) throw new Error(overview.error.message);
      if (options.error) throw new Error(options.error.message);
      const pool = pickFromCardReads((overview.data ?? []) as unknown[], (options.data ?? []) as unknown[], []);
      const choice = chooseListDestinations({
        suppliers: pool, deselected: [], memory: null,
        manualStarAt: preference?.manualStarAt ?? null, inventoryStarLinks: preference?.stars ?? [], directStarred: preference?.directStar ?? false,
      });
      return { pool, proposed: choice };
    },
  });
  const pool = poolQuery.data?.pool ?? [];
  // Stato iniziale = proposta di chooseListDestinations; dopo la prima spunta vale la bozza.
  const current = useMemo(() => {
    if (value) return { checked: new Set(pool.map((s) => s.linkId).filter((id) => !value.deselectedLinks.includes(id))), direct: value.direct };
    const proposed = poolQuery.data?.proposed;
    return { checked: new Set(proposed?.linkIds ?? []), direct: Boolean(proposed?.direct && !proposed.linkIds.length) };
  }, [value, pool, poolQuery.data]);

  if (poolQuery.isPending) return <p className="text-xs text-muted-foreground">Carico i fornitori…</p>;
  if (poolQuery.isError) return <p className="text-xs text-destructive">Fornitori non disponibili</p>;

  const toggle = (linkId: string, on: boolean) => {
    const next = new Set(current.checked);
    if (on) next.add(linkId); else next.delete(linkId);
    onChange(destinationFromToggles(pool, next, false));
  };
  return (
    <ul className="space-y-1 text-xs">
      {pool.map((s) => (
        <li key={s.linkId}>
          <label className="flex items-center gap-2">
            <Checkbox checked={!current.direct && current.checked.has(s.linkId)} disabled={current.direct}
              aria-label={`Usa ${s.name}`} onCheckedChange={(v) => toggle(s.linkId, v === true)} />
            <span className="truncate font-medium">{s.name}</span>
          </label>
        </li>
      ))}
      <li>
        <label className="flex items-center gap-2">
          <Checkbox checked={current.direct} aria-label="Acquisto diretto (compro io)"
            onCheckedChange={(v) => onChange(destinationFromToggles(pool, current.checked, v === true))} />
          <span className="font-medium">Acquisto diretto (compro io)</span>
        </label>
      </li>
    </ul>
  );
}
