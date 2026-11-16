import { describe, expect, it } from "vitest";

import {
  PASSWORD_MIN_LENGTH,
  passwordChangeErrorMessage,
  validateNewPassword,
} from "./password-change";

describe("validateNewPassword", () => {
  it("accetta due password identiche di almeno 8 caratteri", () => {
    expect(
      validateNewPassword({
        currentPassword: "vecchia2026",
        password: "arance2026",
        confirm: "arance2026",
      }),
    ).toEqual({ value: "arance2026" });
  });

  it("richiede la password attuale", () => {
    expect(
      validateNewPassword({ currentPassword: "", password: "arance2026", confirm: "arance2026" }),
    ).toEqual({ error: "Inserisci la password attuale" });
  });

  it("rifiuta una password più corta di 8 caratteri", () => {
    expect(
      validateNewPassword({ currentPassword: "vecchia2026", password: "arance2", confirm: "arance2" }),
    ).toEqual({
      error: `La nuova password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri`,
    });
  });

  it("rifiuta le due password diverse", () => {
    expect(
      validateNewPassword({
        currentPassword: "vecchia2026",
        password: "arance2026",
        confirm: "arance2027",
      }),
    ).toEqual({ error: "Le due password non coincidono" });
  });

  it("rifiuta la password vuota", () => {
    expect(
      validateNewPassword({ currentPassword: "vecchia2026", password: "", confirm: "" }),
    ).toEqual({ error: expect.any(String) });
  });
});

describe("passwordChangeErrorMessage", () => {
  it("segnala la password attuale errata", () => {
    expect(passwordChangeErrorMessage("Invalid login credentials")).toBe(
      "La password attuale non è corretta",
    );
  });

  it("traduce l'errore della password debole o trapelata", () => {
    expect(
      passwordChangeErrorMessage("Password is too weak: it has been found in leaked passwords"),
    ).toBe("Questa password è troppo debole o compare in elenchi di password trapelate: scegliane un'altra");
  });

  it("traduce l'errore di sessione scaduta", () => {
    expect(passwordChangeErrorMessage("invalid session")).toBe(
      "La sessione non è più valida: riaccendi e riprova",
    );
  });

  it("traduce il rifiuto della password attuale", () => {
    expect(
      passwordChangeErrorMessage("Current password required when setting new password."),
    ).toBe("La password attuale non è corretta: riprova");
  });

  it("traduce la richiesta di riautenticazione", () => {
    expect(passwordChangeErrorMessage("Password update requires reauthentication")).toBe(
      "La sessione non è più recente: riaccendi e riprova",
    );
  });

  it("traduce la nuova password identica alla vecchia", () => {
    expect(
      passwordChangeErrorMessage("New password should be different from the old password."),
    ).toBe("La nuova password deve essere diversa da quella attuale");
  });

  it("lascia invariati gli altri messaggi", () => {
    expect(passwordChangeErrorMessage("Qualcosa è andato storto")).toBe("Qualcosa è andato storto");
  });
});
