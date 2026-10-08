import { hhmm } from "@/lib/delivery-preferences";

/**
 * Regola aziendale di preparazione (company_operational_schedules).
 * Solo lettura: qui non si scrive nulla, la programmazione cambia solo in Azienda → Preferenze.
 */
export type OperationalScheduleRow = {
  schedule_type: string;
  enabled: boolean;
  reminder_time: string | null;
  override_date: string | null;
  override_time: string | null;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
};

const DAY_LABELS: [keyof OperationalScheduleRow, string][] = [
  ["monday", "Lun"],
  ["tuesday", "Mar"],
  ["wednesday", "Mer"],
  ["thursday", "Gio"],
  ["friday", "Ven"],
  ["saturday", "Sab"],
  ["sunday", "Dom"],
];

/** Giorni selezionati, in ordine settimanale: «Lun · Mar · Gio». */
export function formatScheduleDays(row: OperationalScheduleRow): string {
  return DAY_LABELS.filter(([key]) => row[key] === true)
    .map(([, label]) => label)
    .join(" · ");
}

/** Data locale di oggi in formato YYYY-MM-DD (fuso del dispositivo). */
export function localTodayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Orario effettivo del promemoria: se l'eccezione «solo oggi» è di oggi vale
 * override_time, altrimenti reminder_time. L'eccezione scaduta si ignora da sola.
 */
export function effectiveReminderTime(
  row: OperationalScheduleRow | null | undefined,
  todayISO: string = localTodayISO(),
): string | null {
  if (!row) return null;
  if (row.override_date && row.override_time && row.override_date === todayISO) {
    return hhmm(row.override_time) || null;
  }
  return hhmm(row.reminder_time) || null;
}

/** Vero se oggi vale l'eccezione temporanea. */
export function hasTodayOverride(
  row: OperationalScheduleRow | null | undefined,
  todayISO: string = localTodayISO(),
): boolean {
  return !!row && !!row.override_date && !!row.override_time && row.override_date === todayISO;
}

/**
 * Riassunto in una riga, ricavato solo da enabled, giorni e orario effettivo.
 * Nessun valore inventato: se manca qualcosa lo dice.
 */
export function describeOperationalSchedule(
  row: OperationalScheduleRow | null | undefined,
  todayISO: string = localTodayISO(),
): string {
  if (!row) return "Promemoria non impostato";
  if (!row.enabled) return "Promemoria disattivato";
  const time = effectiveReminderTime(row, todayISO);
  const parts = [formatScheduleDays(row), time].filter(Boolean);
  const base = parts.length ? parts.join(" · ") : "Giorni e orario non impostati";
  return hasTodayOverride(row, todayISO) ? `${base} (solo oggi)` : base;
}
