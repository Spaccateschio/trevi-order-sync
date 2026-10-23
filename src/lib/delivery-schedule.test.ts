import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDeliverBy, firstValidDelivery, linksInTime, toSchedule } from "./delivery-schedule";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const ymd = (x: Date | null) => (x ? `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}` : null);
// 20/10/2026 è martedì.
const tue = d(2026, 10, 20);

describe("giorni di consegna e preavviso", () => {
  it("ordine martedì, 2 gg, consegna lun/gio → giovedì", () => {
    assert.equal(ymd(firstValidDelivery(tue, toSchedule([1, 4], null), 2)), "2026-10-22");
  });
  it("ordine venerdì, 2 gg, lun–ven → lunedì (fine settimana saltato)", () => {
    assert.equal(ymd(firstValidDelivery(d(2026, 10, 23), toSchedule([1, 2, 3, 4, 5], null), 2)), "2026-10-26");
  });
  it("senza preavviso vale anche oggi", () => {
    assert.equal(ymd(firstValidDelivery(tue, toSchedule([2], null), null)), "2026-10-20");
  });
  it("giorno mensile si aggiunge ai settimanali", () => {
    assert.equal(ymd(firstValidDelivery(tue, toSchedule([], 15), 0)), "2026-11-15");
    assert.equal(ymd(firstValidDelivery(tue, toSchedule([5], 21), 0)), "2026-10-21");
  });
  it("nessun giorno impostato → nessuna consegna", () => {
    assert.equal(firstValidDelivery(tue, toSchedule([], null), 0), null);
  });
  it("serve giovedì: A lun/gio 2 gg in tempo, B solo lunedì no", () => {
    const thu = d(2026, 10, 22);
    assert.equal(canDeliverBy(tue, toSchedule([1, 4], null), 2, thu), true);
    assert.equal(canDeliverBy(tue, toSchedule([1], null), 0, thu), false);
    const ok = linksInTime([
      { linkId: "A", schedule: toSchedule([1, 4], null), leadDays: 2 },
      { linkId: "B", schedule: toSchedule([1], null), leadDays: null },
      { linkId: "C", schedule: toSchedule([], 15), leadDays: null },
    ], tue, thu);
    assert.deepEqual([...ok], ["A"]);
  });
});
