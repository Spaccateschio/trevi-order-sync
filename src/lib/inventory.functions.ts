import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Le scritture di inventario passano sempre dal server: azienda, ruolo e coerenza li verifica il database. */

const locationSchema = z.object({
  companyId: z.string().uuid(),
  action: z.enum(["create", "update", "activate", "deactivate", "set_default"]),
  locationId: z.string().uuid().nullable(),
  name: z.string().trim().max(60).nullable(),
  code: z.string().trim().max(20).nullable(),
  notes: z.string().trim().max(500).nullable(),
  isDefault: z.boolean().nullable(),
});

const stockSettingsSchema = z.object({
  companyId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(5000),
  minStock: z.number().min(0).nullable(),
  orderMultiple: z.number().positive().nullable(),
  stockUnitId: z.string().uuid().nullable(),
  coverageDays: z.number().int().min(0).nullable(),
  perishability: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(500).nullable(),
  clearFields: z.array(
    z.enum(["min_stock", "order_multiple", "stock_unit_id", "coverage_days", "perishability", "notes"]),
  ),
});

const sessionSchema = z.object({
  companyId: z.string().uuid(),
  action: z.enum(["open", "rename", "close", "cancel"]),
  sessionId: z.string().uuid().nullable(),
  archiveId: z.string().uuid().nullable(),
  name: z.string().trim().max(120).nullable(),
  scope: z.enum(["generale", "ubicazione"]),
  locationId: z.string().uuid().nullable(),
  notes: z.string().trim().max(500).nullable(),
});

const countSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().uuid(),
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  countedQuantity: z.number().min(0),
  unitId: z.string().uuid().nullable(),
  unitCode: z.string().trim().max(20).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

const adjustmentSchema = z.object({
  companyId: z.string().uuid(),
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().refine((value) => value !== 0, "La rettifica non può essere zero"),
  reason: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(500).nullable(),
});

export const ensureDefaultInventoryLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await context.supabase.rpc("is_company_member", {
      _company_id: data.companyId,
    });
    if (member !== true) throw new Error("Accesso non consentito");
    const { data: id, error } = await supabaseAdmin.rpc("ensure_default_inventory_location", {
      _company_id: data.companyId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const manageInventoryLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => locationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("manage_inventory_location", {
      _company_id: data.companyId,
      _action: data.action,
      _actor_user_id: context.userId,
      ...(data.locationId === null ? {} : { _location_id: data.locationId }),
      ...(data.name === null ? {} : { _name: data.name }),
      ...(data.code === null ? {} : { _code: data.code }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.isDefault === null ? {} : { _is_default: data.isDefault }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const manageProductStockSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stockSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: changed, error } = await supabaseAdmin.rpc("manage_product_stock_settings", {
      _company_id: data.companyId,
      _product_ids: data.productIds,
      _clear_fields: data.clearFields,
      _actor_user_id: context.userId,
      ...(data.minStock === null ? {} : { _min_stock: data.minStock }),
      ...(data.orderMultiple === null ? {} : { _order_multiple: data.orderMultiple }),
      ...(data.stockUnitId === null ? {} : { _stock_unit_id: data.stockUnitId }),
      ...(data.coverageDays === null ? {} : { _coverage_days: data.coverageDays }),
      ...(data.perishability === null ? {} : { _perishability: data.perishability }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { changed: (changed as number) ?? 0 };
  });

export const manageInventorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sessionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("manage_inventory_session", {
      _company_id: data.companyId,
      _action: data.action,
      _scope: data.scope,
      _actor_user_id: context.userId,
      ...(data.sessionId === null ? {} : { _session_id: data.sessionId }),
      ...(data.archiveId === null ? {} : { _archive_id: data.archiveId }),
      ...(data.name === null ? {} : { _name: data.name }),
      ...(data.locationId === null ? {} : { _location_id: data.locationId }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const recordInventoryCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("record_inventory_count", {
      _company_id: data.companyId,
      _session_id: data.sessionId,
      _product_id: data.productId,
      _location_id: data.locationId,
      _counted_quantity: data.countedQuantity,
      _actor_user_id: context.userId,
      ...(data.unitId === null ? {} : { _unit_id: data.unitId }),
      ...(data.unitCode === null ? {} : { _unit_code: data.unitCode }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const recordInventoryAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adjustmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("record_inventory_adjustment", {
      _company_id: data.companyId,
      _product_id: data.productId,
      _location_id: data.locationId,
      _quantity: data.quantity,
      _reason: data.reason,
      _actor_user_id: context.userId,
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });
