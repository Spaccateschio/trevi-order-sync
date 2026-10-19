import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

type Stock = { has_count: boolean; quantity: number | null; counted_at: string | null; counted_by: string | null };
type Case = { name: string; args: Record<string, unknown>; label: string; result: unknown };
type Baseline = { products: { id: string }[]; locations: { id: string }[]; cases: Case[] };

// Opt-in integration tests: only authenticated read-only RPCs, never fixtures written to DB.
const fixturePath = process.env.STOCK_SECURITY_BASELINE;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const url = process.env.STOCK_SECURITY_URL;
const key = process.env.STOCK_SECURITY_KEY;
const configured = Boolean(fixturePath && sessionJson && url && key);

describe("inventory_location_stock: authenticated read-only security", { skip: !configured }, () => {
  async function setup() {
    assert.ok(fixturePath && sessionJson && url && key);
    const baseline = JSON.parse(readFileSync(fixturePath, "utf8")) as Baseline;
    const session = JSON.parse(sessionJson) as { access_token: string };
    const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
    const userResponse = await fetch(`${url}/auth/v1/user`, { headers });
    assert.equal(userResponse.status, 200);
    const user = await userResponse.json() as { id: string };
    assert.equal(user.id, "b9db9303-4b9d-4135-a8d5-94bfb6fa5758");
    async function rpc(name: string, args: Record<string, unknown>) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });
      assert.equal(response.status, 200, `Read RPC failed: ${name}`);
      return await response.json() as unknown;
    }
    return { baseline, rpc };
  }

  it("authorized stock retains all four values before and after", async () => {
    const { baseline, rpc } = await setup();
    const cases = baseline.cases.filter(c => c.label === "product-location");
    assert.ok(cases.length > 0);
    for (const c of cases) assert.deepEqual(await rpc(c.name, c.args), c.result);
  });

  it("authorized missing count remains false/null/null/null", async () => {
    const { baseline, rpc } = await setup();
    const c = baseline.cases.find(c => c.label === "product-location" && !(c.result as Stock[])[0]?.has_count);
    assert.ok(c);
    assert.deepEqual(await rpc(c.name, c.args), [{ has_count: false, quantity: null, counted_at: null, counted_by: null }]);
  });

  it("authorized NULL location preserves the previous result", async () => {
    const { baseline, rpc } = await setup();
    const cases = baseline.cases.filter(c => c.label === "null-location");
    assert.ok(cases.length > 0);
    for (const c of cases) assert.deepEqual(await rpc(c.name, c.args), c.result);
  });

  it("NULL product returns zero rows", async () => {
    const { rpc } = await setup();
    assert.deepEqual(await rpc("inventory_location_stock", { _product_id: null, _location_id: null }), []);
  });

  it("nonexistent product returns zero rows", async () => {
    const { rpc } = await setup();
    assert.deepEqual(await rpc("inventory_location_stock", { _product_id: "00000000-0000-0000-0000-000000000000", _location_id: null }), []);
  });

  it("nonexistent location returns zero rows", async () => {
    const { baseline, rpc } = await setup();
    const product = baseline.products[0];
    assert.ok(product);
    assert.deepEqual(await rpc("inventory_location_stock", { _product_id: product.id, _location_id: "00000000-0000-0000-0000-000000000000" }), []);
  });

  for (const name of ["inventory_location_stock_list", "inventory_requirements", "product_stock_overview", "product_lot_reconciliation"]) {
    it(`${name}: complete authorized results unchanged`, async () => {
      const { baseline, rpc } = await setup();
      const cases = baseline.cases.filter(c => c.name === name);
      assert.ok(cases.length > 0);
      for (const c of cases) assert.deepEqual(await rpc(c.name, c.args), c.result);
    });
  }
});