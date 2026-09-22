import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Inventario generale: apertura/chiusura e letture passano dal server.
 * Ruoli, appartenenza e idempotenza sono verificati nel database.
 */

export type InventoryProgress = {
  session_id: string;
  session_name: string;
  status: "in_corso" | "completata" | "annullata";
  started_at: string | null;
  finished_at: string | null;
  total: number;
  completed: number;
  differences: number;
  unchanged: number;
  pending: number;
  zones: { location_id: string; name: string; code: string | null; total: number; completed: number; differences: number }[];
  categories: { name: string; total: number; completed: number }[];
  subcategories: { category: string; name: string; total: number; completed: number }[];
};

export type InventoryCountRow = {
  product_id: string;
  location_id: string;
  location_name: string;
  code: string;
  description: string | null;
  danea_um: string | null;
  category: string | null;
  subcategory: string | null;
  is_favorite: boolean;
  image_path: string | null;
  thumbnail_path: string | null;
  calculated: number;
  counted: number | null;
  difference: number | null;
  counted_at: string | null;
  counted_by: string | null;
  note: string | null;
};

type SupplierReference = {
  ownProductId: string;
  sellerCompanyId: string;
  sellerProductId: string;
};

type SupplierReferenceCandidate = {
  ownProductId: string;
  sellerCompanyId: string;
  code: string;
  isPreferred: boolean;
  priority: number | null;
};

async function getSupplierReferences(
  context: { supabase: any },
  companyId: string,
  productIds: string[],
): Promise<SupplierReference[]> {
  if (!productIds.length) return [];

  const { data: links, error: linksError } = await context.supabase
    .from("product_supplier_links")
    .select("product_id, supplier_record_id, supplier_product_code, is_preferred, sourcing_priority")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .in("product_id", productIds);
  if (linksError) throw new Error(linksError.message);

  const supplierRecordIds = [
    ...new Set((links ?? []).map((link: { supplier_record_id: string }) => link.supplier_record_id)),
  ];
  if (!supplierRecordIds.length) return [];

  const { data: relations, error: relationsError } = await context.supabase
    .from("supplier_customer_relations")
    .select("supplier_record_id, seller_company_id")
    .eq("buyer_company_id", companyId)
    .eq("status", "attivo")
    .in("supplier_record_id", supplierRecordIds);
  if (relationsError) throw new Error(relationsError.message);

  const sellerBySupplierRecord = new Map<string, string>();
  for (const relation of relations ?? []) {
    if (relation.supplier_record_id) {
      sellerBySupplierRecord.set(relation.supplier_record_id, relation.seller_company_id);
    }
  }

  const wanted: SupplierReferenceCandidate[] = (links ?? [])
    .map((link: {
      product_id: string;
      supplier_record_id: string;
      supplier_product_code: string | null;
      is_preferred: boolean;
      sourcing_priority: number | null;
    }) => ({
      ownProductId: link.product_id,
      sellerCompanyId: sellerBySupplierRecord.get(link.supplier_record_id) ?? null,
      code: link.supplier_product_code,
      isPreferred: link.is_preferred,
      priority: link.sourcing_priority,
    }))
    .filter(
      (entry: {
        ownProductId: string;
        sellerCompanyId: string | null;
        code: string | null;
        isPreferred: boolean;
        priority: number | null;
      }): entry is SupplierReferenceCandidate => Boolean(entry.sellerCompanyId && entry.code),
    );
  if (!wanted.length) return [];

  const sellerIds = [...new Set(wanted.map((entry) => entry.sellerCompanyId))];
  const codes = [...new Set(wanted.map((entry) => entry.code))];
  const { data: sellerProducts, error: productsError } = await context.supabase
    .from("products")
    .select("id, company_id, code")
    .in("company_id", sellerIds)
    .in("code", codes);
  if (productsError) throw new Error(productsError.message);

  const sellerProductByKey = new Map<string, string>();
  for (const product of sellerProducts ?? []) {
    sellerProductByKey.set(`${product.company_id}|${product.code}`, product.id);
  }

  return wanted
    .sort((left, right) => {
      if (left.isPreferred !== right.isPreferred) return left.isPreferred ? -1 : 1;
      return (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER);
    })
    .flatMap((entry) => {
      const sellerProductId = sellerProductByKey.get(`${entry.sellerCompanyId}|${entry.code}`);
      return sellerProductId
        ? [{ ownProductId: entry.ownProductId, sellerCompanyId: entry.sellerCompanyId, sellerProductId }]
        : [];
    });
}

