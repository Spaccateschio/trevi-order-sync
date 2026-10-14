/**
 * Precompilazione consegna per fornitore in «Genera ordini».
 * Priorità per singolo campo: valore della Lista → ultimo ordine del fornitore (solo orari e luogo)
 * → preferenze aziendali → vuoto. La data non viene mai copiata dallo storico né proposta nel passato.
 */
export type DeliveryValues = { date: string; from: string; to: string; address: string };
type Partial4 = { date?: string | null; from?: string | null; to?: string | null; address?: string | null };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (v: string | null | undefined) => {
  const t = (v ?? "").slice(0, 5);
  return TIME.test(t) ? t : "";
};
const text = (v: string | null | undefined) => (v ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Coppia oraria valida: entrambi validi e «dalle» < «alle», oppure uno solo valido. */
function pair(src: Partial4 | null | undefined): { from: string; to: string } {
  const from = time(src?.from);
  const to = time(src?.to);
  if (from && to && from >= to) return { from: "", to: "" };
  return { from, to };
}

export function deliveryDefaults(input: {
  today: string;
  list: Partial4 | null;
  lastOrder: Partial4 | null;
  company: { date: string | null; from: string | null; to: string | null; address: string | null } | null;
}): DeliveryValues {
  const { today } = input;
  const validDate = (d: string | null | undefined) => (d && DATE.test(d) && d >= today ? d : "");
  const levels = [pair(input.list), pair(input.lastOrder), pair(input.company)];
  const from = levels.find((l) => l.from)?.from ?? "";
  // «Alle» deve restare coerente con «Dalle» se presi da livelli diversi.
  const to = levels.find((l) => l.to && (!from || l.to > from))?.to ?? "";
  return {
    date: validDate(input.list?.date) || validDate(input.company?.date),
    from,
    to,
    address: text(input.list?.address) || text(input.lastOrder?.address) || text(input.company?.address),
  };
}
