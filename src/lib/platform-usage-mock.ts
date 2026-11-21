export const PLATFORM_USAGE_PERIODS = [7, 30, 90] as const;
export type PlatformUsagePeriod = (typeof PLATFORM_USAGE_PERIODS)[number];
export type PlatformUsageDevice = "tutti" | "smartphone" | "computer";
export type PlatformUsageArea = "tutte" | "aziende" | "piattaforma";
export type PlatformUsagePageKey =
  | "lista-spesa"
  | "ordini-clienti"
  | "inventario"
  | "prodotti"
  | "preparazione"
  | "catalogo"
  | "piattaforma-aziende"
  | "piattaforma-utenti"
  | "piattaforma-registro";

export type PlatformUsageFilters = {
  period: PlatformUsagePeriod;
  area: PlatformUsageArea;
  device: PlatformUsageDevice;
  page: "tutte" | PlatformUsagePageKey;
};

type Device = Exclude<PlatformUsageDevice, "tutti">;

type PageDefinition = {
  key: PlatformUsagePageKey;
  area: Exclude<PlatformUsageArea, "tutte">;
  label: string;
  path: string;
  dailyViews: number;
  clickRate: number;
  mobileShare: number;
  elements: readonly [string, number][];
};

export const PLATFORM_USAGE_PAGES: readonly PageDefinition[] = [
  {
    key: "lista-spesa",
    label: "Lista della Spesa",
    path: "/acquisti/lista-spesa",
    area: "aziende",
    dailyViews: 138,
    clickRate: 8.4,
    mobileShare: 0.78,
    elements: [
      ["Conferma quantità", 0.39],
      ["Campo quantità", 0.25],
      ["Filtro Preferiti", 0.15],
      ["Scelta fornitore", 0.12],
      ["Genera ordini", 0.09],
    ],
  },
  {
    key: "ordini-clienti",
    label: "Ordini clienti",
    path: "/vendite/ordini-clienti",
    area: "aziende",
    dailyViews: 104,
    clickRate: 4.1,
    mobileShare: 0.61,
    elements: [
      ["Apri ordine", 0.35],
      ["Cambia stato", 0.25],
      ["Filtro periodo", 0.18],
      ["Stampa ordine", 0.13],
      ["Condividi ordine", 0.09],
    ],
  },
  {
    key: "inventario",
    label: "Inventario",
    path: "/acquisti/inventario",
    area: "aziende",
    dailyViews: 81,
    clickRate: 9.2,
    mobileShare: 0.83,
    elements: [
      ["Conferma conteggio", 0.41],
      ["Campo quantità", 0.27],
      ["Filtro Preferiti", 0.14],
      ["Conferma tutto", 0.1],
      ["Chiudi inventario", 0.08],
    ],
  },
  {
    key: "prodotti",
    label: "Prodotti",
    path: "/prodotti",
    area: "aziende",
    dailyViews: 67,
    clickRate: 3.6,
    mobileShare: 0.55,
    elements: [
      ["Apri prodotto", 0.37],
      ["Ricerca prodotto", 0.25],
      ["Preferito", 0.17],
      ["Modifica prodotto", 0.12],
      ["Filtro categoria", 0.09],
    ],
  },
  {
    key: "preparazione",
    label: "Preparazione",
    path: "/operativo/preparazione",
    area: "aziende",
    dailyViews: 52,
    clickRate: 6.8,
    mobileShare: 0.72,
    elements: [
      ["Conferma riga", 0.43],
      ["Inserisci peso", 0.24],
      ["Apri ordine", 0.16],
      ["Stampa preparazione", 0.1],
      ["Completa ordine", 0.07],
    ],
  },
  {
    key: "catalogo",
    label: "Catalogo",
    path: "/catalogo",
    area: "aziende",
    dailyViews: 44,
    clickRate: 5.2,
    mobileShare: 0.66,
    elements: [
      ["Apri prodotto", 0.34],
      ["Aggiungi alla Lista", 0.27],
      ["Ricerca prodotto", 0.18],
      ["Preferito", 0.12],
      ["Filtro categoria", 0.09],
    ],
  },
  {
    key: "piattaforma-aziende",
    label: "Piattaforma · Aziende",
    path: "/piattaforma/aziende",
    area: "piattaforma",
    dailyViews: 18,
    clickRate: 3.4,
    mobileShare: 0.42,
    elements: [
      ["Apri azienda", 0.36],
      ["Cerca azienda", 0.25],
      ["Filtro stato", 0.17],
      ["Vedi utenti", 0.13],
      ["Richieste Vendo", 0.09],
    ],
  },
  {
    key: "piattaforma-utenti",
    label: "Piattaforma · Utenti",
    path: "/piattaforma/utenti",
    area: "piattaforma",
    dailyViews: 13,
    clickRate: 2.8,
    mobileShare: 0.38,
    elements: [
      ["Cerca utente", 0.38],
      ["Apri azienda", 0.24],
      ["Filtro ruolo", 0.17],
      ["Ultimo accesso", 0.12],
      ["Assistenza", 0.09],
    ],
  },
  {
    key: "piattaforma-registro",
    label: "Piattaforma · Registro",
    path: "/piattaforma/registro",
    area: "piattaforma",
    dailyViews: 9,
    clickRate: 2.1,
    mobileShare: 0.35,
    elements: [
      ["Cerca nel registro", 0.41],
      ["Filtro sezione", 0.28],
      ["Apri dettaglio", 0.16],
      ["Cambia periodo", 0.09],
      ["Esporta", 0.06],
    ],
  },
];

