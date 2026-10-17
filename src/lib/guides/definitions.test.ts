import { describe, expect, it } from "vitest";
import { GUIDES, visibleSteps } from "./definitions";

describe("guide", () => {
  const guide = GUIDES["lista-spesa"];
  it("la Lista della Spesa ha nove passaggi con id unici", () => {
    expect(guide.steps).toHaveLength(9);
    expect(new Set(guide.steps.map((s) => s.id)).size).toBe(9);
  });
  it("nessun passaggio è introdotto dopo la versione della guida", () => {
    expect(guide.steps.every((s) => s.introducedIn >= 1 && s.introducedIn <= guide.version)).toBe(true);
  });
  it("salta i passaggi senza elemento", () => {
    const steps = visibleSteps(guide, (t) => !t.includes("banner-ordini") && !t.includes("spesa.card"));
    expect(steps).toHaveLength(7);
  });
  it("con sinceVersion mostra solo le novità", () => {
    expect(visibleSteps(guide, () => true, 1)).toHaveLength(0);
  });
});
