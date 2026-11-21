export const PLATFORM_USAGE_PERIODS = [7, 30, 90] as const;
export type PlatformUsagePeriod = (typeof PLATFORM_USAGE_PERIODS)[number];
export type PlatformUsageDevice = "smartphone" | "computer";
export type PlatformUsageDeviceFilter = "tutti" | PlatformUsageDevice;
export type PlatformUsageArea = "aziende" | "piattaforma";
export type PlatformUsageAreaFilter = "tutte" | PlatformUsageArea;
export type PlatformUsageEventType =
  | "page_view"
  | "click"
  | "page_load"
  | "page_engagement"
  | "error";

export type PlatformUsagePageKey =
  | "lista-spesa"
  | "ordini-clienti"
  | "inventario"
  | "prodotti"
  | "preparazione"
  | "catalogo"
  | "piattaforma-pannello"
  | "piattaforma-aziende"
  | "piattaforma-utenti"
  | "piattaforma-registro"
  | "piattaforma-statistiche";

export type PlatformUsagePageFilter = "tutte" | PlatformUsagePageKey;

export type PlatformUsageFilters = {
  period: PlatformUsagePeriod;
  area: PlatformUsageAreaFilter;
  device: PlatformUsageDeviceFilter;
  page: PlatformUsagePageFilter;
};

export type PlatformUsagePageDefinition = {
  key: PlatformUsagePageKey;
  area: PlatformUsageArea;
  label: string;
  path: string;
};

export const PLATFORM_USAGE_PAGES: readonly PlatformUsagePageDefinition[] = [
  { key: "lista-spesa", label: "Lista della Spesa", path: "/acquisti/lista-spesa", area: "aziende" },
  { key: "ordini-clienti", label: "Ordini clienti", path: "/vendite/ordini-clienti", area: "aziende" },
  { key: "inventario", label: "Inventario", path: "/acquisti/inventario", area: "aziende" },
  { key: "prodotti", label: "Prodotti", path: "/acquisti/prodotti", area: "aziende" },
  { key: "preparazione", label: "Preparazione", path: "/operativo/preparazione", area: "aziende" },
  { key: "catalogo", label: "Catalogo", path: "/acquisti/catalogo", area: "aziende" },
  { key: "piattaforma-pannello", label: "Piattaforma · Pannello", path: "/piattaforma", area: "piattaforma" },
  { key: "piattaforma-aziende", label: "Piattaforma · Aziende", path: "/piattaforma/aziende", area: "piattaforma" },
  { key: "piattaforma-utenti", label: "Piattaforma · Utenti", path: "/piattaforma/utenti", area: "piattaforma" },
  { key: "piattaforma-registro", label: "Piattaforma · Registro", path: "/piattaforma/registro", area: "piattaforma" },
  { key: "piattaforma-statistiche", label: "Piattaforma · Statistiche", path: "/piattaforma/statistiche", area: "piattaforma" },
];

export const PLATFORM_USAGE_COMMANDS: Record<string, string> = {
  "confirm-quantity": "Conferma quantità",
  "add-catalog-product": "Aggiungi alla Lista",
  "confirm-inventory-count": "Conferma conteggio",
};

export type PlatformUsagePageStat = {
  key: PlatformUsagePageKey;
  views: number;
  clicks: number;
  visits: number;
  errors: number;
  avgLoadMs: number | null;
  activeMs: number;
  smartphoneViews: number;
  computerViews: number;
  smartphoneErrors: number;
  computerErrors: number;
  smartphoneLoadMs: number | null;
  computerLoadMs: number | null;
};

export type PlatformUsageElementStat = {
  key: string;
  pageKey: PlatformUsagePageKey;
  clicks: number;
  visits: number;
  repeatedVisits: number;
  maxClicksInVisit: number;
};

export type PlatformUsageSnapshot = {
  days: PlatformUsagePeriod;
  totals: { views: number; clicks: number; visits: number };
  previousTotals: { views: number; clicks: number };
  daily: { date: string; views: number; clicks: number }[];
  pages: PlatformUsagePageStat[];
  clickedElements: PlatformUsageElementStat[];
  collectionStartedAt: string | null;
};

