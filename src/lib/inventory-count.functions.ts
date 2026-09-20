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
    const { error } = await context.supabase.rpc("manage_company_product_favorite", {
      _company_id: data.companyId,
      _product_id: data.productId,
      _favorite: data.favorite,
      _actor_user_id: context.userId,
    });
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
    const { data: rows, error } = await context.supabase.rpc("inventory_session_rows", {
      _session_id: data.sessionId,
      _favorites_only: data.favoritesOnly,
      ...(data.locationId === null ? {} : { _location_id: data.locationId }),
      ...(data.category === null ? {} : { _category: data.category }),
      ...(data.subcategory === null ? {} : { _subcategory: data.subcategory }),
      ...(data.search === null ? {} : { _search: data.search }),
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as InventoryCountRow[];
  });
