/**
 * Tom — lettura delle quantità dette in italiano. Funzioni pure.
 * Regola: numero non capito = null (campo vuoto), mai zero. Zero solo se detto esplicitamente.
 */

export function normalizeSpeech(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9,.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNITS: Record<string, number> = {
  zero: 0, un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9,
  dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16,
  diciassette: 17, diciotto: 18, diciannove: 19,
};
const TENS: [string, number][] = [
  ["venti", 20], ["trenta", 30], ["quaranta", 40], ["cinquanta", 50],
  ["sessanta", 60], ["settanta", 70], ["ottanta", 80], ["novanta", 90],
];

/** Parola numerica italiana 0–999 («ventitre», «centoventi», «trentuno»); null se non è un numero. */
export function italianWordNumber(word: string): number | null {
  const w = word.trim();
  if (!w) return null;
  if (w in UNITS) return UNITS[w]!;
  if (w === "cento") return 100;
  const hundred = w.indexOf("cento");
  if (hundred >= 0) {
    const head = w.slice(0, hundred);
    const tail = w.slice(hundred + 5);
    const multiplier = head ? UNITS[head] : 1;
    if (!multiplier || multiplier < 2 && head) return null;
    if (!tail) return multiplier * 100;
    const rest = italianWordNumber(tail.startsWith("e") && !(tail in UNITS) ? tail : tail);
    return rest === null || rest >= 100 ? null : multiplier * 100 + rest;
  }
  for (const [base, value] of TENS) {
    const elided = base.slice(0, -1);
    if (w === base) return value;
    for (const stem of [base, elided]) {
      if (w.startsWith(stem) && w.length > stem.length) {
        const unit = UNITS[w.slice(stem.length)];
        if (unit !== undefined && unit >= 1 && unit <= 9) return value + unit;
      }
    }
  }
  return null;
}

/** Sinonimi parlati → parola U.M. canonica (da confrontare poi con le U.M. ammesse della card). */
const UNIT_WORDS: Record<string, string> = {
  cassa: "cassa", casse: "cassa", cassetta: "cassa", cassette: "cassa", cs: "cassa",
  kg: "kg", chilo: "kg", chili: "kg", kilo: "kg", kili: "kg", chilogrammo: "kg", chilogrammi: "kg",
  pezzo: "pz", pezzi: "pz", pz: "pz",
  mazzo: "mazzo", mazzi: "mazzo",
  vaschetta: "vaschetta", vaschette: "vaschetta",
  cartone: "cartone", cartoni: "cartone",
  sacco: "sacco", sacchi: "sacco",
  confezione: "confezione", confezioni: "confezione",
  grammi: "g", grammo: "g", etti: "etto", etto: "etto",
  numero: "nr", nr: "nr",
};

/** Codici U.M. aziendali che corrispondono a una parola canonica. */
const UNIT_CODES = {
  cassa: ["cassa", "cs", "cas", "cass", "cassetta"],
  kg: ["kg", "chili", "kilo"],
  pz: ["pz", "pezzo", "pezzi", "pzz"],
  mazzo: ["mazzo", "mazzi", "mz"],
  vaschetta: ["vaschetta", "vasc", "vs"],
  cartone: ["cartone", "ct", "cart"],
  sacco: ["sacco", "sc"],
  confezione: ["confezione", "conf", "cf"],
  g: ["g", "gr"],
  etto: ["hg", "etto"],
  nr: ["nr", "n", "num"],
} as Record<string, string[]> & Record<"cassa" | "kg" | "pz" | "mazzo" | "vaschetta", string[]>;

export type SpokenQuantity = { quantity: number | null; unitWord: string | null; explicitZero: boolean };

/**
 * «tre», «una cassa», «tre e mezzo», «due virgola cinque chili», «dodici», «venti casse», «2,5 kg», «zero».
 * Restituisce quantity=null se il numero non è chiaro.
 */
export function parseItalianQuantity(text: string): SpokenQuantity {
  const tokens = normalizeSpeech(text).split(" ").filter(Boolean);
  let unitWord: string | null = null;
  const numberTokens: string[] = [];
  for (const token of tokens) {
    const unit = UNIT_WORDS[token];
    if (unit && !(token === "una" || token === "un")) { if (!unitWord) unitWord = unit; continue; }
    numberTokens.push(token);
  }
  const quantity = readNumber(numberTokens);
  return { quantity, unitWord, explicitZero: quantity === 0 };
}

const FILLERS = new Set(["di", "da", "sono", "erano", "ci", "ne", "metti", "segna", "segnate", "circa", "allora", "no", "si", "ok", "e"]);

function digitValue(token: string): number | null {
  if (!/^\d+([.,]\d+)?$/.test(token)) return null;
  const value = Number(token.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function readNumber(raw: string[]): number | null {
  // Gestisce «e mezzo»/«e mezza» e «virgola» prima di scartare i riempitivi.
  const tokens = raw.filter((t) => t.length);
  let integer: number | null = null;
  let fraction = 0;
  let found = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token === "virgola" || token === "punto") {
      const next = tokens[i + 1];
      if (integer === null || !next) return null;
      const digits = /^\d+$/.test(next) ? next : (() => {
        const value = italianWordNumber(next);
        return value === null ? null : String(value);
      })();
      if (digits === null) return null;
      fraction = Number(`0.${digits}`);
      i += 1;
      continue;
    }
    if ((token === "mezzo" || token === "mezza")) {
      if (integer === null) { integer = 0; fraction = 0.5; found = true; }
      else fraction = 0.5;
      continue;
    }
    const value = digitValue(token) ?? italianWordNumber(token);
    if (value !== null) {
      if (found) return null; // due numeri diversi nella stessa frase: non chiaro
      integer = value;
      found = true;
      continue;
    }
    if (FILLERS.has(token)) continue;
    // Parole estranee (es. nome del prodotto) non invalidano il numero.
  }
  if (!found || integer === null) return null;
  const total = Math.round((integer + fraction) * 1000) / 1000;
  return total >= 0 && total < 100000 ? total : null;
}

/** Sceglie tra le U.M. ammesse quella detta; null se non corrisponde o è ambigua. */
export function matchAllowedUnit<T extends { id: string; code: string }>(unitWord: string | null, allowed: T[]): T | null {
  if (!unitWord) return null;
  const codes = UNIT_CODES[unitWord] ?? [unitWord];
  const matches = allowed.filter((unit) => codes.includes(unit.code.trim().toLowerCase()));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    const exact = matches.find((unit) => unit.code.trim().toLowerCase() === unitWord);
    return exact ?? matches[0]!;
  }
  return null;
}

/** Parola da pronunciare per una U.M. (es. «casse», «chili»). */
export function spokenUnit(code: string, quantity: number | null) {
  const c = code.trim().toLowerCase();
  const plural = quantity === null || quantity !== 1;
  if (UNIT_CODES.cassa.includes(c)) return plural ? "casse" : "cassa";
  if (UNIT_CODES.kg.includes(c)) return plural ? "chili" : "chilo";
  if (UNIT_CODES.pz.includes(c)) return plural ? "pezzi" : "pezzo";
  if (UNIT_CODES.mazzo.includes(c)) return plural ? "mazzi" : "mazzo";
  if (UNIT_CODES.vaschetta.includes(c)) return plural ? "vaschette" : "vaschetta";
  return code;
}

export function spokenNumber(value: number) {
  return String(value).replace(".", ",");
}
