import { z } from "zod";

/**
 * Numeri telefonici internazionali: accettiamo cifre, spazi, punti, trattini e
 * parentesi in ingresso e memorizziamo il numero normalizzato (prefisso + cifre).
 * Nessuna limitazione ai soli numeri italiani.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("00")) return `+${digits.replace(/^0+/, "")}`;
  return hasPlus ? `+${digits}` : digits;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, { message: "Il cellulare è obbligatorio" })
  .max(24, { message: "Il numero è troppo lungo" })
  .refine((value) => /^[+0-9().\-\s]+$/.test(value), {
    message: "Il numero può contenere solo cifre, spazi e il prefisso internazionale",
  })
  .transform(normalizePhone)
  .refine((value) => /^\+?[1-9][0-9]{6,17}$/.test(value), {
    message: "Inserisci un numero di cellulare valido (es. +39 333 1234567)",
  });

/** Restituisce il numero normalizzato o il messaggio di errore. */
export function validatePhone(input: string): { value: string } | { error: string } {
  const parsed = phoneSchema.safeParse(input);
  if (parsed.success) return { value: parsed.data };
  return { error: parsed.error.issues[0]?.message ?? "Numero di cellulare non valido" };
}
