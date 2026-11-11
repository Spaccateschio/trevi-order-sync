import { describe, expect, it } from "vitest";

import { inventoryCardUnit, inventoryDefaultUnitId } from "./inventory-unit-default";

/** La prima U.M. abituale del prodotto è subito preferita sopra ultimo conteggio e magazzino. */
it("la prima U.M. abituale impostata sul prodotto vince su ultimo conteggio e magazzino", () => {
  const unit = inventoryDefaultUnitId({ preferredId: "cassa", lastCountedId: "kg", stockUnitId: "kg" });
  expect(unit).toBe("cassa");
});

/** Senza U.M. abituali il comportamento resta quello di prima: ultimo conteggio, poi magazzino. */
it("senza U.M. abituali vale l'ultimo conteggio, poi l'U.M. di magazzino", () => {
  expect(inventoryDefaultUnitId({ lastCountedId: "kg", stockUnitId: "kg" })).toBe("kg");
  expect(inventoryDefaultUnitId({ stockUnitId: "kg" })).toBe("kg");
});

/** La scelta fatta nella sessione vince sempre su tutto. */
it("la scelta fatta nella sessione vince sempre", () => {
  expect(inventoryDefaultUnitId({ chosenId: "pz", preferredId: "cassa", lastCountedId: "kg", stockUnitId: "kg" })).toBe("pz");
});

/** Senza nessun riferimento non c'è U.M. predefinita: mai inventata. */
it("senza riferimenti restituisce null", () => {
  expect(inventoryDefaultUnitId({})).toBeNull();
});

describe("unità condivisa tra selettore, bozza e conferma", () => {
  const options = [{ id: "case-id", code: "cs" }, { id: "kg-id", code: "kg" }];

  it("dopo ricaricamento e sblocco salva 3 cs, non 3 kg del conteggio precedente", () => {
    const selected = inventoryCardUnit({ options, preferredId: "case-id", lastCountedCode: "kg", stockCode: "kg" });
    expect({ quantity: 3, unitCode: selected.code, unitId: selected.id }).toEqual({ quantity: 3, unitCode: "cs", unitId: "case-id" });
  });

  it("una scelta esplicita o ripristinata dalla bozza conserva kg anche con preferita cs", () => {
    expect(inventoryCardUnit({ options, chosenId: "kg-id", preferredId: "case-id", lastCountedCode: "cs", stockCode: "kg" }))
      .toEqual({ id: "kg-id", code: "kg" });
  });

  it("senza preferita recupera il conteggio precedente ignorando maiuscole e spazi", () => {
    expect(inventoryCardUnit({ options, lastCountedCode: " CS ", stockCode: "kg" })).toEqual({ id: "case-id", code: "cs" });
  });

  it("una scelta non più ammessa non sostituisce l'unità mostrata", () => {
    expect(inventoryCardUnit({ options, chosenId: "removed-id", preferredId: "case-id", lastCountedCode: "kg" }))
      .toEqual({ id: "case-id", code: "cs" });
  });

  it("senza configurazione conserva solo il codice di magazzino disponibile", () => {
    expect(inventoryCardUnit({ options: [], stockCode: "kg" })).toEqual({ id: null, code: "kg" });
    expect(inventoryCardUnit({ options: [] })).toEqual({ id: null, code: null });
  });
});