type DailyRow = {
  date: string;
  page: PlatformUsagePageKey;
  device: Device;
  views: number;
  clicks: number;
};

const MOCK_END_DATE = Date.UTC(2026, 10, 21, 12);
const DAY_MS = 24 * 60 * 60 * 1000;

function toDateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function buildRows(): DailyRow[] {
  const rows: DailyRow[] = [];
  for (let day = 0; day < 180; day += 1) {
    const timestamp = MOCK_END_DATE - (179 - day) * DAY_MS;
    const weekday = new Date(timestamp).getUTCDay();
    const weekendFactor = weekday === 0 ? 0.48 : weekday === 6 ? 0.7 : 1;
    const growth = 0.88 + day / 520;

    PLATFORM_USAGE_PAGES.forEach((page, pageIndex) => {
      const variation = 0.88 + ((day * 5 + pageIndex * 3) % 11) / 42;
      const allViews = Math.max(
        1,
        Math.round(page.dailyViews * weekendFactor * growth * variation),
      );
      const smartphoneViews = Math.round(allViews * page.mobileShare);
      const computerViews = allViews - smartphoneViews;
      const smartphoneClicks = Math.round(
        smartphoneViews * page.clickRate * (0.96 + (day % 4) / 50),
      );
      const computerClicks = Math.round(
        computerViews * page.clickRate * (0.91 + ((day + 2) % 5) / 55),
      );

      rows.push(
        {
          date: toDateKey(timestamp),
          page: page.key,
          device: "smartphone",
          views: smartphoneViews,
          clicks: smartphoneClicks,
        },
        {
          date: toDateKey(timestamp),
          page: page.key,
          device: "computer",
          views: computerViews,
          clicks: computerClicks,
        },
      );
    });
  }
  return rows;
}

const MOCK_ROWS = buildRows();

function sumRows(rows: DailyRow[]) {
  return rows.reduce(
    (total, row) => ({
      views: total.views + row.views,
      clicks: total.clicks + row.clicks,
    }),
    { views: 0, clicks: 0 },
  );
}

function selectRows(period: PlatformUsagePeriod, offset = 0) {
  const end = MOCK_END_DATE - offset * DAY_MS;
  const start = end - (period - 1) * DAY_MS;
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  return MOCK_ROWS.filter((row) => row.date >= startKey && row.date <= endKey);
}

function matchesDeviceAndPage(
  row: DailyRow,
  filters: Pick<PlatformUsageFilters, "area" | "device" | "page">,
) {
  const page = PLATFORM_USAGE_PAGES.find((candidate) => candidate.key === row.page);
  return (
    (filters.area === "tutte" || page?.area === filters.area) &&
    (filters.device === "tutti" || row.device === filters.device) &&
    (filters.page === "tutte" || row.page === filters.page)
  );
}

function formatDay(date: string) {
  const parts = date.split("-");
  return `${parts[2]}/${parts[1]}`;
}

export function getPlatformUsageMockSnapshot(filters: PlatformUsageFilters) {
  const rows = selectRows(filters.period).filter((row) =>
    matchesDeviceAndPage(row, filters),
  );
  const previousRows = selectRows(filters.period, filters.period).filter((row) =>
    matchesDeviceAndPage(row, filters),
  );
  const totals = sumRows(rows);
  const previousTotals = sumRows(previousRows);

  const daily = Array.from(new Set(rows.map((row) => row.date)))
    .sort()
    .map((date) => {
      const dayTotals = sumRows(rows.filter((row) => row.date === date));
      return {
        date,
        label: formatDay(date),
        views: dayTotals.views,
        clicks: dayTotals.clicks,
      };
    });

  const pages = PLATFORM_USAGE_PAGES.filter(
    (page) =>
      (filters.area === "tutte" || page.area === filters.area) &&
      (filters.page === "tutte" || page.key === filters.page),
  )
    .map((page) => ({
      ...page,
      ...sumRows(rows.filter((row) => row.page === page.key)),
    }))
    .filter((page) => page.views > 0)
    .sort((a, b) => b.views - a.views);

  const clickedElements = pages
    .flatMap((page) =>
      page.elements.map(([label, share], index) => ({
        id: `${page.key}-${index}`,
        label,
        page: page.label,
        clicks:
          index === page.elements.length - 1
            ? page.clicks -
              page.elements
                .slice(0, -1)
                .reduce((sum, [, elementShare]) => sum + Math.round(page.clicks * elementShare), 0)
            : Math.round(page.clicks * share),
      })),
    )
    .sort((a, b) => b.clicks - a.clicks);

  const smartphoneViews = sumRows(
    rows.filter((row) => row.device === "smartphone"),
  ).views;
  const percentChange = (current: number, previous: number) =>
    previous === 0 ? 0 : Math.round(((current - previous) / previous) * 100);

  return {
    totals,
    daily,
    pages,
    clickedElements,
    topPage: pages[0] ?? null,
    topElement: clickedElements[0] ?? null,
    smartphoneShare:
      totals.views === 0 ? 0 : Math.round((smartphoneViews / totals.views) * 100),
    viewsChange: percentChange(totals.views, previousTotals.views),
    clicksChange: percentChange(totals.clicks, previousTotals.clicks),
    lastDate: toDateKey(MOCK_END_DATE),
  };
}
