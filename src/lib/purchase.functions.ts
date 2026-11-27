import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isClosedListUndoError } from "@/lib/order-sharing";
import type { ReceiveBundle, ReceiveLine } from "@/components/purchase/receive-outcomes";
import { matchIncassiLines, type IncassiDocLine, type IncassiReceiveDoc } from "@/lib/incassi/incassi-receive";

/**
 * Tutte le scritture degli acquisti passano dal server.
 * Regola tassativa: solo la conferma del carico merce muove la giacenza.
 */

const uuid = z.string().uuid();

/** Read-only bundle: opening receipt never creates a delivery or a CAR. */
export const getReceivePurchaseOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid, deliveryId: uuid.nullable() }).parse(input))
  .handler(async ({ data, context }): Promise<ReceiveBundle> => {
    const db = context.supabase;
    const { data: order, error } = await db.from('purchase_orders').select('id, company_id, archive_id, status, updated_at').eq('id', data.orderId).single();
    if (error || !order) throw new Error(error?.message ?? 'Ordine non trovato');
    const { data: member, error: memberError } = await db.rpc('is_company_member', { _company_id: order.company_id });
    if (memberError || !member) throw new Error('Ricezione riservata all’azienda acquirente');
    const [orderRows, deliveryRows, receiptRows] = await Promise.all([
      db.from('purchase_order_items').select('*, products(code, description)').eq('order_id', order.id).order('created_at'),
      db.from('purchase_deliveries').select('*').eq('order_id', order.id).order('sequence'),
      db.from('goods_receipts').select('id, delivery_id, status, updated_at, goods_receipt_items(id, updated_at, order_item_id, verified_quantity, delivery_item_id, unit_cost, price_unit_id, price_unit_code, price_quantity, producer_name, producer_lot_code, expiry_date)').eq('order_id', order.id),
    ]);
    for (const result of [orderRows, deliveryRows, receiptRows]) if (result.error) throw new Error(result.error.message);
    const receipts = receiptRows.data ?? [];
    const available = (deliveryRows.data ?? []).filter(d => !receipts.some(r => r.delivery_id === d.id && r.status === 'confermato'));
    const delivery = data.deliveryId ? available.find(d => d.id === data.deliveryId) : available[0];
    if (data.deliveryId && !delivery) throw new Error('Consegna già caricata o non appartenente a questo ordine');
    const orderItems = orderRows.data ?? [];
    const deliveryIds = (deliveryRows.data ?? []).map(d => d.id);
    const { data: historyItems, error: historyError } = deliveryIds.length ? await db.from('purchase_delivery_items').select('id, order_item_id, accepted_purchase_quantity').in('delivery_id', deliveryIds) : { data: [], error: null };
    if (historyError) throw new Error(historyError.message);
    const received = (itemId: string, hasPurchase: boolean) => receipts.filter(r => r.status === 'confermato').flatMap(r => r.goods_receipt_items).filter(r => r.order_item_id === itemId && (historyItems ?? []).some(d => d.id === r.delivery_item_id && d.order_item_id === itemId)).reduce((total, r) => {
      const purchase = (historyItems ?? []).find(d => d.id === r.delivery_item_id)?.accepted_purchase_quantity;
      return total + (hasPurchase ? purchase ?? 0 : r.verified_quantity);
    }, 0);
    const pendingReceipt = receipts.find(r => r.delivery_id === delivery?.id && r.status === 'bozza');
    let lines: ReceiveLine[];
    let incassiUnmatched: IncassiDocLine[] = [];
    if (delivery) {
      const { data: rows, error: rowsError } = await db.from('purchase_delivery_items').select('*, products(code, description)').eq('delivery_id', delivery.id).order('created_at');
      if (rowsError) throw new Error(rowsError.message);
      lines = (rows ?? []).map(row => {
        const oi = orderItems.find(i => i.id === row.order_item_id);
        const ri = pendingReceipt?.goods_receipt_items.find(i => i.delivery_item_id === row.id);
        const purchase = row.declared_purchase_quantity != null;
        const unit = purchase ? row.purchase_unit_code : row.unit_code;
        return {
          key: row.id, orderItemId: row.order_item_id, deliveryItemId: row.id, productId: row.product_id,
          code: row.products?.code ?? oi?.product_code ?? '', name: row.products?.description ?? oi?.product_name ?? 'Prodotto',
          version: row.updated_at, ordered: oi?.purchase_quantity ?? oi?.ordered_quantity ?? null,
          orderedUnitCode: oi ? (oi.purchase_quantity != null ? oi.purchase_unit_code : oi.unit_code) : null,
          baseline: delivery.status === 'accettata' || delivery.status === 'chiusa_con_rifiuti' ? row.accepted_purchase_quantity ?? row.accepted_quantity ?? row.declared_purchase_quantity ?? row.declared_quantity ?? 0 : purchase ? row.declared_purchase_quantity ?? 0 : row.declared_quantity ?? 0,
          unitCode: unit, stockUnitCode: row.unit_code, sameUnit: Boolean(unit && row.unit_code && unit.toLowerCase() === row.unit_code.toLowerCase()),
          declaredStock: row.declared_quantity, declaredPurchase: row.declared_purchase_quantity, lineType: row.line_type,
          producer: ri?.producer_name ?? row.declared_producer, lot: ri?.producer_lot_code ?? row.declared_producer_lot,
          expiry: ri?.expiry_date ?? row.declared_expiry, unitCost: ri?.unit_cost ?? row.declared_unit_price,
          priceUnitCode: ri?.price_unit_code ?? oi?.price_unit_code ?? null, priceUnitId: ri?.price_unit_id ?? oi?.price_unit_id ?? null,
          verifiedStock: ri?.verified_quantity ?? null, priceQuantity: ri?.price_quantity ?? null,
          receiptId: pendingReceipt?.id ?? null, receiptItemId: ri?.id ?? null,
          receiptVersion: pendingReceipt?.updated_at ?? null, receiptItemVersion: ri?.updated_at ?? null,
        };
      });
    } else {
      lines = orderItems.map(oi => {
        const unit = oi.purchase_quantity != null ? oi.purchase_unit_code : oi.unit_code;
        return {
          key: oi.id, orderItemId: oi.id, deliveryItemId: null, productId: oi.product_id,
          code: oi.products?.code ?? oi.product_code ?? '', name: oi.products?.description ?? oi.product_name ?? 'Prodotto',
          version: oi.updated_at, ordered: oi.purchase_quantity ?? oi.ordered_quantity, orderedUnitCode: unit,
          baseline: Math.max(0, (oi.purchase_quantity ?? oi.ordered_quantity ?? 0) - received(oi.id, oi.purchase_quantity != null)),
          unitCode: unit, stockUnitCode: oi.unit_code, sameUnit: Boolean(unit && oi.unit_code && unit.toLowerCase() === oi.unit_code.toLowerCase()),
          declaredStock: null, declaredPurchase: null, lineType: 'ordinata', producer: null, lot: null, expiry: null,
          unitCost: null, priceUnitCode: oi.price_unit_code, priceUnitId: oi.price_unit_id, verifiedStock: null, priceQuantity: null,
        };
      }).filter(line => line.baseline > 0);
    }
    let incassiDocuments: IncassiReceiveDoc[] = [];
    if (!delivery) {
      // Read-only: the order above was read with the caller's session, so the DDT belong to an order they can see.
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data: docs, error: docsError } = await supabaseAdmin.from('supplier_delivery_documents')
        .select('id, doc_number, doc_date, consegna_stato, lines').eq('purchase_order_id', order.id).eq('buyer_company_id', order.company_id);
      if (docsError) throw new Error(docsError.message);
      incassiDocuments = (docs ?? []).map(d => ({ id: d.id, docNumber: d.doc_number, docDate: d.doc_date, consegnaStato: d.consegna_stato,
        lines: (Array.isArray(d.lines) ? d.lines as IncassiDocLine[] : []).map(l => ({ code: l.code ?? null, description: l.description ?? null, qty: l.qty ?? null, um: l.um ?? null, price: l.price ?? null })) }));
      const match = matchIncassiLines(lines.map(l => {
        const oi = orderItems.find(i => i.id === l.orderItemId);
        return { key: l.key, supplierCode: oi?.supplier_product_code ?? null, ordered: l.ordered, orderedUnitCode: l.orderedUnitCode ?? null };
      }), incassiDocuments);
      lines = lines.map(l => match.byKey[l.key] ? { ...l, incassi: match.byKey[l.key]! } : l);
      incassiUnmatched = match.unmatched;
    }
    return {
      incassiDocuments, incassiUnmatched,
      companyId: order.company_id, archiveId: order.archive_id, orderVersion: order.updated_at,
      delivery: delivery ? { id: delivery.id, origin: delivery.origin, status: delivery.status, version: delivery.updated_at } : null,
      receiptId: pendingReceipt?.id ?? null, lines: lines.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })),
    };
  });

