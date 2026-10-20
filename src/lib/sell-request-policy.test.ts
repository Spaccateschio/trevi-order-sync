import { test } from "node:test";
import assert from "node:assert/strict";
import { SELL_REQUEST_EMAILS_ENABLED, canDisableCompanyProfile } from "./sell-request-policy";

test("nessuna email reale durante il collaudo", () => {
  assert.equal(SELL_REQUEST_EMAILS_ENABLED, false);
});
test("3 EMME solo Compro non può spegnere l'ultimo profilo", () => {
  assert.equal(canDisableCompanyProfile(true, false, "buys"), false);
});
test("Compro può essere spento quando Vendo è attivo", () => {
  assert.equal(canDisableCompanyProfile(true, true, "buys"), true);
});
test("Vendo non può essere spento se Compro è spento", () => {
  assert.equal(canDisableCompanyProfile(false, true, "sells"), false);
});