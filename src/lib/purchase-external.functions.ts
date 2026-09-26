import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Pagina del fornitore senza account: l'accesso è consentito solo dal codice ricevuto
 * e riguarda esclusivamente quell'ordine. Nessun accesso diretto alle tabelle.
 * La dichiarazione non crea mai giacenza: quella nasce solo dal carico merce.
 */

const tokenSchema = z.object({ token: z.string().min(10).max(200) });

async function hashToken(token: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("hex");
}

type Snapshot = {
  order_id: string;
  number: string;
  status: string;
  buyer: string | null;
  items: Array<{
    order_item_id: string;
    code: string;
    description: string | null;
    ordered_quantity: number;
    unit_code: string | null;
    supplier_product_code: string | null;
  }>;
};

export const externalOrderSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: snapshot, error } = await supabaseAdmin.rpc("external_order_snapshot", {
      _token_hash: await hashToken(data.token),
    });
    if (error) throw new Error(error.message);
    return snapshot as unknown as Snapshot;
  });

/** Apre (o riprende) la dichiarazione del fornitore esterno e restituisce le righe da compilare. */
export const externalDeliveryDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await hashToken(data.token);
    // Il codice determina l'ordine: nessun identificativo arriva dal browser.
    const { data: deliveryId, error } = await supabaseAdmin.rpc("external_open_delivery", {
      _token_hash: tokenHash,
    });
    if (error) throw new Error(error.message);
    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("purchase_deliveries")
      .select("order_id")
      .eq("id", deliveryId as string)
      .single();
    if (deliveryError) throw new Error(deliveryError.message);
    const orderId = delivery.order_id;
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("purchase_delivery_items")
      .select(
        "id, product_id, order_item_id, declared_quantity, unit_code, declared_producer, declared_producer_lot, declared_expiry, line_notes, missing_reason, products(code, description)",
      )
      .eq("delivery_id", deliveryId as string)
      .order("id");
    if (rowsError) throw new Error(rowsError.message);
    const { data: order } = await supabaseAdmin
      .from("purchase_orders")
      .select("number")
      .eq("id", orderId as string)
      .maybeSingle();
    return {
      deliveryId: deliveryId as string,
      orderNumber: order?.number ?? "",
      items: (rows ?? []) as unknown as Array<{
        id: string;
        product_id: string;
        order_item_id: string | null;
        declared_quantity: number;
        unit_code: string | null;
        declared_producer: string | null;
        declared_producer_lot: string | null;
        declared_expiry: string | null;
        line_notes: string | null;
        missing_reason: string | null;
        products: { code: string; description: string | null } | null;
      }>,
    };
  });

export const externalSetDeliveryItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(10).max(200),
        deliveryItemId: z.string().uuid(),
        declaredQuantity: z.number().min(0).nullable(),
        declaredProducer: z.string().trim().max(160).nullable(),
        declaredProducerLot: z.string().trim().max(120).nullable(),
        declaredExpiry: z.string().trim().max(10).nullable(),
        lineNotes: z.string().trim().max(500).nullable(),
        missingReason: z.string().trim().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // La funzione verifica che la riga appartenga all'ordine del codice.
    const { error } = await supabaseAdmin.rpc("external_set_delivery_item", {
      _token_hash: await hashToken(data.token),
      _delivery_item_id: data.deliveryItemId,
      ...(data.declaredQuantity === null ? {} : { _declared_quantity: data.declaredQuantity }),
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

export const externalSubmitDelivery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(10).max(200),
        deliveryId: z.string().uuid(),
        notes: z.string().trim().max(1000).nullable(),
        actorLabel: z.string().trim().max(160).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // La funzione verifica che la dichiarazione appartenga all'ordine del codice.
    const { error } = await supabaseAdmin.rpc("external_submit_delivery", {
      _token_hash: await hashToken(data.token),
      _delivery_id: data.deliveryId,
      ...(data.notes === null ? {} : { _notes: data.notes }),
      ...(data.actorLabel === null ? {} : { _actor_label: data.actorLabel }),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
