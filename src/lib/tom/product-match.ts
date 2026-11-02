/** Tom — ricerca approssimata dei prodotti per nome detto (rumore, errori di trascrizione). Pura. */
import { normalizeSpeech } from "./italian-quantity";

function trigrams(value: string) {
  const s = `  ${value} `;
  const set = new Set<string>();
  for (let i = 0; i < s.length - 2; i += 1) set.add(s.slice(i, i + 3));
  return set;
}

export function similarity(a: string, b: string) {
  const left = trigrams(normalizeSpeech(a));
  const right = trigrams(normalizeSpeech(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const g of left) if (right.has(g)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Punteggio 0..1: parole del nome presenti nella frase + somiglianza a trigrammi. */
export function productScore(phrase: string, name: string) {
  const p = normalizeSpeech(phrase);
  const words = normalizeSpeech(name).split(" ").filter((w) => w.length >= 3 && !/^\d/.test(w));
  if (!words.length) return 0;
  const phraseWords = p.split(" ");
  const hits = words.filter((w) => phraseWords.some((pw) => pw === w || (pw.length >= 4 && (w.startsWith(pw) || pw.startsWith(w)))));
  const wordScore = hits.length / words.length;
  return Math.max(wordScore * 0.8 + similarity(p, name) * 0.2, similarity(p, name));
}

export function rankProducts<T extends { name: string }>(phrase: string, items: T[], limit = 8) {
  return items
    .map((item) => ({ item, score: productScore(phrase, item.name) }))
    .filter((entry) => entry.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
