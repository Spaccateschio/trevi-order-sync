import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, parseQuantity, qty, type CountRow, type LocationRow, type SessionRow } from "@/lib/inventory";
import { recordInventoryCount } from "@/lib/inventory.functions";

type ProductRow = { id: string; code: string; description: string | null; danea_um: string | null };

/**
 * Schermata di conteggio: tabella compatta su computer e tablet, schede su telefono.
 * La quantità precedente arriva sempre dalla giacenza dell'ubicazione, non da un valore salvato sul prodotto.
 */
export function InventorySessionCounter({
  companyId,
  session,
  locations,
}: {
  companyId: string;
  session: SessionRow;
  locations: LocationRow[];
}) {
  const queryClient = useQueryClient();
  const run = useServerFn(recordInventoryCount);
  const activeLocations = locations.filter((row) => row.status === "attivo");
  const sessionLocation = session.location_id;
  const [locationId, setLocationId] = useState<string>(
    sessionLocation ?? activeLocations.find((row) => row.is_default)?.id ?? activeLocations[0]?.id ?? "",
  );
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const editable = session.status === "in_corso";

  const productsQuery = useQuery({
    queryKey: ["inventory-products", companyId, session.archive_id],
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, danea_um")
        .eq("company_id", companyId)
        .eq("archive_id", session.archive_id)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductRow[];
    },
  });

  const stockQuery = useQuery({
    queryKey: ["inventory-location-stock", companyId, session.archive_id, locationId],
    enabled: Boolean(locationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("inventory_location_stock_list", {
        _company_id: companyId,
        _archive_id: session.archive_id,
        _location_id: locationId,
      });
      if (error) throw new Error(error.message);
      const map = new Map<string, { hasCount: boolean; quantity: number; countedAt: string | null }>();
      for (const row of (data ?? []) as {
        product_id: string;
        has_count: boolean;
        quantity: number;
        counted_at: string | null;
      }[]) {
        map.set(row.product_id, {
          hasCount: row.has_count,
          quantity: Number(row.quantity ?? 0),
          countedAt: row.counted_at,
        });
      }
      return map;
    },
  });

  const countsQuery = useQuery({
    queryKey: ["inventory-counts", session.id],
    queryFn: async (): Promise<CountRow[]> => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("id, product_id, location_id, counted_quantity, previous_quantity, difference, unit_code, counted_at, notes")
        .eq("session_id", session.id);
      if (error) throw new Error(error.message);
      return (data ?? []) as CountRow[];
    },
  });

  const countsByProduct = useMemo(() => {
    const map = new Map<string, CountRow>();
    for (const row of countsQuery.data ?? []) {
      if (row.location_id === locationId) map.set(row.product_id, row);
    }
    return map;
  }, [countsQuery.data, locationId]);

  const mutation = useMutation({
    mutationFn: async (input: { productId: string; quantity: number; unitCode: string | null }) =>
      run({
        data: {
          companyId,
          sessionId: session.id,
          productId: input.productId,
          locationId,
          countedQuantity: input.quantity,
          unitId: null,
          unitCode: input.unitCode,
          notes: null,
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-counts", session.id] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-location-stock", companyId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = productsQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (row) =>
        row.code.toLowerCase().includes(term) || (row.description ?? "").toLowerCase().includes(term),
    );
  }, [productsQuery.data, search]);

  const saveRow = (product: ProductRow) => {
    const raw = drafts[product.id];
    if (raw === undefined) return;
    const value = parseQuantity(raw);
    if (value === null || value < 0) {
      toast.error("Quantità non valida");
      return;
    }
    mutation.mutate({ productId: product.id, quantity: value, unitCode: product.danea_um });
    setDrafts((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
  };

  const countedInSession = countsByProduct.size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca prodotto per codice o descrizione"
            aria-label="Cerca prodotto"
          />
        </div>
        {sessionLocation ? (
          <Badge variant="secondary">
            Zona: {activeLocations.find((row) => row.id === sessionLocation)?.name ?? "—"}
          </Badge>
        ) : (
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Zona da contare">
              <SelectValue placeholder="Zona" />
            </SelectTrigger>
            <SelectContent>
              {activeLocations.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="outline">
          Contati {countedInSession} su {rows.length}
        </Badge>
      </div>

      {/* Computer e tablet */}
      <div className="hidden overflow-hidden rounded-md border border-border md:block">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-muted/50">
            <tr className="[&>th]:border-r [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th:last-child]:border-r-0">
              <th className="w-24">Codice</th>
              <th>Descrizione</th>
              <th className="w-24">Precedente</th>
              <th className="w-28">Contata</th>
              <th className="w-24">Differenza</th>
              <th className="w-16">U.M.</th>
              <th className="w-28">Stato</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => {
              const stock = stockQuery.data?.get(product.id);
              const count = countsByProduct.get(product.id);
              const draft = drafts[product.id];
              const value = draft ?? (count ? String(count.counted_quantity) : "");
              const parsed = parseQuantity(value);
              const previous = count ? count.previous_quantity : (stock?.quantity ?? 0);
              const difference = parsed === null ? null : parsed - previous;
              return (
                <tr
                  key={product.id}
                  className="border-t border-border [&>td]:border-r [&>td]:border-border [&>td]:px-2 [&>td]:py-1 [&>td:last-child]:border-r-0"
                >
                  <td className="truncate font-mono">{product.code}</td>
                  <td className="truncate">{product.description ?? "—"}</td>
                  <td className="text-muted-foreground">
                    {stock?.hasCount || count ? qty(previous) : "mai contato"}
                  </td>
                  <td>
                    <Input
                      className="h-7 text-xs"
                      inputMode="decimal"
                      disabled={!editable || !locationId}
                      value={value}
                      aria-label={`Quantità contata ${product.code}`}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [product.id]: event.target.value }))
                      }
                      onBlur={() => saveRow(product)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveRow(product);
                      }}
                    />
                  </td>
                  <td className={difference && difference < 0 ? "text-destructive" : undefined}>
                    {difference === null ? "—" : qty(difference)}
                  </td>
                  <td className="text-muted-foreground">{product.danea_um ?? "—"}</td>
                  <td>
                    {count ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Check className="size-3" aria-hidden="true" />
                        {dateTimeShort(count.counted_at)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Da contare</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Telefono */}
      <ul className="space-y-2 md:hidden">
        {rows.map((product) => {
          const stock = stockQuery.data?.get(product.id);
          const count = countsByProduct.get(product.id);
          const draft = drafts[product.id];
          const value = draft ?? (count ? String(count.counted_quantity) : "");
          return (
            <li key={product.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.description ?? product.code}</p>
                  <p className="font-mono text-xs text-muted-foreground">{product.code}</p>
                </div>
                {count ? <Badge variant="secondary">Contato</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Precedente: {stock?.hasCount || count ? qty(count ? count.previous_quantity : stock?.quantity) : "mai contato"}
                {product.danea_um ? ` ${product.danea_um}` : ""}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  className="h-11 text-base"
                  inputMode="decimal"
                  disabled={!editable || !locationId}
                  value={value}
                  aria-label={`Quantità contata ${product.code}`}
                  onChange={(event) => setDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                />
                <Button
                  type="button"
                  className="h-11"
                  disabled={!editable || mutation.isPending || drafts[product.id] === undefined}
                  onClick={() => saveRow(product)}
                >
                  Salva
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {!rows.length && !productsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Nessun prodotto in questo archivio.</p>
      ) : null}
      {!editable ? (
        <p className="text-xs text-muted-foreground">
          Sessione chiusa: i conteggi non sono più modificabili. Per correggere usa una rettifica dalla scheda prodotto.
        </p>
      ) : null}
    </div>
  );
}
