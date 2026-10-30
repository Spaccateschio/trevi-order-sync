import { cn } from "@/lib/utils";

/**
 * Preferenza locale della barra laterale: solo presentazione.
 * Nessuna scrittura su dati operativi e nessuna impostazione condivisa.
 */

const STORAGE_KEY = "trevi:barra-laterale:compatta";

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* preferenza non salvata: la barra resta comunque comprimibile */
  }
}

/** Larghezza della barra e spazio lasciato al contenuto: restano sempre allineati. */
export function sidebarRailClass(collapsed: boolean) {
  return cn(
    "fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto bg-sidebar px-3 py-5 lg:flex",
    collapsed ? "w-[72px]" : "w-60",
  );
}

export function sidebarMainClass(collapsed: boolean) {
  return collapsed ? "lg:pl-[72px]" : "lg:pl-60";
}

/** Etichetta del pulsante che comprime o ingrandisce la barra. */
export function sidebarToggleLabel(collapsed: boolean) {
  return collapsed ? "Ingrandisci la barra laterale" : "Comprimi la barra laterale";
}

/** Due iniziali per l'indicatore aziendale nella barra compressa. */
export function companyInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}
