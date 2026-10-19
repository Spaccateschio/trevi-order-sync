import { describe, expect, it } from "vitest";

import { checkInvitationSend, sha256Hex, tokenMatchesHash } from "./invitation-token-check";

const token = "a".repeat(64);
const future = new Date(Date.now() + 86_400_000).toISOString();

describe("invio invito commerciale", () => {
  it("impronta compatibile con encode(sha256(token::bytea),'hex') del database", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("codice corretto accettato, codice falso rifiutato", async () => {
    const hash = await sha256Hex(token);
    expect(await tokenMatchesHash(token, hash)).toBe(true);
    expect(await tokenMatchesHash("b".repeat(64), hash)).toBe(false);
    expect(await tokenMatchesHash(token, null)).toBe(false);
  });

  it("non amministratore rifiutato", async () => {
    const r = await checkInvitationSend({ isAdmin: false, status: "in_attesa", expiresAt: future, tokenHash: await sha256Hex(token), token });
    expect(r).toEqual({ ok: false, reason: "not_admin" });
  });

  it("invito revocato o accettato rifiutato", async () => {
    for (const status of ["annullato", "accettato", "annullato_scaduto"]) {
      const r = await checkInvitationSend({ isAdmin: true, status, expiresAt: future, tokenHash: await sha256Hex(token), token });
      expect(r).toEqual({ ok: false, reason: "not_pending" });
    }
  });

  it("invito scaduto rifiutato", async () => {
    const r = await checkInvitationSend({ isAdmin: true, status: "in_attesa", expiresAt: new Date(Date.now() - 1000).toISOString(), tokenHash: await sha256Hex(token), token });
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("codice di un altro invito rifiutato", async () => {
    const r = await checkInvitationSend({ isAdmin: true, status: "in_attesa", expiresAt: future, tokenHash: await sha256Hex("c".repeat(64)), token });
    expect(r).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("percorso legittimo ammesso", async () => {
    const r = await checkInvitationSend({ isAdmin: true, status: "in_attesa", expiresAt: future, tokenHash: await sha256Hex(token), token });
    expect(r).toEqual({ ok: true });
  });
});

import { classifySendError } from "./invitation-token-check";

describe("esito dell'invio", () => {
  it("rifiuto certo del servizio = fallito", () => {
    expect(classifySendError({ status: 400 })).toBe("fallito");
    expect(classifySendError({ status: 429 })).toBe("fallito");
  });
  it("rete o errore del servizio = sconosciuto, non libera il limite", () => {
    expect(classifySendError(new Error("network"))).toBe("sconosciuto");
    expect(classifySendError({ status: 503 })).toBe("sconosciuto");
  });
});
