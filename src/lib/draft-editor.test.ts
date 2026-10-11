import { describe, it } from "node:test";
import assert from "node:assert/strict";
const expect = (v: unknown) => ({ toBe: (x: unknown) => assert.equal(v, x) });
import { draftCloseAction, draftStateFromSaved, isDraftDirty, type DraftEditState } from "./draft-editor";

const saved: { delivery_date: string | null; delivery_time_from: string | null; delivery_time_to: string | null; delivery_address_text: string | null; supplier_notes: string | null } = { delivery_date: "2026-10-12", delivery_time_from: "08:00:00", delivery_time_to: "10:00:00", delivery_address_text: "Via Roma 1", supplier_notes: null };
const items = [{ id: "a", purchase_quantity: 20 }, { id: "b", purchase_quantity: 3 }];

// Simula la finestra: apertura, modifica, chiusura (Annulla/Conferma), salvataggio.
function openEditor(db: { order: typeof saved; items: typeof items }) {
  let state: DraftEditState | null = draftStateFromSaved(db.order, db.items);
  let open = true;
  let asking = false;
  return {
    get state() { return state!; },
    get open() { return open; },
    get asking() { return asking; },
    edit(fn: (s: DraftEditState) => DraftEditState) { state = fn(state!); },
    dirty: () => isDraftDirty(state, db.order, db.items),
    requestClose() { if (draftCloseAction(isDraftDirty(state, db.order, db.items), true) === "ask") asking = true; else { open = false; state = null; } },
    cancelClose() { asking = false; },
    confirmClose() { asking = false; open = false; state = null; },
    save() {
      db.order = { ...db.order, delivery_date: state!.delivery.date || null, delivery_address_text: state!.delivery.address || null };
      db.items = db.items.map((i) => ({ ...i, purchase_quantity: Number(state!.qty[i.id]) }));
      state = draftStateFromSaved(db.order, db.items);
    },
  };
}

describe("finestra Bozza", () => {
  it("rileva le modifiche non salvate di quantità e consegna", () => {
    const db = { order: saved, items };
    const e = openEditor(db);
    expect(e.dirty()).toBe(false);
    e.edit((s) => ({ ...s, qty: { ...s.qty, a: "15" } }));
    expect(e.dirty()).toBe(true);
    const e2 = openEditor(db);
    e2.edit((s) => ({ ...s, delivery: { ...s.delivery, address: "Via Po 2" } }));
    expect(e2.dirty()).toBe(true);
  });

  it("chiusura con modifiche: compare l'avviso; senza modifiche si chiude", () => {
    const e = openEditor({ order: saved, items });
    e.requestClose();
    expect(e.open).toBe(false);
    const e2 = openEditor({ order: saved, items });
    e2.edit((s) => ({ ...s, qty: { ...s.qty, a: "15" } }));
    e2.requestClose();
    expect(e2.asking).toBe(true);
    expect(e2.open).toBe(true);
  });

  it("Annulla: la finestra resta aperta e conserva le modifiche", () => {
    const e = openEditor({ order: saved, items });
    e.edit((s) => ({ ...s, qty: { ...s.qty, a: "15" } }));
    e.requestClose();
    e.cancelClose();
    expect(e.open).toBe(true);
    expect(e.state.qty["a"]).toBe("15");
  });

  it("Conferma: si chiude senza salvare e la riapertura mostra solo i dati salvati", () => {
    const db = { order: saved, items };
    const e = openEditor(db);
    e.edit((s) => ({ ...s, qty: { ...s.qty, a: "15" }, delivery: { ...s.delivery, date: "2026-10-20" } }));
    e.requestClose();
    e.confirmClose();
    expect(e.open).toBe(false);
    expect(db.items[0]?.purchase_quantity).toBe(20);
    const r = openEditor(db);
    expect(r.state.qty["a"]).toBe("20");
    expect(r.state.delivery.date).toBe("2026-10-12");
  });

  it("Salvataggio: i nuovi valori compaiono alla riapertura", () => {
    const db = { order: saved, items };
    const e = openEditor(db);
    e.edit((s) => ({ ...s, qty: { ...s.qty, a: "15" }, delivery: { ...s.delivery, date: "2026-10-20" } }));
    e.save();
    expect(e.dirty()).toBe(false);
    e.requestClose();
    expect(e.open).toBe(false);
    const r = openEditor(db);
    expect(r.state.qty["a"]).toBe("15");
    expect(r.state.delivery.date).toBe("2026-10-20");
  });
});
