/**
 * Precompilazione consegna per fornitore in «Genera ordini».
 * Priorità per singolo campo: valore della Lista → ultimo ordine del fornitore (solo orari e luogo)
 * → preferenze aziendali → indirizzo principale di consegna (solo luogo) → vuoto.
 * La data non viene mai copiata dallo storico né proposta nel passato.
 * Luogo: se corrisponde a un indirizzo aziendale attivo lo seleziona (addressId), altrimenti «Altro indirizzo…» col testo.
 */
export type DeliveryValues = { date: string; from: string; to: string; address: string; addressId: string | null };
type Source = { date?: string | null; from?: string | null; to?: string | null; address?: string | null; addressId?: string | null };
export type AddressChoice = { id: string; text: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (v: string | null | undefined) => {
  const t = (v ?? "").slice(0, 5);
  return TIME.test(t) ? t : "";
};
const text = (v: string | null | undefined) => (v ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** Coppia oraria valida: entrambi validi e «dalle» < «alle», oppure uno solo valido. */
function pair(src: Source | null | undefined): { from: string; to: string } {
  const from = time(src?.from);
  const to = time(src?.to);
  if (from && to && from >= to) return { from: "", to: "" };
  return { from, to };
}

/** Luogo di un livello: indirizzo attivo selezionato, oppure testo libero; null se il livello non ha luogo. */
function place(src: Source | null | undefined, addresses: AddressChoice[]): { address: string; addressId: string | null } | null {
  const byId = src?.addressId ? addresses.find((a) => a.id === src.addressId) : undefined;
  if (byId) return { address: byId.text, addressId: byId.id };
  const t = text(src?.address);
  if (!t) return null;
  const byText = addresses.find((a) => norm(a.text) === norm(t));
  return byText ? { address: byText.text, addressId: byText.id } : { address: t, addressId: null };
}

export function deliveryDefaults(input: {
  today: string;
  list: Source | null;
  lastOrder: Source | null;
  company: Source | null;
  /** Indirizzi attivi dell'azienda che ordina. */
  addresses?: AddressChoice[];
  /** Indirizzo principale di consegna, ultimo livello per il luogo. */
  mainDeliveryAddressId?: string | null;
}): DeliveryValues {
  const { today } = input;
  const addresses = input.addresses ?? [];
  const validDate = (d: string | null | undefined) => (d && DATE.test(d) && d >= today ? d : "");
  const levels = [pair(input.list), pair(input.lastOrder), pair(input.company)];
  const from = levels.find((l) => l.from)?.from ?? "";
  // «Alle» deve restare coerente con «Dalle» se presi da livelli diversi.
  const to = levels.find((l) => l.to && (!from || l.to > from))?.to ?? "";
  const loc =
    place(input.list, addresses) ??
    place(input.lastOrder, addresses) ??
    place(input.company, addresses) ??
    place({ addressId: input.mainDeliveryAddressId }, addresses) ?? { address: "", addressId: null };
  return {
    date: validDate(input.list?.date) || validDate(input.company?.date),
    from,
    to,
    ...loc,
  };
}
