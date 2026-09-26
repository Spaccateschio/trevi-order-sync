import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Tutte le scritture degli acquisti passano dal server.
 * Regola tassativa: solo la conferma del carico merce muove la giacenza.
 */

const uuid = z.string().uuid();

export const createPurchaseOrdersFromList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: uuid,
        listId: uuid,
        destinationLocationId: uuid.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ids, error } = await supabaseAdmin.rpc("create_purchase_orders_from_list", {
      _company_id: data.companyId,
      _list_id: data.listId,
      _actor_user_id: context.userId,
      ...(data.destinationLocationId === null
        ? {}
        : { _destination_location_id: data.destinationLocationId }),
    });
    if (error) throw new Error(error.message);
    return { orderIds: (ids ?? []) as string[] };
  });

export const managePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        action: z.enum(["send", "set_destination", "notes", "cancel", "close"]),
        destinationLocationId: uuid.nullable(),
        notes: z.string().trim().max(1000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("manage_purchase_order", {
      _order_id: data.orderId,
      _action: data.action,
      _actor_user_id: context.userId,
      ...(data.destinationLocationId === null
        ? {}
        : { _destination_location_id: data.destinationLocationId }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const openPurchaseDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        origin: z.enum(["fornitore_b2b", "operatore_interno"]),
        declaredByName: z.string().trim().max(160).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("open_purchase_delivery", {
      _order_id: data.orderId,
      _origin: data.origin,
      ...(data.declaredByName === null ? {} : { _declared_by_name: data.declaredByName }),
    });
    if (error) throw new Error(error.message);
    return { deliveryId: id as string };
  });

export const setPurchaseDeliveryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deliveryItemId: uuid,
        declaredQuantity: z.number().min(0).nullable(),
        declaredWeight: z.number().min(0).nullable(),
        declaredProducer: z.string().trim().max(160).nullable(),
        declaredProducerLot: z.string().trim().max(120).nullable(),
        declaredExpiry: z.string().trim().max(10).nullable(),
        lineNotes: z.string().trim().max(500).nullable(),
        missingReason: z.string().trim().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_purchase_delivery_item", {
      _delivery_item_id: data.deliveryItemId,
      ...(data.declaredQuantity === null ? {} : { _declared_quantity: data.declaredQuantity }),
      ...(data.declaredWeight === null ? {} : { _declared_weight: data.declaredWeight }),
      ...(data.declaredProducer === null ? {} : { _declared_producer: data.declaredProducer }),
      ...(data.declaredProducerLot === null
        ? {}
        : { _declared_producer_lot: data.declaredProducerLot }),
      ...(data.declaredExpiry === null ? {} : { _declared_expiry: data.declaredExpiry }),
      ...(data.lineNotes === null ? {} : { _line_notes: data.lineNotes }),
      ...(data.missingReason === null ? {} : { _missing_reason: data.missingReason }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPurchaseDeliveryExtraItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deliveryId: uuid,
        productId: uuid,
        declaredQuantity: z.number().positive(),
        lineType: z.enum(["aggiunta_fornitore", "sostituzione"]),
        replacesOrderItemId: uuid.nullable(),
        unitCode: z.string().trim().max(20).nullable(),
        lineNotes: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("add_purchase_delivery_extra_item", {
      _delivery_id: data.deliveryId,
      _product_id: data.productId,
      _declared_quantity: data.declaredQuantity,
      _line_type: data.lineType,
      ...(data.replacesOrderItemId === null
        ? {}
        : { _replaces_order_item_id: data.replacesOrderItemId }),
      ...(data.unitCode === null ? {} : { _unit_code: data.unitCode }),
      ...(data.lineNotes === null ? {} : { _line_notes: data.lineNotes }),
    });
    if (error) throw new Error(error.message);
    return { deliveryItemId: id as string };
  });

export const submitPurchaseDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deliveryId: uuid,
        notes: z.string().trim().max(1000).nullable(),
        actorLabel: z.string().trim().max(160).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("submit_purchase_delivery", {
      _delivery_id: data.deliveryId,
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.actorLabel === null ? {} : { _actor_label: data.actorLabel }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptPurchaseDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ deliveryId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("accept_purchase_delivery", {
      _delivery_id: data.deliveryId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disputePurchaseDeliveryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deliveryItemId: uuid,
        reason: z.enum([
          "quantita_inferiore",
          "quantita_superiore",
          "non_consegnato",
          "non_ordinato",
          "qualita",
          "pezzatura",
          "altro",
        ]),
        notes: z.string().trim().max(1000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("dispute_purchase_delivery_item", {
      _delivery_item_id: data.deliveryItemId,
      _reason: data.reason,
      _actor_user_id: context.userId,
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolvePurchaseDeliveryDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        disputeId: uuid,
        resolution: z.enum(["accettata", "rettificata", "rifiutata"]),
        acceptedQuantity: z.number().min(0).nullable(),
        notes: z.string().trim().max(1000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("resolve_purchase_delivery_dispute", {
      _dispute_id: data.disputeId,
      _resolution: data.resolution,
      _actor_user_id: context.userId,
      ...(data.acceptedQuantity === null ? {} : { _accepted_quantity: data.acceptedQuantity }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const openGoodsReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ deliveryId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("open_goods_receipt", {
      _delivery_id: data.deliveryId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { receiptId: id as string };
  });

export const setGoodsReceiptItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        receiptItemId: uuid,
        verifiedQuantity: z.number().min(0).nullable(),
        producerName: z.string().trim().max(160).nullable(),
        producerLotCode: z.string().trim().max(120).nullable(),
        expiryDate: z.string().trim().max(10).nullable(),
        unitCost: z.number().min(0).nullable(),
        notes: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_goods_receipt_item", {
      _receipt_item_id: data.receiptItemId,
      _actor_user_id: context.userId,
      ...(data.verifiedQuantity === null ? {} : { _verified_quantity: data.verifiedQuantity }),
      ...(data.producerName === null ? {} : { _producer_name: data.producerName }),
      ...(data.producerLotCode === null ? {} : { _producer_lot_code: data.producerLotCode }),
      ...(data.expiryDate === null ? {} : { _expiry_date: data.expiryDate }),
      ...(data.unitCost === null ? {} : { _unit_cost: data.unitCost }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmGoodsReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ receiptId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("confirm_goods_receipt", {
      _receipt_id: data.receiptId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const openLotReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        productId: uuid,
        locationId: uuid,
        notes: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("open_lot_reconciliation", {
      _product_id: data.productId,
      _location_id: data.locationId,
      _actor_user_id: context.userId,
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { reconciliationId: id as string };
  });

export const resolveLotReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reconciliationId: uuid,
        action: z.enum(["attribute", "ignore"]),
        stockLotId: uuid.nullable(),
        quantity: z.number().nullable(),
        notes: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("resolve_lot_reconciliation", {
      _reconciliation_id: data.reconciliationId,
      _action: data.action,
      _actor_user_id: context.userId,
      ...(data.stockLotId === null ? {} : { _stock_lot_id: data.stockLotId }),
      ...(data.quantity === null ? {} : { _quantity: data.quantity }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Il codice del link esterno viene mostrato una sola volta: nel database resta soltanto la sua impronta. */
export const createOrderShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        recipientLabel: z.string().trim().max(160).nullable(),
        validHours: z.number().int().min(1).max(720),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { randomBytes, createHash } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + data.validHours * 3600 * 1000).toISOString();
    const { error } = await supabaseAdmin.rpc("create_order_share_link", {
      _order_id: data.orderId,
      _token_hash: tokenHash,
      _expires_at: expiresAt,
      _actor_user_id: context.userId,
      ...(data.recipientLabel === null ? {} : { _recipient_label: data.recipientLabel }),
    });
    if (error) throw new Error(error.message);
    return { token, expiresAt };
  });

export const revokeOrderShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ linkId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("revoke_order_share_link", {
      _link_id: data.linkId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