const receiveLineSchema = z.object({
  order_item_id: uuid.nullable(), delivery_item_id: uuid.nullable(), version: z.string(),
  receipt_id: uuid.nullable(), receipt_item_id: uuid.nullable(), receipt_version: z.string().nullable(), receipt_item_version: z.string().nullable(),
  outcome: z.enum(['ok', 'parziale', 'mancante', 'danneggiato']), quantity: z.number().finite().nonnegative(),
  arrived_quantity: z.number().finite().nonnegative(), declared_stock_quantity: z.number().finite().nonnegative().nullable(),
  verified_quantity: z.number().finite().nonnegative(), missing_reason: z.string().max(300).nullable(),
  reason: z.enum(['quantita_inferiore', 'quantita_superiore', 'non_consegnato', 'non_ordinato', 'qualita', 'pezzatura', 'altro']),
  notes: z.string().max(1000).nullable(), producer: z.string().max(160).nullable(), lot: z.string().max(120).nullable(),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), unit_cost: z.number().finite().nonnegative().nullable(),
  price_unit_code: z.string().max(20).nullable(), price_quantity: z.number().finite().positive().nullable(),
  substitute_product_id: uuid.nullable(), substitute_quantity: z.number().finite().positive().nullable(),
});
export const receivePurchaseOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid, deliveryId: uuid.nullable(), orderVersion: z.string(), deliveryVersion: z.string().nullable(), key: uuid, lines: z.array(receiveLineSchema).min(1).max(500), notes: z.string().max(1000).nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc('receive_purchase_order', {
      _order_id: data.orderId, _order_version: data.orderVersion,
      ...(data.deliveryId ? { _delivery_id: data.deliveryId } : {}),
      ...(data.deliveryVersion ? { _delivery_version: data.deliveryVersion } : {}),
      ...(data.notes != null ? { _notes: data.notes } : {}),
      _request_key: data.key, _lines: data.lines,
    });
    if (error) {
      if (error.message.includes('sr.name')) throw new Error('La contestazione è bloccata da un errore nella notifica del fornitore. Nessun carico è stato registrato.');
      throw new Error(error.message);
    }
    return result as { receipt_id: string; delivery_id: string; duplicate: boolean };
  });

