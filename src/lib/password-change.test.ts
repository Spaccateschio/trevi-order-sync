import { describe, expect, it } from "vitest";

import {
  PASSWORD_MIN_LENGTH,
  passwordChangeErrorMessage,
  validateNewPassword,
} from "./password-change";

describe("validateNewPassword", () => {
  it("accetta due password identiche di almeno 8 caratteri", () => {
    expect(validateNewPassword({ password: "arance2026", confirm: "arance2026" })).toEqual({
      value: "arance2026",
    });
  });

  it("rifiuta una password più corta di 8 caratteri", () => {
    expect(validateNewPassword({ password: "arance2", confirm: "arance2" })).toEqual({
      error: `La nuova password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri`,
    });
  });

  it("rifiuta le due password diverse", () => {
    expect(validateNewPassword({ password: "arance2026", confirm: "arance2027" })).toEqual({
      error: "Le due password non coincidono",
    });
  });

  it("rifiuta la password vuota", () => {
    expect(validateNewPassword({ password: "", confirm: "" })).toEqual({
      error: expect.any(String),
    });
  });
});

describe("passwordChangeErrorMessage", () => {
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

  it("lascia invariati gli altri messaggi", () => {
    expect(passwordChangeErrorMessage("Qualcosa è andato storto")).toBe("Qualcosa è andato storto");
  });
});
