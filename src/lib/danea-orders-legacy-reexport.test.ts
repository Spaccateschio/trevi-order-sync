import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDaneaOrdersXml, type DaneaOrderCandidate } from "./danea-orders-xml";
import { buildDaneaOrdersXml as buildLegacyXml } from "./danea-orders-xml.legacy";
import { attachPrices } from "./danea-orders-export.server";

/**
 * Riscarico per intervallo di ordini scaricati PRIMA dello storico prezzi
 * (nessuna riga in danea_order_export_lines): l'XML deve essere identico a
 * quello del generatore precedente, a parità di dati.
 */
const customer = {
  code: "0072", name: "CLIENTE PROVA SRL", address: "VIA PROVA 1", postcode: "00100", city: "ROMA",
  province: "RM", country: null, fiscal_code: "00000000000", vat_code: "00000000000", email: null,
  phone: null, sdi_code: null, pec: null, archive_ok: true,
};
const order = (id: string, number: string): DaneaOrderCandidate => ({
  order_id: id, number, sent_at: "2026-10-15T06:35:00Z", order_date: "2026-10-15",
  delivery_date: "2026-10-16", delivery_time_from: "06:00:00", delivery_time_to: "08:00:00",
  delivery_address_text: "VIA CONSEGNA 2", notes: "Nota cliente", buyer_name: "CLIENTE PROVA SRL", customer,
  already_exported: true,
  lines: [
    { item_id: `${id}-a`, seller_code: "0446", description: "ANANAS", quantity: 3, unit: "kg", price: 2.2, price_unit: "kg", vat_code: "4", vat_perc: 4, notes: null },
    { item_id: `${id}-b`, seller_code: "0013", description: "AGLIO", quantity: 3, unit: "pz", price: 4.5, price_unit: "kg", vat_code: "4", vat_perc: 4, notes: "teste" },
    { item_id: `${id}-c`, seller_code: "0014", description: "ALLORO", quantity: 2, unit: "nr", price: null, price_unit: null, vat_code: "22", vat_perc: 22, notes: null },
  ],
} as DaneaOrderCandidate);

test("riscarico senza storico prezzi: XML identico al generatore precedente", () => {
  const candidates = [order("o4", "ORD-2026-00004"), order("o5", "ORD-2026-00005")];
  const legacy = buildLegacyXml("TREVI SRL", candidates as never);
  const current = buildDaneaOrdersXml("TREVI SRL", attachPrices(candidates, []));
  assert.equal(current.xml, legacy.xml);
  assert.deepEqual(current.exportedIds, legacy.exportedIds);
});

test("senza storico nessun prezzo nuovo viene applicato alle righe", () => {
  const out = attachPrices([order("o4", "ORD-2026-00004")], []);
  assert.ok(out[0]!.lines.every((l) => l.export_price === null));
  assert.equal(out[0]!.lines[0]!.price, 2.2);
});
