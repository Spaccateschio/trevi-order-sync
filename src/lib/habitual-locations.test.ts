import { describe, expect, it } from "vitest";
import { habitualError, setPrimary, toggleHabitual } from "./habitual-locations";

describe("zone abituali", () => {
  it("un prodotto può avere più zone ma una sola principale", () => {
    let s = toggleHabitual({ ids: [], primaryId: null }, "frigo1");
    s = toggleHabitual(s, "magazzino");
    expect(s).toEqual({ ids: ["frigo1", "magazzino"], primaryId: "frigo1" });
    s = setPrimary(s, "magazzino");
    expect(s.primaryId).toBe("magazzino");
  });

  it("rimuovendo la principale non ne assegna un'altra da solo e chiede la scelta", () => {
    const s = toggleHabitual({ ids: ["frigo1", "magazzino", "pozzetto"], primaryId: "frigo1" }, "frigo1");
    expect(s.primaryId).toBeNull();
    expect(habitualError(s)).toBe("Scegli la zona principale tra quelle rimaste");
  });

  it("la principale deve appartenere alle zone abituali", () => {
    expect(setPrimary({ ids: ["frigo1"], primaryId: "frigo1" }, "frigo2").primaryId).toBe("frigo1");
    expect(habitualError({ ids: ["frigo1"], primaryId: "frigo2" })).not.toBeNull();
  });

  it("nessuna zona abituale è ammessa", () => {
    expect(habitualError({ ids: [], primaryId: null })).toBeNull();
  });
});
