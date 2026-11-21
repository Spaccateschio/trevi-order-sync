import { describe, expect, it } from "vitest";

import {
  getPlatformUsageAdvice,
  getPlatformUsagePage,
  platformUsagePercentChange,
  type PlatformUsagePageStat,
  type PlatformUsageSnapshot,
} from "./platform-usage";

const emptyPage: PlatformUsagePageStat = {
  key: "lista-spesa",
  views: 0,
  clicks: 0,
  visits: 0,
  errors: 0,
  avgLoadMs: null,
  activeMs: 0,
  smartphoneViews: 0,
  computerViews: 0,
  smartphoneErrors: 0,
  computerErrors: 0,
  smartphoneLoadMs: null,
  computerLoadMs: null,
};

function snapshot(overrides: Partial<PlatformUsageSnapshot> = {}): PlatformUsageSnapshot {
  return {
    days: 30,
    totals: { views: 0, clicks: 0, visits: 0 },
    previousTotals: { views: 0, clicks: 0 },
    daily: [],
    pages: [],
    clickedElements: [],
    collectionStartedAt: null,
    ...overrides,
  };
}

describe("suggerimenti statistici reali", () => {
  it("non propone una pagina con meno di 10 aperture", () => {
    const result = getPlatformUsageAdvice(snapshot({
      totals: { views: 9, clicks: 0, visits: 3 },
      pages: [{ ...emptyPage, views: 9, visits: 3 }],
    }));
    expect(result[0]).toMatchObject({ sufficient: false });
    expect(result[0]?.suggestion).toContain("almeno 10 aperture");
  });

  it("con 12 aperture e 2 errori consiglia di correggere la pagina", () => {
    const result = getPlatformUsageAdvice(snapshot({
      pages: [{ ...emptyPage, views: 12, visits: 4, errors: 2 }],
    }));
    expect(result[0]).toMatchObject({ sufficient: true });
    expect(result[0]?.title).toBe("Controlla gli errori in Lista della Spesa");
    expect(result[0]?.evidence).toBe("12 aperture e 2 errori nel periodo selezionato.");
  });

  it("con caricamento medio di 2 secondi consiglia di velocizzare la pagina", () => {
    const result = getPlatformUsageAdvice(snapshot({
      pages: [{ ...emptyPage, views: 20, visits: 5, avgLoadMs: 2000 }],
    }));
    expect(result[0]?.title).toBe("Rendi più veloce Lista della Spesa");
    expect(result[0]?.evidence).toContain("2,0 secondi");
  });

  it("non confronta i dispositivi con meno di 5 aperture per tipo", () => {
    const result = getPlatformUsageAdvice(snapshot({
      pages: [{ ...emptyPage, smartphoneViews: 8, computerViews: 4 }],
    }));
    expect(result[1]).toMatchObject({ sufficient: false });
    expect(result[1]?.evidence).toBe("8 aperture da telefono e 4 da computer.");
  });

  it("con 60 aperture mobili su 100 consiglia di progettare prima per telefono", () => {
    const result = getPlatformUsageAdvice(snapshot({
      pages: [{ ...emptyPage, smartphoneViews: 60, computerViews: 40 }],
    }));
    expect(result[1]?.title).toBe("Progetta prima per il telefono");
    expect(result[1]?.evidence).toContain("60%");
  });

  it("non propone un comando con meno di 5 clic", () => {
    const result = getPlatformUsageAdvice(snapshot({
      totals: { views: 0, clicks: 4, visits: 2 },
      clickedElements: [{
        key: "confirm-quantity", pageKey: "lista-spesa", clicks: 4, visits: 2,
        repeatedVisits: 2, maxClicksInVisit: 2,
      }],
    }));
    expect(result[2]).toMatchObject({ sufficient: false });
    expect(result[2]?.suggestion).toContain("almeno 5 clic");
  });

  it("con 8 clic e 2 visite ripetute consiglia meno passaggi", () => {
    const result = getPlatformUsageAdvice(snapshot({
      clickedElements: [{
        key: "confirm-quantity", pageKey: "lista-spesa", clicks: 8, visits: 4,
        repeatedVisits: 2, maxClicksInVisit: 3,
      }],
    }));
    expect(result[2]?.title).toBe("Riduci i passaggi di Conferma quantità");
    expect(result[2]?.suggestion).toContain("una conferma più immediata o un passaggio in meno");
    expect(result[2]?.evidence).toBe("8 clic in 4 visite; in 2 visite il comando è stato usato più volte.");
  });

  it("riconosce anche la pagina Prodotti nella vista Vendite", () => {
    expect(getPlatformUsagePage("/vendite/prodotti")?.key).toBe("prodotti");
  });

  it("calcola il cambiamento rispetto al periodo precedente", () => {
    expect(platformUsagePercentChange(30, 20)).toBe(50);
    expect(platformUsagePercentChange(10, 0)).toBe(0);
  });
});
