import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OrderItemRow } from "@/lib/purchase";
import { sortOrderItemsAlphabetically } from "./order-items-sort";

const row = (code: string, description: string | null): OrderItemRow => ({
  id: `item-${code}`,
  product_id: `product-${code}`,
  ordered_quantity: 1,
  unit_code: "kg",
  purchase_quantity: 1,
  purchase_unit_code: "cs",
  unit_cost: null,
  price_unit_code: "kg",
  supplier_product_code: null,
  products: { code, description },
});

const descriptions = (items: OrderItemRow[]) => items.map((item) => item.products?.description ?? "");

describe("Ordine alfabetico delle righe ordinate", () => {
  it("elenca le righe del fornitore in ordine alfabetico di descrizione", () => {
    const items = [
      row("00-015", "ARANCE SUD AFRICA"),
      row("00-019", "ANANAS COSTA RICA"),
      row("00-030", "UVA BIANCA IT"),
      row("00-029", "KIWI EST CL"),
      row("00-005", "BASILICO ERBE AROMATICHE IT A MAZZI"),
      row("00-049", "BROCCOLI ROMA IT"),
      row("00-045", "BASILICO IT CONF.100 GR."),
    ];

    assert.deepEqual(descriptions(sortOrderItemsAlphabetically(items)), [
      "ANANAS COSTA RICA",
      "ARANCE SUD AFRICA",
      "BASILICO ERBE AROMATICHE IT A MAZZI",
      "BASILICO IT CONF.100 GR.",
      "BROCCOLI ROMA IT",
      "KIWI EST CL",
      "UVA BIANCA IT",
    ]);
  });

  it("ignora maiuscole e minuscole e, a parità di descrizione, ordina per codice", () => {
    const sorted = sortOrderItemsAlphabetically([
      row("00-002", "aglio"),
      row("00-001", "AGLIO"),
      row("00-003", "zenzero"),
    ]);

    assert.deepEqual(
      sorted.map((item) => item.products?.code),
      ["00-001", "00-002", "00-003"],
    );
  });

  it("mette in fondo le righe senza descrizione e non modifica l'elenco originale", () => {
    const items = [row("00-009", null), row("00-008", "ananas")];
    const original = [...items];

    assert.deepEqual(descriptions(sortOrderItemsAlphabetically(items)), ["ananas", ""]);
    assert.deepEqual(items, original);
  });
});
