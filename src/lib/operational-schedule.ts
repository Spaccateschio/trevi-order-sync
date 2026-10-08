import { hhmm } from "@/lib/delivery-preferences";

/**
 * Regola aziendale di preparazione (company_operational_schedules).
 * Solo lettura: qui non si scrive nulla, la programmazione cambia solo in Azienda → Preferenze.
 */
export type OperationalScheduleRow = {
  schedule_type: string;
  enabled: boolean;
  reminder_time: string | null;
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

/**
 * Riassunto in una riga, ricavato solo da enabled, giorni e reminder_time.
 * Nessun valore inventato: se manca qualcosa lo dice.
 */
export function describeOperationalSchedule(row: OperationalScheduleRow | null | undefined): string {
  if (!row) return "Promemoria non impostato";
  if (!row.enabled) return "Promemoria disattivato";
  const parts = [formatScheduleDays(row), hhmm(row.reminder_time)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Giorni e orario non impostati";
}
