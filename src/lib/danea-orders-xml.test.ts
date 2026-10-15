import { test } from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import {
  buildDaneaOrdersXml,
  daneaLinePrice,
  daneaOrderNumber,
  matchesDaneaFilter,
  parseDaneaRequestFilter,
  type DaneaOrderCandidate,
} from "./danea-orders-xml";

const customer = {
  code: "0072", name: "CLIENTE PROVA SRL", address: "VIA PROVA 1", postcode: "00100", city: "ROMA",
  province: "RM", country: null, fiscal_code: "00000000000", vat_code: "00000000000", email: null,
  phone: null, sdi_code: null, pec: null, archive_ok: true,
};
const line = (o: Partial<DaneaOrderCandidate["lines"][number]> = {}) => ({
  item_id: "i1", seller_code: "0446", description: "ANANAS", quantity: 3, unit: "kg",
  price: 2.2, price_unit: "kg", vat_code: "4", vat_perc: 4, notes: null, ...o,
});
const order = (o: Partial<DaneaOrderCandidate> = {}): DaneaOrderCandidate => ({
  order_id: "o1", number: "ORD-2026-99999", sent_at: "2026-10-15T06:35:00Z", order_date: "2026-10-15",
  delivery_date: "2026-10-16", delivery_time_from: "06:00:00", delivery_time_to: "08:00:00",
  delivery_address_text: null, notes: null, buyer_name: "CLIENTE PROVA SRL", customer, lines: [line()], ...o,
});
const parse = (xml: string) =>
  new XMLParser({ isArray: (n) => n === "Document" || n === "Row" }).parse(xml).EasyfattDocuments;

test("ordine valido: XML EasyfattDocuments con ordine cliente C", () => {
  const r = buildDaneaOrdersXml("TREVI SRL", [order()]);
  const doc = parse(r.xml).Documents.Document[0];
  assert.equal(doc.DocumentType, "C");
  assert.equal(String(doc.CustomerCode).padStart(4, "0"), "0072");
  assert.equal(doc.Date, "2026-10-15");
  assert.equal(String(doc.Rows.Row[0].Code).padStart(4, "0"), "0446");
  assert.equal(doc.Rows.Row[0].Price, 2.2);
  assert.deepEqual(r.exportedIds, ["o1"]);
});

test("U.M. ordinata diversa da U.M. prezzo: niente Price, nota indicativa", () => {
  const d = daneaLinePrice({ price: 2.7, price_unit: "kg", unit: "cs" });
  assert.equal(d.price, null);
  assert.equal(d.note, "Prezzo indicativo 2,70 €/kg – da pesare");
  const r = buildDaneaOrdersXml(null, [order({ lines: [line({ unit: "cs", price: 2.7 })] })]);
  const row = parse(r.xml).Documents.Document[0].Rows.Row[0];
  assert.equal(row.Price, undefined);
  assert.equal(row.Qty, 3);
  assert.equal(row.Um, "cs");
});

test("prezzo mancante: mai zero, campo omesso", () => {
  assert.deepEqual(daneaLinePrice({ price: null, price_unit: "kg", unit: "kg" }), { price: null, note: "Prezzo su richiesta" });
  assert.equal(daneaLinePrice({ price: 0, price_unit: "kg", unit: "kg" }).price, null);
  const r = buildDaneaOrdersXml(null, [order({ lines: [line({ price: null })] })]);
  assert.ok(!r.xml.includes("<Price>"));
});

test("codice cliente mancante: ordine escluso con diagnostica", () => {
  const r = buildDaneaOrdersXml(null, [order({ customer: { ...customer, code: null } })]);
  assert.deepEqual(r.exportedIds, []);
  assert.match(r.excluded[0]!.reasons[0]!, /Codice cliente Danea mancante/);
});

test("cliente non collegato o di altro archivio: escluso", () => {
  assert.equal(buildDaneaOrdersXml(null, [order({ customer: null })]).exportedIds.length, 0);
  assert.equal(buildDaneaOrdersXml(null, [order({ customer: { ...customer, archive_ok: false } })]).exportedIds.length, 0);
});

test("codice articolo mancante: ordine intero escluso", () => {
  const r = buildDaneaOrdersXml(null, [order({ lines: [line(), line({ seller_code: null, description: "BANANE" })] })]);
  assert.deepEqual(r.exportedIds, []);
  assert.match(r.excluded[0]!.reasons.join(), /Codice articolo Danea mancante: BANANE/);
});

test("numerazione: Number = parte numerica, numero Trevi Fruit in InternalComment", () => {
  const doc = parse(buildDaneaOrdersXml(null, [order({ number: "ORD-2026-00004" })]).xml).Documents.Document[0];
  assert.equal(doc.Number, 4);
  assert.equal(doc.InternalComment, "Ordine Trevi Fruit ORD-2026-00004");
});

test("numero ordine non numerico: ordine escluso", () => {
  assert.equal(daneaOrderNumber("ORD-2026-00004"), 4);
  assert.equal(daneaOrderNumber("BOZZA"), null);
  const r = buildDaneaOrdersXml(null, [order({ number: "BOZZA" })]);
  assert.deepEqual(r.exportedIds, []);
  assert.match(r.excluded[0]!.reasons.join(), /Numero ordine non valido/);
});

test("filtri Danea: date e intervallo numeri", () => {
  const f = parseDaneaRequestFilter(
    new URLSearchParams("appver=2&firstdate=2026-01-01&lastdate=2026-12-31&firstnum=4&lastnum=10"),
  );
  assert.deepEqual(f, { firstDate: "2026-01-01", lastDate: "2026-12-31", firstNum: 4, lastNum: 10 });
  assert.equal(matchesDaneaFilter(order({ number: "ORD-2026-00004" }), f), true);
  assert.equal(matchesDaneaFilter(order({ number: "ORD-2026-00003" }), f), false);
  assert.equal(matchesDaneaFilter(order({ number: "ORD-2026-00011" }), f), false);
  assert.equal(matchesDaneaFilter(order({ number: "ORD-2026-00004", order_date: "2025-12-31" }), f), false);
  const none = parseDaneaRequestFilter(new URLSearchParams("firstnum=abc"));
  assert.equal(none.firstNum, null);
  assert.equal(matchesDaneaFilter(order(), none), true);
});

test("numerazione: numero completo in InternalComment", () => {
  const doc = parse(buildDaneaOrdersXml(null, [order()]).xml).Documents.Document[0];
  assert.equal(doc.InternalComment, "Ordine Trevi Fruit ORD-2026-99999");
});

test("nessun ordine: XML valido senza documenti", () => {
  const r = buildDaneaOrdersXml("TREVI SRL", []);
  assert.ok(r.xml.trimEnd().endsWith("</EasyfattDocuments>"));
  assert.equal(parse(r.xml).Documents, "");
});

test("caratteri speciali escapati", () => {
  const r = buildDaneaOrdersXml(null, [order({ customer: { ...customer, name: "A & B <srl>" } })]);
  assert.ok(r.xml.includes("A &amp; B &lt;srl&gt;"));
  assert.equal(parse(r.xml).Documents.Document.length, 1);
});
