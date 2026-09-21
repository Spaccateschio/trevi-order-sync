/**
 * Giorni di consegna di un fornitore (informativi).
 * Non filtrano, non ordinano e non influenzano ordini, fabbisogno o giacenze.
 */
export type DeliverySchedule = {
  /** Giorni ISO attivi: 1 = lunedì … 7 = domenica. */
  weekdays: number[];
  /** Giorno del mese (1–31) per i fornitori che consegnano una volta al mese. */
  monthDay: number | null;
};

export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Gio",
  5: "Ven",
  6: "Sab",
  7: "Dom",
};

export const WEEKDAY_FULL: Record<number, string> = {
  1: "lunedì",
  2: "martedì",
  3: "mercoledì",
  4: "giovedì",
  5: "venerdì",
  6: "sabato",
  7: "domenica",
};

export const DEFAULT_SCHEDULE: DeliverySchedule = { weekdays: [...ALL_WEEKDAYS], monthDay: null };

/** Normalizza i dati letti dal database (array e giorno del mese possono essere nulli). */
export function toSchedule(
  weekdays: number[] | null | undefined,
  monthDay: number | null | undefined,
): DeliverySchedule {
  const clean = (weekdays ?? []).filter((day) => day >= 1 && day <= 7);
  return {
    weekdays: Array.from(new Set(clean)).sort((a, b) => a - b),
    monthDay: monthDay ?? null,
  };
}

/** ISO weekday (1 = lunedì … 7 = domenica). */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function isScheduleEmpty(schedule: DeliverySchedule): boolean {
  return schedule.weekdays.length === 0 && schedule.monthDay === null;
}

export function isDeliveryDay(date: Date, schedule: DeliverySchedule): boolean {
  if (schedule.monthDay !== null && date.getDate() === schedule.monthDay) return true;
  return schedule.weekdays.includes(isoWeekday(date));
}

/** Prima data utile di consegna a partire da domani (fino a 60 giorni avanti). */
export function nextDeliveryDate(from: Date, schedule: DeliverySchedule): Date | null {
  if (isScheduleEmpty(schedule)) return null;
  for (let offset = 1; offset <= 60; offset += 1) {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    if (isDeliveryDay(candidate, schedule)) return candidate;
  }
  return null;
}

/** Riassunto compatto, es. "Lun · Mer · Ven" oppure "il 15 di ogni mese". */
export function scheduleSummary(schedule: DeliverySchedule): string {
  if (isScheduleEmpty(schedule)) return "Giorni di consegna non impostati";
  const parts: string[] = [];
  if (schedule.weekdays.length === 7) parts.push("Tutti i giorni");
  else if (schedule.weekdays.length) parts.push(schedule.weekdays.map((day) => WEEKDAY_LABELS[day]).join(" · "));
  if (schedule.monthDay !== null) parts.push(`il ${schedule.monthDay} di ogni mese`);
  return parts.join(" · ");
}

/** Etichetta informativa per inventario e lista della spesa. */
export function deliveryHint(schedule: DeliverySchedule, today = new Date()): {
  tone: "today" | "other" | "unset";
  label: string;
} {
  if (isScheduleEmpty(schedule)) return { tone: "unset", label: "Giorni di consegna non impostati" };
  if (isDeliveryDay(today, schedule)) return { tone: "today", label: "Consegna oggi" };
  const next = nextDeliveryDate(today, schedule);
  if (!next) return { tone: "unset", label: "Giorni di consegna non impostati" };
  return {
    tone: "other",
    label: `Non consegna oggi — prossima: ${WEEKDAY_FULL[isoWeekday(next)]} ${next.getDate()}`,
  };
}
