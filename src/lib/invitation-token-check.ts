/**
 * Verifica server-side del codice dell'invito commerciale: il database
 * conserva solo l'impronta sha256 (esadecimale) del codice. Un codice
 * arrivato dal browser vale solo se la sua impronta coincide.
 */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Confronto a tempo costante tra due stringhe esadecimali. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function tokenMatchesHash(token: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  return constantTimeEqual(await sha256Hex(token), storedHash.toLowerCase());
}

export type InvitationSendCheck =
  | { ok: true }
  | { ok: false; reason: "not_admin" | "not_pending" | "expired" | "invalid_token" };

/** Regole che il server applica prima di spedire l'email dell'invito. */
export async function checkInvitationSend(input: {
  isAdmin: boolean;
  status: string;
  expiresAt: string;
  tokenHash: string | null;
  token: string;
  now?: Date;
}): Promise<InvitationSendCheck> {
  if (!input.isAdmin) return { ok: false, reason: "not_admin" };
  if (input.status !== "in_attesa") return { ok: false, reason: "not_pending" };
  const now = input.now ?? new Date();
  if (new Date(input.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (!(await tokenMatchesHash(input.token, input.tokenHash))) return { ok: false, reason: "invalid_token" };
  return { ok: true };
}
