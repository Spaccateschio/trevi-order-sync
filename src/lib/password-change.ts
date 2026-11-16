import { z } from "zod";

/**
 * Regola unica per la nuova password inserita dentro l'app (pagina Account).
 * La verifica sul database (password già usate o trapelate) resta in capo al
 * backend: qui si controlla solo forma e conferma.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function validateNewPassword(input: {
  currentPassword: string;
  password: string;
  confirm: string;
}): { value: string } | { error: string } {
  const parsed = z
    .object({
      currentPassword: z.string().min(1, { message: "Inserisci la password attuale" }),
      password: z.string().min(PASSWORD_MIN_LENGTH, {
        message: `La nuova password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri`,
      }),
      confirm: z.string(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Password non valida" };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { error: "Le due password non coincidono" };
  }
  return { value: parsed.data.password };
}

/** Messaggio leggibile per gli errori del backend sul cambio password. */
export function passwordChangeErrorMessage(message: string): string {
  if (/password/i.test(message) && /weak|leaked|breached|compromised/i.test(message)) {
    return "Questa password è troppo debole o compare in elenchi di password trapelate: scegliane un'altra";
  }
  if (/session/i.test(message)) {
    return "La sessione non è più valida: riaccendi e riprova";
  }
  return message;
}
