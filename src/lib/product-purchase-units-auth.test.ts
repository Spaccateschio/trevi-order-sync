import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, middleware } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), middleware: {} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: middleware }));
vi.mock("@/integrations/supabase/client.server", () => {
  throw new Error("Privileged client must never be loaded");
});
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: (guards: unknown[]) => {
      if (!guards.includes(middleware)) throw new Error("Authentication middleware missing");
      return {
        inputValidator: (validate: (input: unknown) => unknown) => ({
          handler: (handler: (input: unknown) => unknown) => async ({ data }: { data: unknown }) =>
            handler({ data: validate(data), context: { supabase: { rpc, from }, userId: "session-user" } }),
        }),
      };
    },
  }),
}));

import { saveProductPurchaseUnits } from "./product-purchase-units.functions";

const productId = "00000000-0000-4000-8000-000000000001";
const unitId = "00000000-0000-4000-8000-000000000002";
const data = { productId, unitIds: [unitId], defaultUnitId: unitId };

describe("Purchase-unit save: caller session only", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => table === "products"
          ? { maybeSingle: async () => ({ data: { company_id: "company" }, error: null }) }
          : Promise.resolve({ data: [{ id: unitId, company_id: "company", status: "attivo", usage: "acquisto" }], error: null }),
      }),
    }));
    rpc.mockImplementation(async (name: string) => ({ data: name === "is_company_admin" ? true : null, error: null }));
  });

  it("uses the authenticated client's three-argument RPC, ignoring supplied identity", async () => {
    await expect(saveProductPurchaseUnits({ data: { ...data, _actor_user_id: "forged-user", companyId: "forged-company" } as typeof data })).resolves.toEqual({ saved: true });
    expect(rpc).toHaveBeenCalledWith("save_product_purchase_units", {
      _product_id: productId, _unit_ids: [unitId], _default_unit_id: unitId,
    });
  });

  it("rejects a non-admin before any save", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(saveProductPurchaseUnits({ data })).rejects.toThrow("Solo un amministratore");
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(["is_company_admin"]);
  });

  it("propagates the database authorization rejection instead of retrying with privileges", async () => {
    rpc.mockImplementation(async (name: string) => name === "is_company_admin"
      ? { data: true, error: null }
      : { data: null, error: { message: "Solo amministratori aziendali" } });
    await expect(saveProductPurchaseUnits({ data })).rejects.toThrow("Solo amministratori aziendali");
    expect(rpc.mock.calls.filter((call) => call[0] === "save_product_purchase_units")).toHaveLength(1);
  });

  it("preserves null default with no actor argument", async () => {
    await saveProductPurchaseUnits({ data: { ...data, defaultUnitId: null } });
    expect(rpc).toHaveBeenCalledWith("save_product_purchase_units", {
      _product_id: productId, _unit_ids: [unitId], _default_unit_id: null,
    });
  });
});