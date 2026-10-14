/**
 * Larghezza delle card dell'Inventario.
 * Le card stanno strette quando sotto il nome non c'è nulla da leggere: la nota «Danea: kg
 * (solo informativa)» è corta e sta anche nella card stretta, quindi non conta.
 * Tutte le card in vista hanno la stessa misura: la decide la più piena.
 */

export const CARD_MIN_NARROW = 250;
export const CARD_MIN_WIDE = 320;

export type CardTextSignal = {
  /** Zone abituali già impostate sul prodotto. */
  habitualZones: number;
  /** Categoria/sottocategoria mostrata. */
  category: boolean;
  /** Fornitore o prezzo d'acquisto mostrato. */
  supplier: boolean;
  /** Scorta minima o multiplo d'ordine mostrato. */
  stockInfo: boolean;
  /** Ultimo conteggio mostrato. */
  lastCount: boolean;
};

/** Quante righe di testo ha la card sotto il nome (la nota Danea non conta). */
export function extraCardLineCount(signal: CardTextSignal): number {
  return (
    (signal.habitualZones > 0 ? 1 : 0) +
    (signal.category ? 1 : 0) +
    (signal.supplier ? 1 : 0) +
    (signal.stockInfo ? 1 : 0) +
    (signal.lastCount ? 1 : 0)
  );
}

/**
 * Larghezza minima della griglia. Le card si allargano solo se sono davvero tante quelle con
 * scritte sotto il nome: una zona abituale孤立 su ventidue card non deve restringere lo schermo.
 */
export function pickCardMinWidth(signals: CardTextSignal[]): number {
  if (!signals.length) return CARD_MIN_NARROW;
  const full = signals.filter((signal) => extraCardLineCount(signal) > 0).length;
  return full * 2 >= signals.length ? CARD_MIN_WIDE : CARD_MIN_NARROW;
}
