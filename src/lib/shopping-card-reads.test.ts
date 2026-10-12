import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { batchCardRead } from "./shopping-card-reads";

describe("letture collettive delle card", () => {
  it("richieste simultanee e ripetute usano una lettura con tutti gli id", async () => {
    const calls: string[][] = [];
    const read = batchCardRead(async (ids) => { calls.push(ids); return new Map(ids.map((id) => [id, id.toUpperCase()])); });
    assert.deepEqual(await Promise.all([read("a"), read("b"), read("a")]), ["A", "B", "A"]);
    assert.deepEqual(calls, [["a", "b"]]);
    await read("a"); assert.equal(calls.length, 2);
  });
  it("un errore raggiunge tutte le card senza falsi dati", async () => {
    const read = batchCardRead(async () => { throw new Error("read failed"); });
    const result = await Promise.allSettled([read("a"), read("b")]);
    assert.deepEqual(result.map((r) => r.status), ["rejected", "rejected"]);
  });
});