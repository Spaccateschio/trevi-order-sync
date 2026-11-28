import { test, expect } from "bun:test";
import { mergeBalances } from "./customer-balance";

test("nessuna risposta: saldo non disponibile", () => {
  expect(mergeBalances([])).toEqual({ available: false });
});
test("somma saldi e scaduti di più codici", () => {
  const r = mergeBalances([{ saldo: 10.1, scaduto: 0, documenti: [] }, { saldo: 0.2, scaduto: 5, documenti: [] }]);
  expect(r).toEqual({ available: true, saldo: 10.3, scaduto: 5, documenti: [] });
});
