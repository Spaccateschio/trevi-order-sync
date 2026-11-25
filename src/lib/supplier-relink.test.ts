import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLinkToReactivate } from "./supplier-relink";

test("preferisce il collegamento spento con l'articolo B2B", () => {
  const rows = [
    { id: "nuovo", b2b_item_id: null, created_at: "2026-11-20" },
    { id: "b2b", b2b_item_id: "art", created_at: "2026-10-01" },
  ];
  assert.equal(pickLinkToReactivate(rows)?.id, "b2b");
});

test("senza articolo B2B riattiva il più recente (anche senza codice articolo)", () => {
  const rows = [
    { id: "vecchio", b2b_item_id: null, created_at: "2026-01-01" },
    { id: "recente", b2b_item_id: null, created_at: "2026-11-01" },
  ];
  assert.equal(pickLinkToReactivate(rows)?.id, "recente");
});

test("nessun collegamento spento: si crea come prima", () => {
  assert.equal(pickLinkToReactivate([]), null);
});
