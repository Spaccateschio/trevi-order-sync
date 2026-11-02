/**
 * Tom — comandi brevi riconosciuti senza modello (più veloci e senza costi) e
 * coda della modalità guidata. Funzioni pure: nessuna scrittura.
 */
import { normalizeSpeech, parseItalianQuantity } from "./italian-quantity";

export type QuickCommand =
  | { kind: "end" }
  | { kind: "skip" }
  | { kind: "repeat" }
  | { kind: "undo" }
  | { kind: "summary" }
  | { kind: "confirm_all" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "correct"; quantity: number | null; unitWord: string | null }
  | { kind: "quantity"; quantity: number; unitWord: string | null };

const has = (text: string, words: string[]) => words.some((word) => new RegExp(`(^| )${word}( |$)`).test(text));

/**
 * Riconosce comandi brevi. Una frase con solo una quantità vale come «quantity» solo in modalità guidata
 * (la card è già nota); altrimenti resta al modello che individua il prodotto.
 */
export function parseQuickCommand(text: string, guided: boolean): QuickCommand | null {
  const t = normalizeSpeech(text).replace(/[.,]$/, "");
  if (!t) return null;
  if (/^(fine|basta|stop|chiudi tom|grazie tom|ho finito)( .*)?$/.test(t) && t.split(" ").length <= 3) return { kind: "end" };
  if (/^(salta|prossimo|avanti|passa)( .*)?$/.test(t) && t.split(" ").length <= 2) return { kind: "skip" };
  if (/^(ripeti|come|cosa|puoi ripetere)$/.test(t)) return { kind: "repeat" };
  if (/^annulla( l ultimo| ultimo| l ultima)?$/.test(t)) return { kind: "undo" };
  if (/^(riepilogo|fammi il riepilogo|riassunto)$/.test(t)) return { kind: "summary" };
  if (/^conferma( tutto| inventario| tutte)?$/.test(t)) return { kind: "confirm_all" };
  if (/^(si|sì|confermo|ok|va bene|esatto|certo)( si)?$/.test(t)) return { kind: "yes" };
  if (/^(no|non confermare|aspetta)$/.test(t)) return { kind: "no" };
  if (/^(no )?(erano|sono|era|correggi)( |$)/.test(t) || (/^no /.test(t) && has(t, ["erano", "sono"]))) {
    const spoken = parseItalianQuantity(t);
    return { kind: "correct", quantity: spoken.quantity, unitWord: spoken.unitWord };
  }
  if (guided) {
    const spoken = parseItalianQuantity(t);
    // Solo numero (+ eventuale U.M.), al massimo 6 parole: niente nomi di prodotto da interpretare.
    if (spoken.quantity !== null && t.split(" ").length <= 6) return { kind: "quantity", quantity: spoken.quantity, unitWord: spoken.unitWord };
  }
  return null;
}

/** Prossima card della modalità guidata: stesso ordine dello schermo, saltando confermate e già fatte. */
export function nextGuidedIndex(keys: string[], fromIndex: number, done: Set<string>, locked: Set<string>) {
  for (let i = fromIndex + 1; i < keys.length; i += 1) {
    const key = keys[i]!;
    if (!done.has(key) && !locked.has(key)) return i;
  }
  return -1;
}

/** Riconosce «facciamo l'inventario della cella 1» → nome zona (testo libero da confrontare con le ubicazioni). */
export function parseGuidedStart(text: string): { zone: string | null } | null {
  const t = normalizeSpeech(text);
  const match = t.match(/(facciamo|fai|iniziamo|inizia|partiamo|guidami)( l)?( |$)(inventario|conteggio)?( (della|del|nella|nel|in|di))? ?(.*)$/);
  if (!match || !/(facciamo|iniziamo|inizia|partiamo|guidami|fai)/.test(t) || !/(inventario|conteggio|guidami)/.test(t)) return null;
  const zone = (match[7] ?? "").replace(/^(la|il|lo|l) /, "").trim();
  return { zone: zone || null };
}

/** Ubicazione più simile al nome detto (es. «cella 1» → «Cella 1»); null se nessuna o ambigua. */
export function matchLocation<T extends { id: string; name: string; code?: string | null }>(spoken: string, locations: T[]): T | null {
  const s = normalizeSpeech(spoken).replace(/\buno\b/g, "1").replace(/\bdue\b/g, "2").replace(/\btre\b/g, "3").replace(/\bquattro\b/g, "4");
  const norm = (value: string) => normalizeSpeech(value);
  const exact = locations.filter((l) => norm(l.name) === s || (l.code && norm(l.code) === s));
  if (exact.length === 1) return exact[0]!;
  const partial = locations.filter((l) => norm(l.name).includes(s) || s.includes(norm(l.name)));
  return partial.length === 1 ? partial[0]! : null;
}