export type PlatformUsageAdvice = {
  id: "page" | "mobile" | "command";
  title: string;
  suggestion: string;
  evidence: string;
  sufficient: boolean;
};

export function getPlatformUsagePage(pathname: string): PlatformUsagePageDefinition | null {
  const exact = PLATFORM_USAGE_PAGES.find((page) => page.path === pathname);
  if (exact) return exact;
  if (pathname === "/vendite/prodotti") {
    return PLATFORM_USAGE_PAGES.find((page) => page.key === "prodotti") ?? null;
  }
  if (pathname.startsWith("/acquisti/catalogo/")) {
    return PLATFORM_USAGE_PAGES.find((page) => page.key === "catalogo") ?? null;
  }
  if (pathname.startsWith("/piattaforma/aziende/")) {
    return PLATFORM_USAGE_PAGES.find((page) => page.key === "piattaforma-aziende") ?? null;
  }
  return null;
}

export function getPlatformUsagePageLabel(key: PlatformUsagePageKey): string {
  return PLATFORM_USAGE_PAGES.find((page) => page.key === key)?.label ?? key;
}

export function getPlatformUsageCommandLabel(key: string): string {
  return PLATFORM_USAGE_COMMANDS[key] ?? key.replaceAll("-", " ");
}

export function platformUsagePercentChange(current: number, previous: number): number {
  return previous === 0 ? 0 : Math.round(((current - previous) / previous) * 100);
}

export function formatPlatformUsageDay(date: string): string {
  const parts = date.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
}

const MIN_PAGE_VIEWS = 10;
const MIN_DEVICE_VIEWS = 5;
const MIN_COMMAND_CLICKS = 5;

function insufficient(
  id: PlatformUsageAdvice["id"],
  title: string,
  suggestion: string,
  evidence: string,
): PlatformUsageAdvice {
  return { id, title, suggestion, evidence, sufficient: false };
}

function pageAdvice(snapshot: PlatformUsageSnapshot): PlatformUsageAdvice {
  const candidates = snapshot.pages.filter((page) => page.views >= MIN_PAGE_VIEWS);
  const top = [...candidates].sort((a, b) =>
    b.errors - a.errors ||
    Number((b.avgLoadMs ?? 0) >= 1500) - Number((a.avgLoadMs ?? 0) >= 1500) ||
    (b.avgLoadMs ?? 0) - (a.avgLoadMs ?? 0) ||
    b.views - a.views
  )[0];
  if (!top) {
    return insufficient(
      "page",
      "Pagina da migliorare",
      `Servono almeno ${MIN_PAGE_VIEWS} aperture di una stessa pagina prima di indicare una priorità.`,
      `${snapshot.totals.views} aperture registrate nel periodo con i filtri attuali.`,
    );
  }
  const label = getPlatformUsagePageLabel(top.key);
  if (top.errors > 0) {
    return {
      id: "page",
      title: `Controlla gli errori in ${label}`,
      suggestion: `Verifica e correggi il percorso principale di ${label}, poi controlla che gli errori diminuiscano.`,
      evidence: `${top.views} aperture e ${top.errors} errori nel periodo selezionato.`,
      sufficient: true,
    };
  }
  if ((top.avgLoadMs ?? 0) >= 1500) {
    return {
      id: "page",
      title: `Rendi più veloce ${label}`,
      suggestion: `Riduci il tempo di apertura di ${label}, partendo dalle operazioni che attendono il caricamento completo.`,
      evidence: `${top.views} aperture; caricamento medio ${(Number(top.avgLoadMs) / 1000).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} secondi.`,
      sufficient: true,
    };
  }
  return {
    id: "page",
    title: `Semplifica il percorso di ${label}`,
    suggestion: `Ridurre anche un solo passaggio in ${label} può migliorare molte operazioni: parti dai campi e dalle conferme del percorso principale.`,
    evidence: `${top.views} aperture in ${top.visits} visite nel periodo selezionato.`,
    sufficient: true,
  };
}

