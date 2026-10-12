import { supabase } from "@/integrations/supabase/client";

/** Coalesce same-frame card reads; React Query owns caching and invalidation, RLS owns access. */
export function batchCardRead<T>(load: (ids: string[]) => Promise<Map<string, T>>) {
  let pending = new Map<string, { resolve: (value: T | undefined) => void; reject: (reason: unknown) => void }[]>();
  let scheduled = false;
  return (id: string): Promise<T | undefined> => new Promise((resolve, reject) => {
    pending.set(id, [...(pending.get(id) ?? []), { resolve, reject }]);
    if (scheduled) return;
    scheduled = true;
    setTimeout(async () => {
      const group = pending;
      pending = new Map();
      scheduled = false;
      try {
        const values = await load([...group.keys()]);
        for (const [key, listeners] of group) for (const listener of listeners) listener.resolve(values.get(key));
      } catch (error) {
        for (const listeners of group.values()) for (const listener of listeners) listener.reject(error);
      }
    }, 40);
  });
}

export const readCardDirectQuota = batchCardRead(async (ids) => {
  const { data, error } = await supabase.from("shopping_list_items")
    .select("id, manual_purchase_quantity, manual_purchase_unit_code").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.id, row.manual_purchase_quantity == null ? null : {
    quantity: Number(row.manual_purchase_quantity), unit: row.manual_purchase_unit_code ?? "",
  }]));
});

export const readCardLinkPrices = batchCardRead(async (ids) => {
  const { data, error } = await supabase.from("product_supplier_links")
    .select("id, product_id, price_unit_id").in("product_id", ids);
  if (error) throw new Error(error.message);
  const map = new Map<string, Map<string, string | null>>();
  for (const row of data ?? []) {
    const links = map.get(row.product_id) ?? new Map<string, string | null>();
    links.set(row.id, row.price_unit_id ?? null);
    map.set(row.product_id, links);
  }
  return map;
});

const sellerReads = new Map<string, ReturnType<typeof batchCardRead<{ net: number | null; gross: number | null }>>>();
export const readCardPreference = batchCardRead(async (keys) => {
  const map = new Map<string, { manualStarAt: string | null; stars: string[] }>();
  const companies = [...new Set(keys.map((key) => key.split(":")[0] ?? ""))];
  await Promise.all(companies.map(async (companyId) => {
    const ids = keys.filter((key) => key.startsWith(`${companyId}:`)).map((key) => key.split(":")[1] ?? "");
    const [links, stars] = await Promise.all([
      supabase.from("product_supplier_links").select("product_id, preferred_set_at, preferred_set_by")
        .eq("company_id", companyId).in("product_id", ids),
      supabase.from("company_product_supplier_favorites").select("product_id, product_supplier_link_id")
        .eq("company_id", companyId).in("product_id", ids),
    ]);
    if (links.error || stars.error) throw new Error(links.error?.message ?? stars.error?.message);
    for (const id of ids) {
      const times = (links.data ?? []).filter((l) => l.product_id === id && l.preferred_set_by && l.preferred_set_at)
        .map((l) => l.preferred_set_at ?? "").sort();
      map.set(`${companyId}:${id}`, { manualStarAt: times.at(-1) ?? null,
        stars: (stars.data ?? []).filter((s) => s.product_id === id).flatMap((s) => s.product_supplier_link_id ? [s.product_supplier_link_id] : []) });
    }
  }));
  return map;
});

export function readCardB2BPrice(sellerId: string, productId: string) {
  let read = sellerReads.get(sellerId);
  if (!read) {
    read = batchCardRead(async (ids) => {
      const { data, error } = await supabase.rpc("buyer_catalog_prices", { _seller_company_id: sellerId, _product_ids: ids });
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((row) => [row.product_id as string, {
        net: row.net_price === null ? null : Number(row.net_price),
        gross: row.gross_price === null ? null : Number(row.gross_price),
      }]));
    });
    sellerReads.set(sellerId, read);
  }
  return read(productId);
}