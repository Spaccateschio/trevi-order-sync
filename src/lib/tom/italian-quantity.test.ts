import { describe, expect, it } from "vitest";

import { matchAllowedUnit, parseItalianQuantity } from "./italian-quantity";
import { parseQuickCommand } from "./tom-commands";
import { rankProducts } from "./product-match";

describe("Tom: quantità in italiano", () => {
  it("«tre» = 3", () => expect(parseItalianQuantity("tre").quantity).toBe(3));
  it("«una cassa» = 1 cassa", () => expect(parseItalianQuantity("una cassa")).toMatchObject({ quantity: 1, unitWord: "cassa" }));
  it("«tre e mezzo» = 3,5", () => expect(parseItalianQuantity("tre e mezzo").quantity).toBe(3.5));
  it("«due virgola cinque chili» = 2,5 kg", () => expect(parseItalianQuantity("due virgola cinque chili")).toMatchObject({ quantity: 2.5, unitWord: "kg" }));
  it("«dodici» = 12", () => expect(parseItalianQuantity("dodici").quantity).toBe(12));
  it("«venti casse» = 20 cassa", () => expect(parseItalianQuantity("venti casse")).toMatchObject({ quantity: 20, unitWord: "cassa" }));
  it("«ventitré» = 23 e «centoventi» = 120", () => {
    expect(parseItalianQuantity("ventitré").quantity).toBe(23);
    expect(parseItalianQuantity("centoventi").quantity).toBe(120);
  });
  it("«2,5 kg» con cifre", () => expect(parseItalianQuantity("2,5 kg")).toMatchObject({ quantity: 2.5, unitWord: "kg" }));
  it("«zero» detto esplicitamente = 0", () => expect(parseItalianQuantity("zero")).toMatchObject({ quantity: 0, explicitZero: true }));
  it("numero non capito = vuoto, mai zero", () => {
    expect(parseItalianQuantity("casse").quantity).toBeNull();
    expect(parseItalianQuantity("boh non so").quantity).toBeNull();
    expect(parseItalianQuantity("").quantity).toBeNull();
  });
  it("due numeri diversi = non chiaro", () => expect(parseItalianQuantity("tre o quattro").quantity).toBeNull());
});

describe("Tom: U.M. ammesse", () => {
  const allowed = [{ id: "a", code: "kg" }, { id: "b", code: "cs" }];
  it("«casse» trova cs", () => expect(matchAllowedUnit("cassa", allowed)?.id).toBe("b"));
  it("U.M. non ammessa = null", () => expect(matchAllowedUnit("mazzo", allowed)).toBeNull());
});

describe("Tom: comandi brevi", () => {
  it("riconosce salta, ripeti, annulla, riepilogo, fine", () => {
    expect(parseQuickCommand("salta", true)?.kind).toBe("skip");
    expect(parseQuickCommand("ripeti", true)?.kind).toBe("repeat");
    expect(parseQuickCommand("annulla l'ultimo", true)?.kind).toBe("undo");
    expect(parseQuickCommand("riepilogo", true)?.kind).toBe("summary");
    expect(parseQuickCommand("basta", false)?.kind).toBe("end");
  });
  it("«no, erano 5» è una correzione con 5", () => expect(parseQuickCommand("no, erano 5", true)).toMatchObject({ kind: "correct", quantity: 5 }));
  it("in guidata «4 casse» è una quantità; fuori guidata va al modello", () => {
    expect(parseQuickCommand("4 casse", true)).toMatchObject({ kind: "quantity", quantity: 4, unitWord: "cassa" });
    expect(parseQuickCommand("4 casse", false)).toBeNull();
  });
});

describe("Tom: ricerca prodotto", () => {
  it("«ananas costarica» trova ANANAS COSTA RICA", () => {
    const ranked = rankProducts("tre casse di ananas costarica", [
      { name: "ANANAS COSTA RICA" }, { name: "ANANAS ORSERO" }, { name: "BANANE" },
    ]);
    expect(ranked[0]?.item.name).toBe("ANANAS COSTA RICA");
  });
});
