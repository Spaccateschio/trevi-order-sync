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
  recount_requested_at: string | null;
  non_compliant: boolean;
  non_compliant_quantity: number | null;
  non_compliant_note: string | null;
  proposal_status: string | null;
  proposal_flagged_at: string | null;
  min_stock: number | null;
  order_multiple: number | null;
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
    if (data.favorite) {
      const { error } = await context.supabase.from("company_product_favorites").upsert(
          {
            company_id: data.companyId,
            product_id: data.productId,
            created_by: context.userId,
          },
          { onConflict: "company_id,product_id" });
      if (error) throw new Error(error.message);
    } else {
      const references = await getSupplierReferences(context, data.companyId, [data.productId]);
      const sellerProductIds = [...new Set(references.map((reference) => reference.sellerProductId))];
      const operations = [
        context.supabase.from("company_product_favorites").delete()
          .eq("company_id", data.companyId).eq("product_id", data.productId),
        ...(sellerProductIds.length
          ? [context.supabase.from("buyer_product_favorites").delete()
              .eq("buyer_company_id", data.companyId).in("product_id", sellerProductIds)]
          : []),
      ];
      const results = await Promise.all(operations);
      const error = results.find((result) => result.error)?.error;
      if (error) throw new Error(error.message);
    }
    return { favorite: data.favorite };
  });

export const manageCatalogProductFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      companyId: z.string().uuid(),
      sellerCompanyId: z.string().uuid(),
      sellerProductId: z.string().uuid(),
      favorite: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const operation = data.favorite
      ? context.supabase.from("buyer_product_favorites").upsert(
          {
            buyer_company_id: data.companyId,
            seller_company_id: data.sellerCompanyId,
            product_id: data.sellerProductId,
            created_by: context.userId,
          },
          { onConflict: "buyer_company_id,product_id" },
        )
      : context.supabase.from("buyer_product_favorites").delete()
          .eq("buyer_company_id", data.companyId)
          .eq("product_id", data.sellerProductId);
    const { error } = await operation;
    if (error) throw new Error(error.message);
    return { favorite: data.favorite };
  });

/**
 * Preferiti dell'inventario per un insieme di prodotti propri: unisce la stella
 * messa sul prodotto e quella messa sulla referenza del catalogo fornitore.
 */
