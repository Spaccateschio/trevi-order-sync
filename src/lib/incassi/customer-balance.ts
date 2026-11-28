import { z } from "zod";

/** Contratto atteso dall'indirizzo di sola lettura di Trevi Incassi (per codice cliente Danea). */
export const incassiBalanceSchema = z.object({
  saldo: z.number(),
  scaduto: z.number().default(0),
  documenti: z.array(z.object({
    numero: z.string(), data: z.string().nullable().optional(), scadenza: z.string().nullable().optional(),
    importo: z.number(), stato: z.string().optional(),
  })).default([]),
});
export type IncassiBalance = z.infer<typeof incassiBalanceSchema>;
export type CustomerBalanceResult = { available: false } | { available: true; saldo: number; scaduto: number; documenti: IncassiBalance["documenti"] };

/** Somma i saldi di più codici cliente (stesso cliente con più codici Danea). */
export function mergeBalances(list: IncassiBalance[]): CustomerBalanceResult {
  if (list.length === 0) return { available: false };
  const c = (n: number) => Math.round(n * 100);
  return {
    available: true,
    saldo: list.reduce((s, b) => s + c(b.saldo), 0) / 100,
    scaduto: list.reduce((s, b) => s + c(b.scaduto), 0) / 100,
    documenti: list.flatMap((b) => b.documenti),
  };
}
