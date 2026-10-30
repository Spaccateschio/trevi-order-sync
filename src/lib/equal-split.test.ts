import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { equalSplit } from "./supplier-memory";

describe("ripartizione in parti uguali tra fornitori con la stella", () => {
  it("5 tra due fornitori = 2,5 + 2,5", () => assert.deepEqual(equalSplit(5, 2), [2.5, 2.5]));
  it("un solo fornitore riceve tutto", () => assert.deepEqual(equalSplit(5, 1), [5]));
  it("10 tra tre: la somma resta 10", () => {
    const p = equalSplit(10, 3);
    assert.deepEqual(p, [3.333, 3.333, 3.334]);
  });
});
