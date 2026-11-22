import { describe, expect, it } from "vitest";
import { matchesShoppingHistoryFilter, shoppingListOrderSummary, shoppingListStatusMessage, type ShoppingListOrderStatus } from "./shopping-list-status";

const order = (id: string, sentAt: string | null, seenAt: string | null, status = "inviato"): ShoppingListOrderStatus => ({
  id, status, sent_at: sentAt, seen_by_supplier_at: seenAt,
});

describe("barra di stato della Lista", () => {
  it("senza lista indica la data proposta", () => {
    expect(shoppingListStatusMessage({ hasList: false, productCount: 0, orders: [], proposedDateLabel: "Dom 22/11/2026" }))
      .toBe("Nessuna lista fatta per il Dom 22/11/2026");
  });

  it("in lavorazione mostra il numero di prodotti", () => {
    expect(shoppingListStatusMessage({ hasList: true, productCount: 6, orders: [], proposedDateLabel: "Dom 22/11/2026" }))
      .toBe("Lista in lavorazione (6 prodotti)");
  });

  it("inviata conta ordini, visti e ancora da aprire", () => {
    const orders = [order("1", "2026-11-22T08:00:00Z", "2026-11-22T08:05:00Z"), order("2", "2026-11-22T08:01:00Z", null), order("3", null, null, "bozza")];
    expect(shoppingListOrderSummary(orders)).toEqual({ sent: 2, seen: 1, unopened: 1 });
    expect(shoppingListStatusMessage({ hasList: true, productCount: 6, orders, proposedDateLabel: "Dom 22/11/2026" }))
      .toBe("Lista inviata: 2 ordini, 1 visto dal fornitore, 1 ancora da aprire");
  });
});

describe("filtri dello Storico", () => {
  const sent = order("sent", "2026-11-22T08:00:00Z", null);
  const rows = [
    { status: "aperta", purchase_orders: [] },
    { status: "chiusa", purchase_orders: [sent] },
    { status: "annullata", purchase_orders: [] },
  ];

  it("Tutte nasconde le annullate per default", () => {
    expect(rows.filter((row) => matchesShoppingHistoryFilter(row, "tutte")).map((row) => row.status)).toEqual(["aperta", "chiusa"]);
  });

  it("separa lavorazione, inviate, chiuse e annullate", () => {
    expect(rows.filter((row) => matchesShoppingHistoryFilter(row, "lavorazione"))).toHaveLength(1);
    expect(rows.filter((row) => matchesShoppingHistoryFilter(row, "inviate"))).toHaveLength(1);
    expect(rows.filter((row) => matchesShoppingHistoryFilter(row, "chiuse"))).toHaveLength(1);
    expect(rows.filter((row) => matchesShoppingHistoryFilter(row, "annullate"))).toHaveLength(1);
  });
});
