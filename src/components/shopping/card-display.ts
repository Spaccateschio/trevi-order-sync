import { useEffect, useState } from "react";

/** «Visualizza dati»: decide solo cosa si vede dentro le card, mai quali card né alcun dato salvato. */
export const DISPLAY_FIELDS = [
  ["photo", "Foto prodotto"],
  ["code", "Codice prodotto"],
  ["category", "Categoria"],
  ["lastCount", "Ultimo conteggio"],
  ["stock", "Giacenza"],
  ["suggested", "Quantità suggerita"],
  ["toBuy", "Da acquistare"],
  ["quick", "Tasti rapidi +1/+3/+5/+10"],
  ["lockDate", "Data/ora conferma"],
  ["status", "Stato (Da valutare, In lista)"],
  ["suppliers", "Fornitori"],
  ["b2b", "B2B / Non B2B"],
  ["price", "Prezzo acquisto"],
  ["purchaseUnit", "U.M. acquisto"],
  ["splits", "Ripartizioni fornitori"],
  ["conversion", "Conversione (2 casse ≈ 20 kg)"],
  ["assignStatus", "Stato assegnazione"],
] as const;

export type DisplayField = (typeof DISPLAY_FIELDS)[number][0];
export type DisplayPrefs = Record<DisplayField, boolean>;

export const ALL_VISIBLE: DisplayPrefs = Object.fromEntries(DISPLAY_FIELDS.map(([key]) => [key, true])) as DisplayPrefs;

const STORAGE_KEY = "shopping-list-card-display";

/** Preferenza solo del browser (come Card/Righe): nessuna scrittura nel database. */
export function useCardDisplay() {
  const [prefs, setPrefs] = useState<DisplayPrefs>(ALL_VISIBLE);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPrefs({ ...ALL_VISIBLE, ...(JSON.parse(saved) as Partial<DisplayPrefs>) });
    } catch {
      /* preferenza illeggibile: tutto visibile */
    }
  }, []);
  const update = (next: DisplayPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
  };
  return { prefs, setField: (key: DisplayField, value: boolean) => update({ ...prefs, [key]: value }), reset: () => update(ALL_VISIBLE) };
}
