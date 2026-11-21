import { describe, expect, it } from "vitest";

import {
  getPlatformUsageMockSnapshot,
  PLATFORM_USAGE_PAGES,
} from "./platform-usage-mock";

describe("mockup statistiche piattaforma", () => {
  it("il filtro 7 giorni produce sette giornate", () => {
    const result = getPlatformUsageMockSnapshot({
      period: 7,
      area: "tutte",
      device: "tutti",
      page: "tutte",
    });

    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1)?.date).toBe("2026-11-21");
  });

  it("il filtro smartphone esclude le visite da computer", () => {
    const all = getPlatformUsageMockSnapshot({
      period: 30,
      area: "tutte",
      device: "tutti",
      page: "tutte",
    });
    const mobile = getPlatformUsageMockSnapshot({
      period: 30,
      area: "tutte",
      device: "smartphone",
      page: "tutte",
    });

    expect(mobile.smartphoneShare).toBe(100);
    expect(mobile.totals.views).toBeGreaterThan(0);
    expect(mobile.totals.views).toBeLessThan(all.totals.views);
  });

  it("il filtro pagina limita classifiche e andamento alla pagina scelta", () => {
    const result = getPlatformUsageMockSnapshot({
      period: 30,
      area: "tutte",
      device: "tutti",
      page: "inventario",
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.key).toBe("inventario");
    expect(result.clickedElements.every((element) => element.page === "Inventario")).toBe(
      true,
    );
  });

  it("il filtro area piattaforma include solo le sue pagine", () => {
    const result = getPlatformUsageMockSnapshot({
      period: 30,
      area: "piattaforma",
      device: "tutti",
      page: "tutte",
    });

    expect(result.pages).toHaveLength(3);
    expect(result.pages.every((page) => page.area === "piattaforma")).toBe(true);
    expect(result.totals.views).toBeGreaterThan(0);
  });

  it("i clic dei comandi sommano esattamente i clic del periodo", () => {
    for (const page of PLATFORM_USAGE_PAGES) {
      const result = getPlatformUsageMockSnapshot({
        period: 30,
        area: "tutte",
      device: "tutti",
        page: page.key,
      });
      const elementClicks = result.clickedElements.reduce(
        (sum, element) => sum + element.clicks,
        0,
      );
      expect(elementClicks).toBe(result.totals.clicks);
    }
  });
});