export const getFavoriteProductIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      companyId: z.string().uuid(),
      productIds: z.array(z.string().uuid()).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.productIds.length) return [] as string[];

    const references = await getSupplierReferences(context, data.companyId, data.productIds);
    const sellerProductIds = [...new Set(references.map((reference) => reference.sellerProductId))];

    const [{ data: ownFavorites, error: ownError }, { data: catalogFavorites, error: catalogError }] =
      await Promise.all([
        context.supabase
          .from("company_product_favorites")
          .select("product_id")
          .eq("company_id", data.companyId)
          .in("product_id", data.productIds),
        sellerProductIds.length
          ? context.supabase
              .from("buyer_product_favorites")
              .select("product_id")
              .eq("buyer_company_id", data.companyId)
              .in("product_id", sellerProductIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (ownError) throw new Error(ownError.message);
    if (catalogError) throw new Error(catalogError.message);

    const favoriteSellerProductIds = new Set(
      (catalogFavorites ?? []).map((favorite: { product_id: string }) => favorite.product_id),
    );
    const favorites = new Set<string>(
      (ownFavorites ?? []).map((favorite: { product_id: string }) => favorite.product_id),
    );
    for (const reference of references) {
      if (favoriteSellerProductIds.has(reference.sellerProductId)) favorites.add(reference.ownProductId);
    }
    return [...favorites];
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
    const [{ data: ownFavorites, error: ownFavoritesError }, { data: catalogFavorites, error: catalogFavoritesError }] = await Promise.all([
      context.supabase
        .from("company_product_favorites")
        .select("product_id")
        .eq("company_id", session.company_id)
        .in("product_id", inventoryRows.map((row) => row.product_id)),
      sellerProductIds.length
        ? context.supabase
          .from("buyer_product_favorites")
          .select("product_id")
          .eq("buyer_company_id", session.company_id)
          .in("product_id", sellerProductIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ownFavoritesError) throw new Error(ownFavoritesError.message);
    if (catalogFavoritesError) throw new Error(catalogFavoritesError.message);

    const favoriteSellerProductIds = new Set(
      (catalogFavorites ?? []).map((favorite: { product_id: string }) => favorite.product_id),
    );
    const favoriteOwnProductIds = new Set<string>(
      (ownFavorites ?? []).map((favorite: { product_id: string }) => favorite.product_id),
    );
    for (const productId of
      references
        .filter((reference) => favoriteSellerProductIds.has(reference.sellerProductId))
        .map((reference) => reference.ownProductId)) favoriteOwnProductIds.add(productId);
    const mappedRows = inventoryRows.map((row) => ({
      ...row,
      is_favorite: favoriteOwnProductIds.has(row.product_id),
    }));
    return data.favoritesOnly ? mappedRows.filter((row) => row.is_favorite) : mappedRows;
  });

export type CatalogCandidate = {
  sellerCompanyId: string;
  sellerCompanyName: string;
  sellerProductId: string;
  code: string;
  description: string | null;
  danea_um: string | null;
  category: string | null;
  subcategory: string | null;
  isFavorite: boolean;
};

/**
 * Articoli dei cataloghi dei fornitori collegati che NON sono ancora
 * prodotti gestiti dall'azienda cliente. Servono alla vista "Tutti"
 * dell'inventario: contando una quantità l'articolo entra fra i propri
 * prodotti (RPC esistente, idempotente).
 */
export const getSupplierCatalogCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CatalogCandidate[]> => {
    const { data: relations, error: relationsError } = await context.supabase
      .from("supplier_customer_relations")
      .select("seller_company_id")
      .eq("buyer_company_id", data.companyId)
      .eq("status", "attivo");
    if (relationsError) throw new Error(relationsError.message);

    const sellerIds = [
      ...new Set(
        (relations ?? [])
          .map((relation: { seller_company_id: string | null }) => relation.seller_company_id)
          .filter((id: string | null): id is string => Boolean(id)),
      ),
    ];
    if (!sellerIds.length) return [];

    const { data: sellers, error: sellersError } = await context.supabase
      .from("companies")
      .select("id, legal_name")
      .in("id", sellerIds);
    if (sellersError) throw new Error(sellersError.message);
    const sellerNames = new Map<string, string>(
      (sellers ?? []).map((seller: { id: string; legal_name: string | null }) => [
        seller.id,
        seller.legal_name ?? "Fornitore",
      ]),
    );

    const { data: catalog, error: catalogError } = await context.supabase
      .from("products")
      .select("id, company_id, code, description, danea_um, category, subcategory")
      .in("company_id", sellerIds)
      .eq("publish_status", "pubblicato")
      .eq("b2b_visible", true)
      .order("code")
      .limit(500);
    if (catalogError) throw new Error(catalogError.message);

    const { data: ownProducts, error: ownError } = await context.supabase
      .from("products")
      .select("id, created_from_product_id")
      .eq("company_id", data.companyId)
      .limit(1000);
    if (ownError) throw new Error(ownError.message);

    const alreadyOwned = new Set<string>(
      (ownProducts ?? [])
        .map((product: { created_from_product_id: string | null }) => product.created_from_product_id)
        .filter((id: string | null): id is string => Boolean(id)),
    );
    const references = await getSupplierReferences(
      context,
      data.companyId,
      (ownProducts ?? []).map((product: { id: string }) => product.id),
    );
    for (const reference of references) alreadyOwned.add(reference.sellerProductId);

    const candidateProducts = (catalog ?? []).filter((product: { id: string }) => !alreadyOwned.has(product.id));
    const candidateIds = candidateProducts.map((product: { id: string }) => product.id);
    const { data: favorites, error: favoritesError } = candidateIds.length
      ? await context.supabase.from("buyer_product_favorites").select("product_id")
          .eq("buyer_company_id", data.companyId).in("product_id", candidateIds)
      : { data: [], error: null };
    if (favoritesError) throw new Error(favoritesError.message);
    const favoriteIds = new Set((favorites ?? []).map((row: { product_id: string }) => row.product_id));

    return candidateProducts
      .map((product: {
        id: string;
        company_id: string;
        code: string;
        description: string | null;
        danea_um: string | null;
        category: string | null;
        subcategory: string | null;
      }) => ({
        sellerCompanyId: product.company_id,
        sellerCompanyName: sellerNames.get(product.company_id) ?? "Fornitore",
        sellerProductId: product.id,
        code: product.code,
        description: product.description,
        danea_um: product.danea_um,
        category: product.category,
        subcategory: product.subcategory,
        isFavorite: favoriteIds.has(product.id),
      }));
  });

/** Aggiunge un articolo del catalogo fornitore fra i prodotti dell'azienda (idempotente). */
export const adoptCatalogProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        sellerCompanyId: z.string().uuid(),
        sellerProductId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("add_catalog_product_to_own_products", {
      _buyer_company_id: data.companyId,
      _seller_company_id: data.sellerCompanyId,
      _seller_product_id: data.sellerProductId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const payload = (result ?? {}) as { product_id?: string };
    if (!payload.product_id) throw new Error("Prodotto non creato");
    const { data: catalogFavorite, error: favoriteReadError } = await context.supabase
      .from("buyer_product_favorites")
      .select("id")
      .eq("buyer_company_id", data.companyId)
      .eq("product_id", data.sellerProductId)
      .maybeSingle();
    if (favoriteReadError) throw new Error(favoriteReadError.message);
    if (catalogFavorite) {
      const { error: favoriteWriteError } = await context.supabase
        .from("company_product_favorites")
        .upsert(
          { company_id: data.companyId, product_id: payload.product_id, created_by: context.userId },
          { onConflict: "company_id,product_id" },
        );
      if (favoriteWriteError) throw new Error(favoriteWriteError.message);
    }
    return { productId: payload.product_id };
  });

/**
 * Storico append-only dei conteggi e delle segnalazioni.
 * La giacenza non viene mai modificata dalle segnalazioni: solo rettifiche/movimenti espliciti.
 */

export type CountEntryType =
  | "conteggio"
  | "riconteggio"
  | "segnalazione"
  | "revoca_segnalazione"
  | "richiesta_riconteggio";

export type CountHistoryEntry = {
  id: string;
  session_id: string;
  location_id: string;
  location_name: string | null;
  entry_type: CountEntryType;
  counted_quantity: number | null;
  previous_quantity: number | null;
  unit_code: string | null;
  non_compliant: boolean;
  non_compliant_quantity: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export const recordCountEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        sessionId: z.string().uuid(),
        productId: z.string().uuid(),
        locationId: z.string().uuid(),
        entryType: z.enum([
          "conteggio",
          "riconteggio",
          "segnalazione",
          "revoca_segnalazione",
          "richiesta_riconteggio",
        ]),
        countedQuantity: z.number().min(0).nullable().default(null),
        unitCode: z.string().trim().max(24).nullable().default(null),
        notes: z.string().trim().max(500).nullable().default(null),
        nonCompliant: z.boolean().nullable().default(null),
        nonCompliantQuantity: z.number().min(0).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("record_inventory_count_entry", {
      _company_id: data.companyId,
      _session_id: data.sessionId,
      _product_id: data.productId,
      _location_id: data.locationId,
      _entry_type: data.entryType,
      _actor_user_id: context.userId,
      ...(data.countedQuantity === null ? {} : { _counted_quantity: data.countedQuantity }),
      ...(data.unitCode === null ? {} : { _unit_code: data.unitCode }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.nonCompliant === null ? {} : { _non_compliant: data.nonCompliant }),
      ...(data.nonCompliantQuantity === null ? {} : { _non_compliant_quantity: data.nonCompliantQuantity }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const getCountHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        productId: z.string().uuid(),
        locationId: z.string().uuid().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("inventory_count_history", {
      _company_id: data.companyId,
      _product_id: data.productId,
      ...(data.locationId === null ? {} : { _location_id: data.locationId }),
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as CountHistoryEntry[];
  });

export type PurchaseProposal = {
  id: string;
  product_id: string;
  code: string;
  description: string | null;
  danea_um: string | null;
  opened_at: string;
  opened_by: string | null;
  opened_note: string | null;
  last_flagged_at: string;
  last_flagged_by: string | null;
  flag_count: number;
};

export const managePurchaseProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        productId: z.string().uuid(),
        action: z.enum(["flag", "resolve"]),
        note: z.string().trim().max(500).nullable().default(null),
        reason: z.string().trim().max(60).nullable().default(null),
        sessionId: z.string().uuid().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("manage_purchase_proposal", {
      _company_id: data.companyId,
      _product_id: data.productId,
      _action: data.action,
      _actor_user_id: context.userId,
      ...(data.note === null ? {} : { _note: data.note }),
      ...(data.reason === null ? {} : { _reason: data.reason }),
      ...(data.sessionId === null ? {} : { _session_id: data.sessionId }),
    });
    if (error) throw new Error(error.message);
    return { id: (id as string | null) ?? null };
  });

export const getOpenPurchaseProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("open_purchase_proposals", {
      _company_id: data.companyId,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as PurchaseProposal[];
  });
