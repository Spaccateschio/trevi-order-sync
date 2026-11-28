/**
 * Dati finti per l'anteprima «Documenti e saldo clienti».
 * Nessuna scrittura: tutto lo stato vive in memoria nel componente.
 * Le date sono generate a partire da oggi, così l'anteprima resta sensata.
 */

export type DocumentKind = "DDT" | "Fattura";
export type DocumentStatus = "pagato" | "da_incassare" | "scaduto";

export type CustomerDocument = {
  id: string;
  kind: DocumentKind;
  number: string;
  date: string;
  dueDate: string | null;
  amount: number;
  paid: boolean;
};

export type CustomerBalance = {
  id: string;
  name: string;
  city: string;
  documents: CustomerDocument[];
};

export type BalanceFilter = "tutti" | "da_incassare" | "scaduti";

const DAY = 86_400_000;

/** Data ISO a N giorni da oggi (negativo = passato). */
export function isoFromToday(today: Date, offsetDays: number): string {
  return new Date(today.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
}

/** Giorni che separano una data ISO da oggi: negativo se già passata. */
export function daysFromToday(iso: string, today: Date): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / DAY);
}

export function documentStatus(doc: CustomerDocument, today: Date): DocumentStatus {
  if (doc.paid) return "pagato";
  if (doc.dueDate && daysFromToday(doc.dueDate, today) < 0) return "scaduto";
  return "da_incassare";
}

/** Somma dei documenti non pagati: è il saldo del cliente. */
export function openTotal(documents: CustomerDocument[], today: Date): number {
  return documents.filter((d) => !d.paid).reduce((sum, d) => sum + d.amount, 0);
}

/** Somma dei documenti non pagati e oltre la scadenza. */
export function overdueTotal(documents: CustomerDocument[], today: Date): number {
  return documents
    .filter((d) => documentStatus(d, today) === "scaduto")
    .reduce((sum, d) => sum + d.amount, 0);
}

export function hasOverdue(documents: CustomerDocument[], today: Date): boolean {
  return documents.some((d) => documentStatus(d, today) === "scaduto");
}

/**
 * Un incasso copre i documenti aperti dal più vecchio, per intero:
 * se la cifra non arriva a coprire il successivo si ferma e l'avanzo resta.
 */
export function paymentPlan(
  documents: CustomerDocument[],
  amount: number,
  today: Date,
): { coveredIds: string[]; residual: number } {
  const open = documents
    .filter((d) => !d.paid)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const coveredIds: string[] = [];
  let residual = amount;
  for (const doc of open) {
    if (residual + 0.005 < doc.amount) break;
    residual = Math.round((residual - doc.amount) * 100) / 100;
    coveredIds.push(doc.id);
  }
  void today;
  return { coveredIds, residual };
}

/** Rende pagati i documenti indicati. */
export function markPaid(documents: CustomerDocument[], ids: string[]): CustomerDocument[] {
  const set = new Set(ids);
  return documents.map((d) => (set.has(d.id) ? { ...d, paid: true } : d));
}

/** Clienti che passano il filtro e la ricerca sul nome, la città o un numero. */
export function filterCustomers(
  customers: CustomerBalance[],
  filter: BalanceFilter,
  query: string,
  today: Date,
): CustomerBalance[] {
  const needle = query.trim().toLowerCase();
  return customers.filter((c) => {
    if (filter === "da_incassare" && openTotal(c.documents, today) <= 0) return false;
    if (filter === "scaduti" && !hasOverdue(c.documents, today)) return false;
    if (!needle) return true;
    return (
      c.name.toLowerCase().includes(needle) ||
      c.city.toLowerCase().includes(needle) ||
      c.documents.some((d) => `${d.kind} ${d.number}`.toLowerCase().includes(needle))
    );
  });
}

export const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export const italianDate = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Date leggibili a partire da una data ISO. */
export function prettyDate(iso: string): string {
  return italianDate.format(new Date(`${iso}T00:00:00Z`));
}

/** Aziende inventate: nessuna corrispondenza con clienti reali. */
export function createDemoCustomers(today: Date): CustomerBalance[] {
  return [
    {
      id: "c1",
      name: "Fruttiera Aurora",
      city: "Roma",
      documents: [
        { id: "d1", kind: "Fattura", number: "PA 12", date: isoFromToday(today, -42), dueDate: isoFromToday(today, -12), amount: 840.5, paid: false },
        { id: "d2", kind: "DDT", number: "208", date: isoFromToday(today, -6), dueDate: isoFromToday(today, 8), amount: 210.0, paid: false },
        { id: "d3", kind: "Fattura", number: "PA 9", date: isoFromToday(today, -70), dueDate: isoFromToday(today, -40), amount: 320.0, paid: true },
      ],
    },
    {
      id: "c2",
      name: "Ortofrutta Belvedere",
      city: "Frascati",
      documents: [
        { id: "d4", kind: "Fattura", number: "PA 14", date: isoFromToday(today, -20), dueDate: isoFromToday(today, 10), amount: 512.4, paid: false },
        { id: "d5", kind: "DDT", number: "211", date: isoFromToday(today, -2), dueDate: null, amount: 96.0, paid: false },
      ],
    },
    {
      id: "c3",
      name: "Mercato Centrale Pigneto",
      city: "Roma",
      documents: [
        { id: "d6", kind: "Fattura", number: "PA 11", date: isoFromToday(today, -55), dueDate: isoFromToday(today, -25), amount: 1275.0, paid: false },
        { id: "d7", kind: "DDT", number: "199", date: isoFromToday(today, -30), dueDate: isoFromToday(today, -5), amount: 430.75, paid: false },
      ],
    },
    {
      id: "c4",
      name: "Verdura del Corso",
      city: "Tivoli",
      documents: [
        { id: "d8", kind: "Fattura", number: "PA 13", date: isoFromToday(today, -15), dueDate: isoFromToday(today, 15), amount: 188.9, paid: false },
      ],
    },
    {
      id: "c5",
      name: "Alimentari Sant'Anna",
      city: "Roma",
      documents: [
        { id: "d9", kind: "Fattura", number: "PA 8", date: isoFromToday(today, -90), dueDate: isoFromToday(today, -60), amount: 640.0, paid: true },
      ],
    },
  ];
}
