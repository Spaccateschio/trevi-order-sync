import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv-safe";

describe("csvCell", () => {
  it("neutralizza i valori che iniziano come formule", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("@x")).toBe(`"'@x"`);
  });
  it("lascia invariato il testo normale e raddoppia le virgolette", () => {
    expect(csvCell('Mele "rosse"')).toBe(`"Mele ""rosse"""`);
  });
});
