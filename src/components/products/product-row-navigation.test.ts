import { describe, expect, it } from "vitest";
import { adjacentProduct } from "./product-row-navigation";

const products = [{ id: "aglio" }, { id: "alloro" }, { id: "ananas" }];

describe("navigazione locale dei prodotti", () => {
  it("freccia giù apre il successivo nell'ordine ricevuto", () => {
    expect(adjacentProduct(products, "aglio", 1, 50, false)?.product.id).toBe("alloro");
  });
  it("freccia su apre il precedente", () => {
    expect(adjacentProduct(products, "ananas", -1, 50, false)?.product.id).toBe("alloro");
  });
  it("si ferma ai due estremi senza ricominciare", () => {
    expect(adjacentProduct(products, "aglio", -1, 50, false)).toBeNull();
    expect(adjacentProduct(products, "ananas", 1, 50, false)).toBeNull();
  });
  it("attraversa il confine della pagina in entrambe le direzioni", () => {
    expect(adjacentProduct(products, "alloro", 1, 2, false)).toEqual({ product: products[2], page: 1 });
    expect(adjacentProduct(products, "ananas", -1, 2, false)).toEqual({ product: products[1], page: 0 });
  });
  it("usa solo i risultati filtrati e il loro ordinamento", () => {
    expect(adjacentProduct([products[2], products[0]], "ananas", 1, 50, false)?.product.id).toBe("aglio");
  });
  it("la vista tutti non cambia pagina", () => {
    expect(adjacentProduct(products, "alloro", 1, 2, true)?.page).toBe(0);
  });
  it("senza selezione inizia dall'estremo corrispondente", () => {
    expect(adjacentProduct(products, null, 1, 50, false)?.product.id).toBe("aglio");
    expect(adjacentProduct(products, "non-visibile", -1, 50, false)?.product.id).toBe("ananas");
  });
  it("nessuna navigazione su un elenco vuoto", () => {
    expect(adjacentProduct([], null, 1, 50, false)).toBeNull();
  });
});