export const startGeneralInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        archiveId: z.string().uuid(),
        name: z.string().trim().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("start_general_inventory", {
      _company_id: data.companyId,
      _archive_id: data.archiveId,
      _actor_user_id: context.userId,
      ...(data.name === null ? {} : { _name: data.name }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const closeGeneralInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: summary, error } = await context.supabase.rpc("close_general_inventory", {
      _company_id: data.companyId,
      _session_id: data.sessionId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return summary as {
      session_id: string;
      already_closed: boolean;
      total: number;
      completed: number;
      differences: number;
      unchanged: number;
    };
  });

export const manageCompanyProductFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        productId: z.string().uuid(),
        favorite: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const references = await getSupplierReferences(context, data.companyId, [data.productId]);
    const primaryReference = references[0];
    if (!primaryReference) throw new Error("Referenza del fornitore non trovata");

    const sellerProductIds = [...new Set(references.map((reference) => reference.sellerProductId))];
    const operation = data.favorite
      ? context.supabase.from("buyer_product_favorites").upsert(
          {
            buyer_company_id: data.companyId,
            seller_company_id: primaryReference.sellerCompanyId,
            product_id: primaryReference.sellerProductId,
            created_by: context.userId,
          },
          { onConflict: "buyer_company_id,product_id" },
        )
      : context.supabase
          .from("buyer_product_favorites")
          .delete()
          .eq("buyer_company_id", data.companyId)
          .in("product_id", sellerProductIds);
    const { error } = await operation;
    if (error) throw new Error(error.message);
    return { favorite: data.favorite };
  });

export const getInventoryProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: progress, error } = await context.supabase.rpc("inventory_session_progress", {
      _session_id: data.sessionId,
    });
    if (error) throw new Error(error.message);
    return progress as unknown as InventoryProgress;
  });

export const getInventoryRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        locationId: z.string().uuid().nullable(),
        category: z.string().trim().max(120).nullable(),
        subcategory: z.string().trim().max(120).nullable(),
        search: z.string().trim().max(120).nullable(),
        favoritesOnly: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: session, error: sessionError } = await context.supabase
      .from("inventory_sessions")
      .select("company_id")
      .eq("id", data.sessionId)
      .single();
    if (sessionError || !session) throw new Error(sessionError?.message ?? "Sessione non trovata");

    const { data: rows, error } = await context.supabase.rpc("inventory_session_rows", {
      _session_id: data.sessionId,
      _favorites_only: false,
      ...(data.locationId === null ? {} : { _location_id: data.locationId }),
      ...(data.category === null ? {} : { _category: data.category }),
      ...(data.subcategory === null ? {} : { _subcategory: data.subcategory }),
      ...(data.search === null ? {} : { _search: data.search }),
    });
    if (error) throw new Error(error.message);

    const inventoryRows = (rows ?? []) as unknown as InventoryCountRow[];
    const references = await getSupplierReferences(
      context,
      session.company_id,
      [...new Set(inventoryRows.map((row) => row.product_id))],
    );
    const sellerProductIds = [...new Set(references.map((reference) => reference.sellerProductId))];
    const { data: favorites, error: favoritesError } = sellerProductIds.length
      ? await context.supabase
          .from("buyer_product_favorites")
          .select("product_id")
          .eq("buyer_company_id", session.company_id)
          .in("product_id", sellerProductIds)
      : { data: [], error: null };
    if (favoritesError) throw new Error(favoritesError.message);

    const favoriteSellerProductIds = new Set(
      (favorites ?? []).map((favorite: { product_id: string }) => favorite.product_id),
    );
    const favoriteOwnProductIds = new Set(
      references
        .filter((reference) => favoriteSellerProductIds.has(reference.sellerProductId))
        .map((reference) => reference.ownProductId),
    );
    const mappedRows = inventoryRows.map((row) => ({
      ...row,
      is_favorite: favoriteOwnProductIds.has(row.product_id),
    }));
    return data.favoritesOnly ? mappedRows.filter((row) => row.is_favorite) : mappedRows;
  });
