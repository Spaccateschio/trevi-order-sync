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
type CardCountRow = CountRow & { product_supplier_link_id: string | null };
type CardRow = ProductRow & { key: string; count: CardCountRow | null };

/**
 * Schermata di conteggio: tabella compatta su computer e tablet, schede su telefono.
 * La quantità precedente arriva sempre dalla giacenza dell'ubicazione, non da un valore salvato sul prodotto.
 */
export function InventorySessionCounter({
  companyId,
  session,
  locations,
  onCorrectCount,
}: {
  companyId: string;
  session: SessionRow;
  locations: LocationRow[];
  onCorrectCount?: (count: CardCountRow, product: ProductRow) => void;
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
    queryFn: async (): Promise<CardCountRow[]> => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("id, product_id, location_id, product_supplier_link_id, counted_quantity, previous_quantity, difference, unit_code, counted_at, notes" as "id, product_id, location_id, counted_quantity, previous_quantity, difference, unit_code, counted_at, notes")
        .eq("session_id", session.id);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CardCountRow[];
    },
  });

  // Nomi dei fornitori delle card (Modello 2).
  const supplierNamesQuery = useQuery({
    queryKey: ["inventory-card-suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("id, supplier_records(legal_name)")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      const map = new Map<string, string>();
      for (const link of (data ?? []) as { id: string; supplier_records: { legal_name: string | null } | null }[]) {
        map.set(link.id, link.supplier_records?.legal_name ?? "Fornitore");
      }
      return map;
    },
  });

  // Una riga per card contata (prodotto + collegamento) nell'ubicazione.
  const countsByProduct = useMemo(() => {
    const map = new Map<string, CardCountRow[]>();
    for (const row of countsQuery.data ?? []) {
      if (row.location_id !== locationId) continue;
      const list = map.get(row.product_id) ?? [];
      list.push(row);
      map.set(row.product_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(a.product_supplier_link_id === null) - Number(b.product_supplier_link_id === null));
    }
    return map;
  }, [countsQuery.data, locationId]);
  const cardName = (count: CardCountRow | null) =>
    !count ? null : count.product_supplier_link_id
      ? (supplierNamesQuery.data?.get(count.product_supplier_link_id) ?? "Fornitore")
      : "Senza fornitore";

  const mutation = useMutation({
    mutationFn: async (input: { productId: string; quantity: number; unitCode: string | null; linkId: string | null | undefined }) =>
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
          // Card già contata: esplicita. Mai contata: il database accetta solo se il prodotto ha una sola card.
          linkId: input.linkId,
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

  const productRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = productsQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (row) =>
        row.code.toLowerCase().includes(term) || (row.description ?? "").toLowerCase().includes(term),
    );
  }, [productsQuery.data, search]);
  // Righe = card: un prodotto con più card contate ha una riga per fornitore.
  const rows = useMemo(
    () => productRows.flatMap((product): CardRow[] => {
      const counts = countsByProduct.get(product.id);
      return counts?.length
        ? counts.map((count) => ({ ...product, key: `${product.id}:${count.product_supplier_link_id ?? "-"}`, count }))
        : [{ ...product, key: `${product.id}:?`, count: null }];
    }),
    [productRows, countsByProduct],
  );

  const saveRow = (product: CardRow) => {
    const raw = drafts[product.key];
    if (raw === undefined) return;
    const value = parseQuantity(raw);
    if (value === null || value < 0) {
      toast.error("Quantità non valida");
      return;
    }
    mutation.mutate({
      productId: product.id,
      quantity: value,
      unitCode: product.danea_um,
      linkId: product.count ? product.count.product_supplier_link_id : undefined,
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[product.key];
      return next;
    });
  };

  const countedInSession = rows.filter((row) => row.count).length;

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
      <div className="hidden overflow-x-auto rounded-md border border-border md:block">
        <table className="w-full min-w-[1220px] table-fixed border-separate border-spacing-0 text-xs">
          <thead className="bg-muted">
            <tr className="[&>th]:border-r [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th:last-child]:border-r-0">
              <th className="sticky left-0 z-20 w-24 bg-muted">Codice</th>
              <th className="sticky left-24 z-20 w-[300px] bg-muted">Descrizione</th>
              <th className="w-24">Precedente</th>
              <th className="w-28">Contata</th>
              <th className="w-24">Differenza</th>
              <th className="w-16">U.M.</th>
              <th className="w-28">Stato</th>
              <th className="w-56">Note</th>
              {onCorrectCount ? <th className="sticky right-0 z-20 w-40 bg-muted shadow-[-2px_0_0_0_var(--color-border)]">Azioni</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => {
              const stock = stockQuery.data?.get(product.id);
              const count = product.count;
              const draft = drafts[product.key];
              const value = draft ?? (count ? String(count.counted_quantity) : "");
              const parsed = parseQuantity(value);
              const previous = count ? count.previous_quantity : (stock?.quantity ?? 0);
              const difference = parsed === null ? null : parsed - previous;
              return (
                <tr
                  key={product.key}
                  className="[&>td]:border-t [&>td]:border-border [&>td]:border-r [&>td]:border-border [&>td]:px-2 [&>td]:py-1 [&>td:last-child]:border-r-0"
                >
                  <td className="sticky left-0 z-10 bg-card font-mono">{product.code}</td>
                  <td className="sticky left-24 z-10 whitespace-normal break-words bg-card font-medium shadow-[2px_0_0_0_var(--color-border)]">
                    {product.description ?? "—"}
                    {cardName(count) ? <span className="block text-[11px] font-normal text-muted-foreground">Card: {cardName(count)}</span> : null}
                  </td>
                  <td className="text-muted-foreground">
                    {stock?.hasCount || count ? qty(previous) : "mai contato"}
                  </td>
                  <td>
                    {editable ? (
                      <Input
                        className="h-7 text-xs"
                        inputMode="decimal"
                        disabled={!locationId}
                        value={value}
                        aria-label={`Quantità contata ${product.code}`}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [product.key]: event.target.value }))
                        }
                        onBlur={() => saveRow(product)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRow(product);
                        }}
                      />
                    ) : (
                      <strong className="text-sm" aria-label={`Quantità contata ${product.code}`}>
                        {count ? qty(count.counted_quantity) : "—"}
                      </strong>
                    )}
                  </td>
                  <td className={difference && difference < 0 ? "text-destructive" : undefined}>
                    {difference === null ? "—" : qty(difference)}
                  </td>
                  <td className="text-muted-foreground">{count?.unit_code?.trim() || product.danea_um || "—"}</td>
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
                  <td className="whitespace-normal break-words text-muted-foreground">
                    {count?.notes || "—"}
                  </td>
                  {onCorrectCount ? (
                    <td className="sticky right-0 z-10 bg-card shadow-[-2px_0_0_0_var(--color-border)]">
                      {count ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full text-xs font-bold"
                          onClick={() => onCorrectCount(count, product)}
                        >
                          Modifica giacenza
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
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
          const count = product.count;
          const draft = drafts[product.key];
          const value = draft ?? (count ? String(count.counted_quantity) : "");
          return (
            <li key={product.key} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.description ?? product.code}</p>
                  <p className="font-mono text-xs text-muted-foreground">{product.code}</p>
                  {cardName(count) ? <p className="text-xs text-muted-foreground">Card: {cardName(count)}</p> : null}
                </div>
                {count ? <Badge variant="secondary">Contato</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Precedente: {stock?.hasCount || count ? qty(count ? count.previous_quantity : stock?.quantity) : "mai contato"}
                {product.danea_um ? ` ${product.danea_um}` : ""}
              </p>
              {count?.notes ? <p className="mt-1 text-xs text-muted-foreground">Nota: {count.notes}</p> : null}
              {editable ? (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    className="h-11 text-base"
                    inputMode="decimal"
                    disabled={!locationId}
                    value={value}
                    aria-label={`Quantità contata ${product.code}`}
                    onChange={(event) => setDrafts((current) => ({ ...current, [product.key]: event.target.value }))}
                  />
                  <Button
                    type="button"
                    className="h-11"
                    disabled={mutation.isPending || drafts[product.key] === undefined}
                    onClick={() => saveRow(product)}
                  >
                    Salva
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm">
                  Quantità contata: <strong>{count ? qty(count.counted_quantity) : "—"} {count?.unit_code ?? product.danea_um ?? ""}</strong>
                </p>
              )}
              {onCorrectCount && count ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full font-bold"
                  onClick={() => onCorrectCount(count, product)}
                >
                  Modifica giacenza
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!rows.length && !productsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Nessun prodotto in questo archivio.</p>
      ) : null}
      {!editable ? (
        <p className="text-xs text-muted-foreground">
          Sessione chiusa: i conteggi originali non si modificano. Usa “Modifica giacenza” per registrare una rettifica tracciata.
        </p>
      ) : null}
    </div>
  );
}
