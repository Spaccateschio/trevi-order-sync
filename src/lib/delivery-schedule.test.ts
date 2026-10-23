import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDeliverBy, deliveryDelayReasons, firstValidDelivery, linksInTime, toSchedule } from "./delivery-schedule";

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
  it("nessun giorno impostato → consegna sempre, conta solo il preavviso", () => {
    assert.equal(ymd(firstValidDelivery(tue, toSchedule([], null), 0)), "2026-10-20");
    assert.equal(ymd(firstValidDelivery(tue, toSchedule([], null), 3)), "2026-10-23");
  });
  it("Barone: venerdì 23 ottobre, tutti i giorni e 2 gg → domenica 25, solo preavviso", () => {
    const fri = d(2026, 10, 23);
    const timing = { schedule: toSchedule([1, 2, 3, 4, 5, 6, 7], null), leadDays: 2 };
    assert.equal(ymd(firstValidDelivery(fri, timing.schedule, timing.leadDays)), "2026-10-25");
    assert.deepEqual(deliveryDelayReasons(timing, fri, fri), { leadDays: 2, weekday: null });
  });
  it("solo giorno non servito: venerdì, nessun preavviso, solo lunedì", () => {
    const fri = d(2026, 10, 23);
    assert.deepEqual(deliveryDelayReasons({ schedule: toSchedule([1], null), leadDays: 0 }, fri, fri), { leadDays: null, weekday: "venerdì" });
  });
  it("preavviso e giorno non servito sono entrambi indicati", () => {
    const fri = d(2026, 10, 23);
    const timing = { schedule: toSchedule([1], null), leadDays: 2 };
    assert.equal(ymd(firstValidDelivery(fri, timing.schedule, 2)), "2026-10-26");
    assert.deepEqual(deliveryDelayReasons(timing, fri, fri), { leadDays: 2, weekday: "venerdì" });
  });
  it("calendario vuoto: oggi disponibile, con 2 gg solo preavviso", () => {
    const fri = d(2026, 10, 23);
    const schedule = toSchedule([], null);
    assert.equal(canDeliverBy(fri, schedule, null, fri), true);
    assert.deepEqual(deliveryDelayReasons({ schedule, leadDays: null }, fri, fri), { leadDays: null, weekday: null });
    assert.equal(ymd(firstValidDelivery(fri, schedule, 2)), "2026-10-25");
    assert.deepEqual(deliveryDelayReasons({ schedule, leadDays: 2 }, fri, fri), { leadDays: 2, weekday: null });
  });
  it("serve giovedì: A lun/gio 2 gg in tempo, B solo lunedì no", () => {
    const thu = d(2026, 10, 22);
    assert.equal(canDeliverBy(tue, toSchedule([1, 4], null), 2, thu), true);
    assert.equal(canDeliverBy(tue, toSchedule([1], null), 0, thu), false);
    const ok = linksInTime([
      { linkId: "A", schedule: toSchedule([1, 4], null), leadDays: 2 },
      { linkId: "B", schedule: toSchedule([1], null), leadDays: null },
      { linkId: "C", schedule: toSchedule([], 15), leadDays: null },
      { linkId: "D", schedule: toSchedule([], null), leadDays: 5 },
      { linkId: "E", schedule: toSchedule([], null), leadDays: 1 },
    ], tue, thu);
    assert.deepEqual([...ok], ["A", "E"]);
  });
});
