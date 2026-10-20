import { describe, expect, it } from "vitest";
import { createDemoCards, showSuggested, supplierSummary, toggleOpen } from "./compact-card-demo-data";

const byId = (id: string) => {
  const c = createDemoCards().find((x) => x.id === id);
  if (!c) throw new Error("missing");
  return c;
};

describe("Anteprima card compatta", () => {
  it("nasconde la Suggerita quando è 0", () => {
    expect(showSuggested(byId("a"))).toBe(false);
    expect(showSuggested(byId("c"))).toBe(true);
  });
  it("con più fornitori mostra il primo + quanti altri", () => {
    expect(supplierSummary(byId("e"))).toBe("Garbaglia + 1");
  });
  it("aprendo una card si chiude l'altra", () => {
    expect(toggleOpen("a", "b")).toBe("b");
    expect(toggleOpen("b", "b")).toBe(null);
  });
});
