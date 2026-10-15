import { describe, expect, it } from "bun:test";
import { afterCreateAction, replaceOutcome, summarize, type GenerationOutcome } from "./generation-results";

describe("Genera e invia", () => {
  it("B2B si invia subito tramite piattaforma", () => {
    expect(afterCreateAction(true)).toBe("invia_piattaforma");
  });
  it("non B2B resta da condividere, mai inviato automaticamente", () => {
    expect(afterCreateAction(false)).toBe("condividi");
  });
  it("riprova sostituisce l'errore con l'esito senza duplicare il documento", () => {
    const list: GenerationOutcome[] = [
      { kind: "errore_invio", name: "Trevi", orderId: "o1", number: "ORD-1", isB2b: true, message: "x" },
      { kind: "acquisto_diretto", name: "AD", id: "a1", number: "AD-1" },
    ];
    const next = replaceOutcome(list, "o1", { kind: "inviato", name: "Trevi", orderId: "o1", number: "ORD-1" });
    expect(next).toHaveLength(2);
    expect(summarize(next)).toEqual({ inviati: 1, daCondividere: 0, errori: 0, diretti: 1 });
  });
});
