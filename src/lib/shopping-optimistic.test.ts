import { describe, expect, it, vi } from "vitest";
import { createKeyedChain, createRefreshBatcher, patchLock, patchRowQuantity } from "./shopping-optimistic";

describe("conferma ottimistica della riga", () => {
  it("cambia solo la riga confermata", () => {
    const rows = [{ item_id: "a", decided_quantity: null }, { item_id: "b", decided_quantity: 2 }];
    const next = patchRowQuantity(rows, "a", 5)!;
    expect(next[0]!.decided_quantity).toBe(5);
    expect(next[1]).toBe(rows[1]);
  });
  it("ripristino: riapplica il valore precedente", () => {
    const rows = [{ item_id: "a", decided_quantity: 3 }];
    const back = patchRowQuantity(patchRowQuantity(rows, "a", 9), "a", 3)!;
    expect(back[0]!.decided_quantity).toBe(3);
  });
  it("blocco segnato subito e tolto al ripristino", () => {
    const m = new Map([["a", { lockedAt: null, unitId: null, unitCode: null }]]);
    expect(patchLock(m, "a", { lockedAt: "t" })!.get("a")!.lockedAt).toBe("t");
    expect(patchLock(patchLock(m, "a", { lockedAt: "t" }), "a", { lockedAt: null })!.get("a")!.lockedAt).toBeNull();
  });
});

describe("ricarica unica in sottofondo", () => {
  it("una sola ricarica dopo più conferme in corso", () => {
    const flush = vi.fn();
    const b = createRefreshBatcher(flush);
    b.begin(); b.begin();
    b.end("a");
    expect(flush).not.toHaveBeenCalled();
    b.end("b", true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(["a", "b"], true);
  });
});


it("coda per prodotto: stessa chiave in fila, chiavi diverse in parallelo", async () => {
  const chain = createKeyedChain();
  const order: string[] = [];
  let releaseA!: () => void;
  const a1 = chain.run("A", () => new Promise<void>((r) => { releaseA = () => { order.push("A1"); r(); }; }));
  const a2 = chain.run("A", async () => { order.push("A2"); });
  const b1 = chain.run("B", async () => { order.push("B1"); });
  await b1;
  expect(order).toEqual(["B1"]);
  expect(chain.has("A")).toBe(true);
  releaseA();
  await Promise.all([a1, a2]);
  expect(order).toEqual(["B1", "A1", "A2"]);
  expect(chain.has("A")).toBe(false);
});

it("coda per prodotto: un errore viene restituito e non blocca l'operazione successiva", async () => {
  const chain = createKeyedChain();
  const failed = chain.run("A", async () => { throw new Error("rete"); });
  const next = chain.run("A", async () => "ok");
  await expect(failed).rejects.toThrow("rete");
  await expect(next).resolves.toBe("ok");
  expect(chain.has("A")).toBe(false);
});
