/**
 * Informazioni sul listino del venditore: ultimo aggiornamento REALE,
 * orario abituale (solo informativo) e testo personalizzabile.
 * Modulo puro: nessun accesso al database.
 */
export const PRICE_TIME_ZONE = "Europe/Rome";

export const DEFAULT_PRICE_INFO_TEXT =
  "Prezzi indicativi: il prezzo definitivo è quello in vigore alla preparazione dell'ordine.";

function romeParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const hhmm = (t: string | null | undefined) => (t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null);

/**
 * «Listino non ancora aggiornato oggi»: solo con orario abituale impostato,
 * quando l'ultimo aggiornamento reale è precedente all'orario abituale di oggi (ora di Roma).
 */
export function priceListNotUpdatedToday(
  lastUpdateAt: string | null | undefined,
  usualTime: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const usual = hhmm(usualTime);
  if (!usual) return false;
  if (!lastUpdateAt) return true;
  const today = romeParts(now).date;
  const last = romeParts(new Date(lastUpdateAt));
  return `${last.date} ${last.time}` < `${today} ${usual}`;
}

export const PRICE_NOT_UPDATED_WARNING = "Listino non ancora aggiornato oggi";

export function formatPriceUpdate(at: string): string {
  const d = new Date(at);
  const date = d.toLocaleDateString("it-IT", { timeZone: PRICE_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("it-IT", { timeZone: PRICE_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  return `${date} alle ${time}`;
}

/** Messaggio per il cliente: parti mancanti omesse, nessuna percentuale o promessa. */
export function priceInfoMessage(info: {
  last_price_update_at: string | null;
  usual_update_time: string | null;
  info_text: string | null;
}): string {
  const parts: string[] = [];
  if (info.last_price_update_at) parts.push(`Prezzi aggiornati il ${formatPriceUpdate(info.last_price_update_at)}`);
  const usual = hhmm(info.usual_update_time);
  if (usual) parts.push(`Aggiornamento abituale ore ${usual}`);
  parts.push(info.info_text?.trim() || DEFAULT_PRICE_INFO_TEXT);
  return parts.join(" · ");
}