export const confirmNonB2bOrderShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid, channel: z.enum(["whatsapp", "email", "sms", "telefono", "di_persona", "altro", "copia_testo"]), recipient: z.string().trim().max(320).nullable(), key: uuid, mode: z.enum(["first", "resend"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("confirm_non_b2b_order_share", { _order_id: data.orderId, _channel: data.channel, _recipient: data.recipient ?? "", _confirmation_key: data.key, _mode: data.mode });
    if (error) throw new Error(error.message);
    return result as { list_closed: boolean; duplicate: boolean };
  });

export const undoNonB2bOrderSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid, reason: z.string().trim().min(1, "Motivo obbligatorio").max(2000), key: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("undo_non_b2b_order_send_confirmation", { _order_id: data.orderId, _reason: data.reason, _confirmation_key: data.key });
    if (error) {
      // SQL remains the authority; reads only clarify an already rejected request.
      if (error.message === 'Attività successive incompatibili: conferma non annullabile') {
        const { data: order } = await context.supabase.from('purchase_orders').select('shopping_list_id').eq('id', data.orderId).maybeSingle();
        if (order?.shopping_list_id) {
          const { data: list } = await context.supabase.from('shopping_lists').select('status').eq('id', order.shopping_list_id).maybeSingle();
          if (isClosedListUndoError(error.message, list?.status ?? null)) {
            throw new Error('La Lista della Spesa è già chiusa. Non è possibile annullare questa conferma di invio.');
          }
        }
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const getOrderShareHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("order_share_history", { _order_id: data.orderId });
    if (error) throw new Error(error.message);
    return result as unknown as { id: string; at: string; actor: string; action: string; detail: { mode?: string; channel?: string; recipient?: string; reason?: string } | null }[];
  });

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
    const { data: ids, error } = await context.supabase.rpc("create_purchase_orders_from_list", {
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
        // Canale d'invio: obbligatorio per i fornitori non B2B (controllo nel database).
        sendChannel: z.enum(["whatsapp", "email", "sms", "telefono", "di_persona", "altro"]).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("manage_purchase_order", {
      ...(data.sendChannel ? { _send_channel: data.sendChannel } : {}),
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

/** Consegna e note dell'ordine DA INVIARE: modifica solo l'ordine, mai la Lista storica. */
export const setPurchaseOrderDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        timeFrom: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
        timeTo: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
        addressId: uuid.nullable(),
        addressText: z.string().trim().max(500).nullable(),
        supplierNotes: z.string().trim().max(2000).nullable(),
      })
      .refine((d) => !d.timeFrom || !d.timeTo || d.timeFrom < d.timeTo, "L'orario «dalle» deve precedere «alle»")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_purchase_order_delivery", {
      _order_id: data.orderId,
      _date: data.date as string,
      _time_from: data.timeFrom as string,
      _time_to: data.timeTo as string,
      _address_id: data.addressId as string,
      _address_text: data.addressText as string,
      _supplier_notes: data.supplierNotes as string,
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
        // Quantità nella U.M. d'acquisto (es. cassette): campo separato dai kg.
        declaredPurchaseQuantity: z.number().min(0).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_purchase_delivery_item", {
      ...(data.declaredPurchaseQuantity == null ? {} : { _declared_purchase_quantity: data.declaredPurchaseQuantity }),
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
    const { error } = await context.supabase.rpc("accept_purchase_delivery", {
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
    const { error } = await context.supabase.rpc("dispute_purchase_delivery_item", {
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
    const { error } = await context.supabase.rpc("resolve_purchase_delivery_dispute", {
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
    const { data: id, error } = await context.supabase.rpc("open_goods_receipt", {
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
        /** U.M. del prezzo: id dell'anagrafica aziendale oppure solo codice libero (fornitore non B2B). */
        priceUnitId: uuid.nullable().optional(),
        priceUnitCode: z.string().trim().max(20).nullable().optional(),
        clearPriceUnit: z.boolean().optional(),
        /** Quantità nella stessa U.M. del prezzo (es. 102,4 kg oppure 10 casse). */
        priceQuantity: z.number().positive().nullable().optional(),
        clearPriceQuantity: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_goods_receipt_item", {
      _receipt_item_id: data.receiptItemId,
      _actor_user_id: context.userId,
      ...(data.verifiedQuantity === null ? {} : { _verified_quantity: data.verifiedQuantity }),
      ...(data.producerName === null ? {} : { _producer_name: data.producerName }),
      ...(data.producerLotCode === null ? {} : { _producer_lot_code: data.producerLotCode }),
      ...(data.expiryDate === null ? {} : { _expiry_date: data.expiryDate }),
      ...(data.unitCost === null ? {} : { _unit_cost: data.unitCost }),
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.priceUnitId ? { _price_unit_id: data.priceUnitId } : {}),
      ...(data.priceUnitCode ? { _price_unit_code: data.priceUnitCode } : {}),
      ...(data.clearPriceUnit ? { _clear_price_unit: true } : {}),
      ...(data.priceQuantity ? { _price_quantity: data.priceQuantity } : {}),
      ...(data.clearPriceQuantity ? { _clear_price_quantity: true } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmGoodsReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ receiptId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_goods_receipt", {
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
    const { data: id, error } = await context.supabase.rpc("open_lot_reconciliation", {
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
    const { error } = await context.supabase.rpc("resolve_lot_reconciliation", {
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
        keepExisting: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + data.validHours * 3600 * 1000).toISOString();
    const { error } = await context.supabase.rpc("create_order_share_link", {
      _order_id: data.orderId,
      _token_hash: tokenHash,
      _expires_at: expiresAt,
      _actor_user_id: context.userId,
      ...(data.keepExisting ? { _keep_existing: true } : {}),
      ...(data.recipientLabel === null ? {} : { _recipient_label: data.recipientLabel }),
    });
    if (error) throw new Error(error.message);
    return { token, expiresAt };
  });

export const revokeOrderShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ linkId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("revoke_order_share_link", {
      _link_id: data.linkId,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
