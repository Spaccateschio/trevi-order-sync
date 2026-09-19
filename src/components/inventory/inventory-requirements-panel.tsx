import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity, purchaseNeed, qty, STOCK_STATUS_LABEL, type RequirementRow } from "@/lib/inventory";
import { addShoppingListItems, manageShoppingList } from "@/lib/shopping-list.functions";

/**
 * Vista fabbisogno: disponibile, scorta minima, necessario (per ora inserito a mano) e quantità da acquistare.
 * La formula vive sul server; qui si ricalcola solo l'anteprima mentre si digita il necessario.
 */
export function InventoryRequirementsPanel({
  companyId,
  archiveId,
}: {
  companyId: string;
  archiveId: string;
}) {
  const [search, setSearch] = useState("");
  const [needs, setNeeds] = useState<Record<string, string>>({});
  const [onlyNeeded, setOnlyNeeded] = useState(false);

  const query = useQuery({
    queryKey: ["inventory-requirements", companyId, archiveId],
    queryFn: async (): Promise<RequirementRow[]> => {
      const { data, error } = await supabase.rpc("inventory_requirements", {
        _company_id: companyId,
        _archive_id: archiveId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RequirementRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = query.data ?? [];
    const enriched = list.map((row) => {
      const needed = parseQuantity(needs[row.product_id] ?? "") ?? 0;
      const computed = purchaseNeed(needed, row.min_stock, row.available, row.order_multiple);
      return { ...row, needed, ...computed };
    });
    return enriched.filter((row) => {
      if (onlyNeeded && row.suggested <= 0) return false;
      if (!term) return true;
      return row.code.toLowerCase().includes(term) || (row.description ?? "").toLowerCase().includes(term);
    });
  }, [query.data, search, needs, onlyNeeded]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca prodotto"
            aria-label="Cerca prodotto"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyNeeded}
            onChange={(event) => setOnlyNeeded(event.target.checked)}
          />
          Solo da acquistare
        </label>
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border md:block">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-muted/50">
            <tr className="[&>th]:border-r [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th:last-child]:border-r-0">
              <th className="w-24">Codice</th>
              <th>Descrizione</th>
              <th className="w-24">Disponibile</th>
              <th className="w-24">Scorta min.</th>
              <th className="w-28">Necessario</th>
              <th className="w-28">Da acquistare</th>
              <th className="w-32">Stato conteggio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.product_id}
                className="border-t border-border [&>td]:border-r [&>td]:border-border [&>td]:px-2 [&>td]:py-1 [&>td:last-child]:border-r-0"
              >
                <td className="truncate font-mono">{row.code}</td>
                <td className="truncate">{row.description ?? "—"}</td>
                <td>{row.count_status === "mai_contato" ? "—" : qty(row.available)}</td>
                <td>{row.min_stock !== null ? qty(row.min_stock) : "—"}</td>
                <td>
                  <Input
                    className="h-7 text-xs"
                    inputMode="decimal"
                    value={needs[row.product_id] ?? ""}
                    aria-label={`Necessario ${row.code}`}
                    onChange={(event) =>
                      setNeeds((current) => ({ ...current, [row.product_id]: event.target.value }))
                    }
                  />
                </td>
                <td className={row.suggested > 0 ? "font-semibold" : "text-muted-foreground"}>
                  {qty(row.suggested)}
                  {row.rounded ? (
                    <span className="ml-1 text-muted-foreground">
                      (da {qty(row.rawNeed)}, multiplo {qty(row.order_multiple)})
                    </span>
                  ) : null}
                </td>
                <td className="text-muted-foreground">
                  {STOCK_STATUS_LABEL[row.count_status]}
                  {row.count_status === "parziale"
                    ? ` (${row.counted_locations}/${row.total_locations})`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.product_id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.description ?? row.code}</p>
                <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
              </div>
              <Badge variant="outline">{STOCK_STATUS_LABEL[row.count_status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Disponibile {row.count_status === "mai_contato" ? "—" : qty(row.available)} · scorta minima{" "}
              {row.min_stock !== null ? qty(row.min_stock) : "—"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                className="h-11 text-base"
                inputMode="decimal"
                placeholder="Necessario"
                value={needs[row.product_id] ?? ""}
                aria-label={`Necessario ${row.code}`}
                onChange={(event) => setNeeds((current) => ({ ...current, [row.product_id]: event.target.value }))}
              />
              <div className="shrink-0 text-right text-sm">
                <p className="text-xs text-muted-foreground">Da acquistare</p>
                <p className="font-semibold">{qty(row.suggested)}</p>
              </div>
            </div>
            {row.rounded ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Arrotondato da {qty(row.rawNeed)} al multiplo {qty(row.order_multiple)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {!rows.length && !query.isLoading ? (
        <p className="text-sm text-muted-foreground">Nessun prodotto da mostrare.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Da acquistare = necessario + scorta minima − disponibile, con arrotondamento al multiplo solo alla fine.
      </p>
    </div>
  );
}
