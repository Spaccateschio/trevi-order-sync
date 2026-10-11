import { test } from "node:test";
import assert from "node:assert/strict";
import { SEND_CHANNELS } from "../components/purchase/send-order-dialog";

test("canali d'invio non B2B: WhatsApp, email, SMS, telefono, di persona, altro (mai piattaforma)", () => {
  assert.deepEqual(SEND_CHANNELS.map((c) => c.value), ["whatsapp", "email", "sms", "telefono", "di_persona", "altro"]);
});
