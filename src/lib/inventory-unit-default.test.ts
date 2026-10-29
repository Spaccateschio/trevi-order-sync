import { describe, expect, it } from "vitest";

import { inventoryDefaultUnitId } from "./inventory-unit-default";

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
