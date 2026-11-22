import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openedCardScrollDelta } from "./opened-card-scroll";

describe("scorrimento di una card appena aperta", () => {
  it("non muove la pagina se la card è già interamente visibile", () => {
    assert.equal(openedCardScrollDelta(180, 600, 156, 684), 0);
  });

  it("porta il titolo sotto la barra quando è coperto", () => {
    assert.equal(openedCardScrollDelta(92, 400, 156, 684), -64);
  });

  it("raggiunge una card aperta più in basso nella pagina", () => {
    assert.equal(openedCardScrollDelta(900, 1100, 156, 684), 744);
  });

  it("privilegia il titolo quando la card espansa è più alta dello spazio visibile", () => {
    assert.equal(openedCardScrollDelta(200, 1000, 156, 684), 44);
  });
});
