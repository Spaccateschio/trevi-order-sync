import { describe, expect, it } from "vitest";
import { confirmAllSummary } from "./inventory-confirm-all";

describe("confirmAllSummary", () => {
  it("senza bozze segnala che non c'è nulla da confermare", () => {
    expect(confirmAllSummary({ confirmed: 0, skipped: [] })).toEqual({
      kind: "empty",
      message: "Nessuna bozza da confermare",
    });
  });

  it("con sole conferme riporta il numero di quantità confermate", () => {
    expect(confirmAllSummary({ confirmed: 5, skipped: [] })).toEqual({
      kind: "done",
      message: "5 quantità confermate",
    });
  });

  it("con saltate elenca le prime tre e segnala il parziale", () => {
    const result = confirmAllSummary({
      confirmed: 2,
      skipped: [
        { label: "AGLIO", reason: "x" },
        { label: "BASILICO", reason: "x" },
        { label: "CARCIOFI", reason: "x" },
        { label: "DATTERI", reason: "x" },
      ],
    });
    expect(result.kind).toBe("partial");
    expect(result.message).toBe("4 non confermate: AGLIO, BASILICO, CARCIOFI…");
  });

  it("le saltate restano bozze anche se nessuna è stata confermata", () => {
    const result = confirmAllSummary({ confirmed: 0, skipped: [{ label: "AGLIO", reason: "x" }] });
    expect(result.kind).toBe("partial");
    expect(result.message).toBe("1 non confermate: AGLIO");
  });
});