function mobileAdvice(snapshot: PlatformUsageSnapshot): PlatformUsageAdvice {
  const smartphoneViews = snapshot.pages.reduce((sum, page) => sum + page.smartphoneViews, 0);
  const computerViews = snapshot.pages.reduce((sum, page) => sum + page.computerViews, 0);
  const smartphoneErrors = snapshot.pages.reduce((sum, page) => sum + page.smartphoneErrors, 0);
  const computerErrors = snapshot.pages.reduce((sum, page) => sum + page.computerErrors, 0);
  if (smartphoneViews < MIN_DEVICE_VIEWS || computerViews < MIN_DEVICE_VIEWS) {
    return insufficient(
      "mobile",
      "Esperienza da telefono",
      `Servono almeno ${MIN_DEVICE_VIEWS} aperture sia da telefono sia da computer per un confronto utile.`,
      `${smartphoneViews} aperture da telefono e ${computerViews} da computer.`,
    );
  }
  const total = smartphoneViews + computerViews;
  const share = Math.round((smartphoneViews / total) * 100);
  if (smartphoneErrors > computerErrors && smartphoneErrors > 0) {
    return {
      id: "mobile",
      title: "Verifica prima gli errori su telefono",
      suggestion: "Ripeti su telefono il percorso principale e correggi il primo errore che impedisce campi, conferme o navigazione.",
      evidence: `${smartphoneErrors} errori da telefono contro ${computerErrors} da computer; ${share}% delle aperture è mobile.`,
      sufficient: true,
    };
  }
  if (share >= 50) {
    return {
      id: "mobile",
      title: "Progetta prima per il telefono",
      suggestion: "Controlla su uno schermo piccolo campi, tasti di conferma e passaggi successivi delle pagine più usate.",
      evidence: `${share}% delle aperture è da telefono: ${smartphoneViews} contro ${computerViews} da computer.`,
      sufficient: true,
    };
  }
  return {
    id: "mobile",
    title: "Mantieni semplice anche il telefono",
    suggestion: "Pur essendo usato meno del computer, verifica che su telefono i comandi principali restino visibili senza passaggi aggiuntivi.",
    evidence: `${smartphoneViews} aperture da telefono e ${computerViews} da computer.`,
    sufficient: true,
  };
}

function commandAdvice(snapshot: PlatformUsageSnapshot): PlatformUsageAdvice {
  const top = [...snapshot.clickedElements]
    .filter((element) => element.clicks >= MIN_COMMAND_CLICKS)
    .sort((a, b) => b.repeatedVisits - a.repeatedVisits || b.clicks - a.clicks)[0];
  if (!top) {
    return insufficient(
      "command",
      "Comando da semplificare",
      `Servono almeno ${MIN_COMMAND_CLICKS} clic su uno stesso comando prima di proporre una modifica.`,
      `${snapshot.totals.clicks} clic registrati nel periodo con i filtri attuali.`,
    );
  }
  const label = getPlatformUsageCommandLabel(top.key);
  const page = getPlatformUsagePageLabel(top.pageKey);
  if (top.repeatedVisits > 0) {
    return {
      id: "command",
      title: `Riduci i passaggi di ${label}`,
      suggestion: `In ${page}, valuta una conferma più immediata o un passaggio in meno dopo «${label}», senza cambiare il controllo richiesto dall’operazione.`,
      evidence: `${top.clicks} clic in ${top.visits} visite; in ${top.repeatedVisits} visite il comando è stato usato più volte.`,
      sufficient: true,
    };
  }
  return {
    id: "command",
    title: `Rendi immediato ${label}`,
    suggestion: `Mantieni «${label}» ben visibile in ${page} e verifica se puoi ridurre i passaggi necessari prima di arrivare al comando.`,
    evidence: `${top.clicks} clic in ${top.visits} visite nel periodo selezionato.`,
    sufficient: true,
  };
}

export function getPlatformUsageAdvice(snapshot: PlatformUsageSnapshot): PlatformUsageAdvice[] {
  return [pageAdvice(snapshot), mobileAdvice(snapshot), commandAdvice(snapshot)];
}
