import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (input: unknown) => unknown) => ({
        handler:
          (handler: (input: unknown) => unknown) =>
          async ({ data }: { data: unknown }) =>
            handler({ data: validate(data), context: { supabase: { rpc }, userId: "test-user" } }),
      }),
    }),
  }),
}));
import { getPreparation, savePreparation } from "./preparation.functions";
const id = "00000000-0000-4000-8000-000000000001";
const command = {
  orderId: id,
  action: "confirm" as const,
  sourceSignature: "a".repeat(32),
  version: 3,
  itemId: id,
  lineVersion: 2,
  quantity: 2,
  weightKg: 11.8,
};
describe("Preparazione: chiamate autenticate senza dati operativi", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { companyId: id, members: [], orders: [] }, error: null });
  });
  it("lettura usa membership e non company_id arbitrario", async () => {
    await getPreparation({ data: { memberId: id } });
    expect(rpc).toHaveBeenCalledWith("preparation_bundle", { _member_id: id });
  });
  it("salva 2 casse e 11,8 kg con entrambe le versioni", async () => {
    await savePreparation({ data: command });
    expect(rpc).toHaveBeenCalledWith(
      "manage_order_preparation",
      expect.objectContaining({
        _quantity: 2,
        _weight_kg: 11.8,
        _version: 3,
        _line_version: 2,
        _source_signature: "a".repeat(32),
      }),
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("_company_id");
  });
  it("invia peso mancante come null", async () => {
    await savePreparation({ data: { ...command, weightKg: null } });
    expect(rpc.mock.calls[0]?.[1]._weight_kg).toBeNull();
  });
  it("accesso negato non diventa successo", async () => {
    rpc.mockResolvedValue({ error: { message: "PREP_FORBIDDEN" } });
    await expect(savePreparation({ data: command })).rejects.toThrow("accesso non autorizzato");
  });
  it("conflitto concorrente non diventa successo", async () => {
    rpc.mockResolvedValue({ error: { message: "PREP_CONFLICT" } });
    await expect(savePreparation({ data: command })).rejects.toThrow("altro preparatore");
  });
  it("scarico già avvenuto respinge la conferma", async () => {
    rpc.mockResolvedValue({ error: { message: "PREP_LOCKED" } });
    await expect(savePreparation({ data: command })).rejects.toThrow("già scaricato");
  });
  it("quantità zero respinta prima di chiamare DB", async () => {
    await expect(savePreparation({ data: { ...command, quantity: 0 } })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
