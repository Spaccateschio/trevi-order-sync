import { test } from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import { buildDaneaOrdersXml, daneaExportLineDecision, type DaneaOrderCandidate } from "./danea-orders-xml";
import { priceInfoMessage, priceListNotUpdatedToday } from "./price-info";

const customer = {
  code: "0072", name: "CLIENTE PROVA SRL", address: null, postcode: null, city: null, province: null,
  country: null, fiscal_code: null, vat_code: null, email: null, phone: null, sdi_code: null, pec: null, archive_ok: true,
};
const ep = (o = {}) => ({
  item_id: "i1", price: 2.5, price_unit_code: "kg", list_price: 2.5, reason: null,
  customer_price: 2.2, customer_price_unit_code: "kg", ...o,
});
const order = (exportPrice: ReturnType<typeof ep> | null): DaneaOrderCandidate => ({
  order_id: "o1", number: "ORD-2026-00007", sent_at: "2026-10-15T06:35:00Z", order_date: "2026-10-15",
  delivery_date: null, delivery_time_from: null, delivery_time_to: null, delivery_address_text: null,
  notes: null, buyer_name: null, customer,
  lines: [{ item_id: "i1", seller_code: "0446", description: "ANANAS", quantity: 3, unit: "kg", price: 2.2,
    price_unit: "kg", vat_code: "4", vat_perc: 4, notes: null, export_price: exportPrice as never }],
});
const row = (xml: string) =>
  new XMLParser({ isArray: (n) => n === "Document" || n === "Row" }).parse(xml).EasyfattDocuments.Documents.Document[0].Rows.Row[0];

test("allo scarico va in Danea il prezzo del listino in vigore (2,50), non quello visto all'ordine (2,20)", () => {
  const r = row(buildDaneaOrdersXml(null, [order(ep())]).xml);
  assert.equal(r.Price, 2.5);
  assert.match(String(r.Notes), /2,20/);
});

test("il prezzo visto dal cliente resta nel candidato, mai riscritto", () => {
  const o = order(ep());
  buildDaneaOrdersXml(null, [o]);
  assert.equal(o.lines[0]?.price, 2.2);
});

test("rapporto sospeso: nessun prezzo, nota «Prezzo da verificare»", () => {
  const d = daneaExportLineDecision(ep({ reason: "rapporto_non_attivo", price: null, list_price: null }));
  assert.equal(d.price, null);
  assert.match(String(d.note), /Prezzo da verificare/);
});

test("U.M. cliente diversa dal listino: prezzo e U.M. del listino, Qty invariata, ORDINATO in evidenza", () => {
  const r = row(buildDaneaOrdersXml(null, [order(ep({ reason: "um_diversa", price: null, list_price: 12, price_unit_code: "cs" }))]).xml);
  assert.equal(r.Price, 12);
  assert.equal(r.Um, "cs");
  assert.equal(r.Qty, 3);
  assert.match(String(r.Notes), /^>>> ORDINATO: 3 kg <<</);
  assert.doesNotMatch(String(r.Notes), /da pesare/);
});

test("U.M. listino vuota, prezzo cliente a kg, ordinato kg: riga normale", () => {
  const r = row(buildDaneaOrdersXml(null, [order(ep({ reason: "um_diversa", price: null, list_price: 3.8, price_unit_code: null, customer_price: 3.8 }))]).xml);
  assert.equal(r.Price, 3.8);
  assert.equal(r.Um, "kg");
  assert.equal(r.Notes, undefined);
});

test("U.M. listino vuota, prezzo cliente a kg, ordinato cs: prezzo, Um kg, ORDINATO 3 cs", () => {
  const o = order(ep({ reason: "um_diversa", price: null, list_price: 3, price_unit_code: null, customer_price: 3 }));
  o.lines[0]!.unit = "cs";
  const r = row(buildDaneaOrdersXml(null, [o]).xml);
  assert.equal(r.Price, 3);
  assert.equal(r.Um, "kg");
  assert.equal(r.Qty, 3);
  assert.match(String(r.Notes), /^>>> ORDINATO: 3 cs <<</);
});

test("riscarico con U.M. listino vuota: resta come prima", () => {
  const o = { ...order(ep({ reason: "um_diversa", price: null, list_price: 3, price_unit_code: null })), already_exported: true };
  const r = row(buildDaneaOrdersXml(null, [o]).xml);
  assert.equal(r.Price, undefined);
  assert.match(String(r.Notes), /da pesare/);
});

test("U.M. diversa senza U.M. del listino né del cliente: nessun prezzo, «da pesare»", () => {
  const r = row(buildDaneaOrdersXml(null, [order(ep({ reason: "um_diversa", price: null, price_unit_code: null, customer_price_unit_code: null }))]).xml);
  assert.equal(r.Price, undefined);
  assert.equal(r.Um, "kg");
  assert.match(String(r.Notes), /U\.M\. prezzo diversa – da pesare/);
});

test("riscarico di un ordine già esportato con U.M. diversa: resta come prima", () => {
  const o = { ...order(ep({ reason: "um_diversa", price: null, list_price: 12, price_unit_code: "cs" })), already_exported: true };
  const r = row(buildDaneaOrdersXml(null, [o]).xml);
  assert.equal(r.Price, undefined);
  assert.equal(r.Um, "kg");
  assert.match(String(r.Notes), /da pesare/);
});

test("prezzo mancante nel listino del cliente: mai 0, «Prezzo su richiesta»", () => {
  const r = row(buildDaneaOrdersXml(null, [order(ep({ reason: "prezzo_mancante", price: null, list_price: null }))]).xml);
  assert.equal(r.Price, undefined);
  assert.match(String(r.Notes), /Prezzo su richiesta/);
});

test("prezzo zero registrato non viene mai inviato", () => {
  assert.equal(daneaExportLineDecision(ep({ price: 0 })).price, null);
});

test("ordini scaricati prima dei prezzi da listino: restano col prezzo dell'ordine", () => {
  assert.equal(row(buildDaneaOrdersXml(null, [order(null)]).xml).Price, 2.2);
});

test("avviso: aggiornamento abituale 18:00, ultimo aggiornamento ieri → listino non aggiornato oggi", () => {
  assert.equal(priceListNotUpdatedToday("2026-10-14T16:05:00Z", "18:00:00", new Date("2026-10-15T17:00:00Z")), true);
});

test("avviso: aggiornato oggi alle 18:05 (Roma) → nessun avviso", () => {
  assert.equal(priceListNotUpdatedToday("2026-10-15T16:05:00Z", "18:00:00", new Date("2026-10-15T17:00:00Z")), false);
});

test("avviso: senza orario abituale nessun avviso", () => {
  assert.equal(priceListNotUpdatedToday(null, null), false);
});

test("messaggio senza orario abituale: la parte dell'orario è omessa", () => {
  const m = priceInfoMessage({ last_price_update_at: "2026-10-15T16:05:00Z", usual_update_time: null, info_text: null });
  assert.match(m, /Prezzi aggiornati il 15\/10\/2026 alle 18:05/);
  assert.doesNotMatch(m, /Aggiornamento abituale/);
});
