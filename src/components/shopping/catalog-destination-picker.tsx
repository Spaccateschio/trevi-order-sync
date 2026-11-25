import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { B2B_SOURCE_TARGET, DIRECT_TARGET, checkQuotas, destinationFromToggles, type CatalogDestination, type DraftQuota } from "@/lib/catalog-destination";
import { readCardPreference } from "@/lib/shopping-card-reads";
import { pickFromCardReads } from "@/lib/supplier-brief";
import { chooseListDestinations } from "@/lib/supplier-memory";
import { UnlinkSupplierDialog } from "./unlink-supplier-dialog";

type PoolItem = { linkId: string; name: string; isB2B: boolean };

/**
 * Spunte dei fornitori, «Acquisto diretto» e quote per una card «Non in lista».
 * Spunte e quote restano nella bozza (salvate al Conferma del Carrello);
 * la X «scollega dal prodotto» è invece un'azione immediata sul prodotto.
 */
export function CatalogDestinationPicker({ companyId, productId, sellerName, value, onChange, total, totalUnit, unitCodes, onUnlinkB2bSource }: {
  companyId: string;
  /** null = articolo B2B non ancora mio: unico fornitore il venditore. */
  productId: string | null;
  sellerName?: string;
  value: CatalogDestination | null;
  onChange: (dest: CatalogDestination) => void;
  total: number | null;
  totalUnit: string | null;
  unitCodes: string[];
  /** X sull'articolo non ancora mio: lo copia nei Prodotti e poi scollega il venditore. */
  onUnlinkB2bSource?: () => void;
}) {
  const queryClient = useQueryClient();
  const [unlinking, setUnlinking] = useState<PoolItem | null>(null);
  const poolQuery = useQuery({
    queryKey: ["shopping-catalog-destination-pool", companyId, productId],
    enabled: Boolean(productId),
    staleTime: 60_000,
    queryFn: async () => {
      const [overview, options, preference] = await Promise.all([
        supabase.rpc("product_supplier_overview", { _product_id: productId! }),
        supabase.rpc("product_supplier_b2b_options", { _company_id: companyId, _product_id: productId! }),
        readCardPreference(`${companyId}:${productId}`),
      ]);
      if (overview.error) throw new Error(overview.error.message);
      if (options.error) throw new Error(options.error.message);
      const pool = pickFromCardReads((overview.data ?? []) as unknown[], (options.data ?? []) as unknown[], []);
      const choice = chooseListDestinations({
        suppliers: pool, deselected: [], memory: null,
        manualStarAt: preference?.manualStarAt ?? null, inventoryStarLinks: preference?.stars ?? [], directStarred: preference?.directStar ?? false,
      });
      return { pool: pool.map((s) => ({ linkId: s.linkId, name: s.name, isB2B: s.isB2B })), proposed: { linkIds: choice.linkIds, direct: choice.direct } };
    },
  });
  const pool: PoolItem[] = useMemo(() => productId
    ? poolQuery.data?.pool ?? []
    : [{ linkId: B2B_SOURCE_TARGET, name: sellerName ?? "Fornitore", isB2B: true }], [productId, poolQuery.data, sellerName]);
  // Stato iniziale = proposta di chooseListDestinations; dopo la prima spunta vale la bozza.
  const current = useMemo(() => {
    if (value) return { checked: new Set(pool.map((s) => s.linkId).filter((id) => !value.deselectedLinks.includes(id))), direct: value.direct };
    if (!productId) return { checked: new Set([B2B_SOURCE_TARGET]), direct: false };
    const proposed = poolQuery.data?.proposed;
    return { checked: new Set(proposed?.linkIds ?? []), direct: Boolean(proposed?.direct) };
  }, [value, pool, poolQuery.data, productId]);

  if (productId && poolQuery.isPending) return <p className="text-xs text-muted-foreground">Carico i fornitori…</p>;
  if (productId && poolQuery.isError) return <p className="text-xs text-destructive">Fornitori non disponibili</p>;

  const opts = { total, unitCode: totalUnit, ...(value?.quotas ? { previous: value.quotas } : {}) };
  const toggle = (linkId: string, on: boolean) => {
    const next = new Set(current.checked);
    if (on) next.add(linkId); else next.delete(linkId);
    onChange(destinationFromToggles(pool, next, current.direct, opts));
  };
  const setQuota = (target: string, patch: Partial<DraftQuota>) => {
    if (!value?.quotas) return;
    onChange({ ...value, quotas: value.quotas.map((q) => (q.target === target ? { ...q, ...patch } : q)) });
  };
  const quotaOf = (target: string) => value?.quotas?.find((q) => q.target === target) ?? null;
  const check = checkQuotas(value?.quotas, total, totalUnit);
  const units = [...new Set([...unitCodes, ...(totalUnit ? [totalUnit] : [])])];

  const quotaFields = (target: string, label: string) => {
    const q = quotaOf(target);
    if (!q) return null;
    return (
      <div className="ml-6 flex items-center gap-1">
        <Input inputMode="decimal" className="h-7 w-20 text-xs" aria-label={`Quantità per ${label}`} value={q.quantity}
          onChange={(e) => setQuota(target, { quantity: e.target.value })} />
        <Select value={q.unitCode ?? ""} onValueChange={(code) => setQuota(target, { unitCode: code })}>
          <SelectTrigger className="h-7 w-20 text-xs" aria-label={`U.M. per ${label}`}><SelectValue placeholder="U.M." /></SelectTrigger>
          <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="space-y-1 text-xs">
      <ul className="space-y-1">
        {pool.map((s) => (
          <li key={s.linkId} className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox checked={current.checked.has(s.linkId)} aria-label={`Usa ${s.name}`} onCheckedChange={(v) => toggle(s.linkId, v === true)} />
                <span className="truncate font-medium">{s.name}</span>
              </label>
              <Button type="button" size="sm" variant="ghost" className="h-6 w-6 shrink-0 px-0 text-destructive"
                aria-label={`Scollega ${s.name} dal prodotto`}
                onClick={() => (productId ? setUnlinking(s) : onUnlinkB2bSource?.())}>
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            {quotaFields(s.linkId, s.name)}
          </li>
        ))}
        <li className="space-y-1">
          <label className="flex items-center gap-2">
            <Checkbox checked={current.direct} aria-label="Acquisto diretto (compro io)"
              onCheckedChange={(v) => onChange(destinationFromToggles(pool, current.checked, v === true, opts))} />
            <span className="font-medium">Acquisto diretto (compro io)</span>
          </label>
          {quotaFields(DIRECT_TARGET, "acquisto diretto")}
        </li>
      </ul>
      {check.kind === "somma_diversa" ? <p className="font-semibold text-destructive">Le quote fanno {check.sum}, il totale è {total} {totalUnit}</p> : null}
      {check.kind === "incompleta" && value?.quotas ? <p className="text-destructive">Scrivi la quantità totale e quella di ogni destinazione</p> : null}
      {check.kind === "da_verificare" ? <p className="text-warning">Da verificare: U.M. diverse dal totale, la somma non si può controllare</p> : null}
      <p className="text-[10px] text-muted-foreground">Le spunte valgono solo per questa Lista; la X scollega il fornitore dal prodotto per sempre.</p>
      {productId ? (
        <UnlinkSupplierDialog companyId={companyId} linkId={unlinking?.linkId ?? null} supplierName={unlinking?.name ?? ""}
          mode={unlinking?.isB2B ? "b2b" : "product"} onClose={() => setUnlinking(null)}
          onDone={async () => {
            const gone = unlinking?.linkId;
            setUnlinking(null);
            if (gone && value) {
              const rest = pool.filter((s) => s.linkId !== gone);
              onChange(destinationFromToggles(rest, [...current.checked].filter((id) => id !== gone), current.direct, { total, unitCode: totalUnit }));
            }
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["shopping-catalog-destination-pool", companyId, productId] }),
              queryClient.invalidateQueries({ queryKey: ["shopping-add-links", companyId] }),
            ]);
          }} />
      ) : null}
    </div>
  );
}
