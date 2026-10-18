import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

// Exercise validation and the real handler without any database writes.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (input: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) => handler({ data: validate(data) }),
    }),
  }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc },
}));

import { externalSetDeliveryItem } from "./purchase-external.functions";

const base = {
  token: "synthetic-delivery-token",
  deliveryItemId: "00000000-0000-4000-8000-000000000001",
  declaredQuantity: 2,
  declaredProducer: null,
  declaredProducerLot: null,
  declaredExpiry: null,
  lineNotes: null,
  missingReason: null,
};
const blankExtras = {
  declaredUnitPrice: null,
  declaredTareWeight: null,
  declaredGrossWeight: null,
  declaredNetWeight: null,
  declaredAltDescription: null,
};
const nullRpcExtras = {
  _declared_unit_price: null,
  _declared_tare_weight: null,
  _declared_gross_weight: null,
  _declared_net_weight: null,
  _declared_alt_description: null,
};

describe("external delivery optional fields", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });

  it("saves quantity-only delivery with explicit null keys selecting the new overload", async () => {
    await expect(externalSetDeliveryItem({ data: { ...base, ...blankExtras } })).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("external_set_delivery_item", expect.objectContaining({
      _declared_quantity: 2,
      ...nullRpcExtras,
    }));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the new keys when optional fields are omitted or description is empty", async () => {
    await externalSetDeliveryItem({ data: { ...base, declaredAltDescription: "  " } });
    expect(rpc).toHaveBeenCalledWith("external_set_delivery_item", expect.objectContaining(nullRpcExtras));
  });

  it("preserves zero price, zero tare and supplied weights and description", async () => {
    await externalSetDeliveryItem({ data: {
      ...base, declaredUnitPrice: 0, declaredTareWeight: 0,
      declaredGrossWeight: 2, declaredNetWeight: 2, declaredAltDescription: "Mele",
    } });
    expect(rpc).toHaveBeenCalledWith("external_set_delivery_item", expect.objectContaining({
      _declared_unit_price: 0, _declared_tare_weight: 0,
      _declared_gross_weight: 2, _declared_net_weight: 2,
      _declared_alt_description: "Mele",
    }));
  });

  it("preserves purchase quantity without inventing a stock quantity", async () => {
    await externalSetDeliveryItem({ data: { ...base, ...blankExtras, declaredQuantity: null, declaredPurchaseQuantity: 3 } });
    const args = rpc.mock.calls[0]?.[1];
    expect(args).toMatchObject({ _declared_purchase_quantity: 3, ...nullRpcExtras });
    expect(args).not.toHaveProperty("_declared_quantity");
  });

  it("still propagates token or ownership rejection instead of reporting success", async () => {
    rpc.mockResolvedValue({ error: { message: "Riga non valida per questo codice" } });
    await expect(externalSetDeliveryItem({ data: { ...base, ...blankExtras } })).rejects.toThrow("Riga non valida per questo codice");
  });
});