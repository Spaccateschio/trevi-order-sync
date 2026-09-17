/**
 * Il codice dell'invito è l'unica prova valida del collegamento B2B: l'email
 * serve solo a consegnarlo. Lo conserviamo per il tempo della registrazione,
 * così lo stesso link potrà in futuro arrivare anche via SMS o WhatsApp.
 */
const KEY = "trevi.invito.token";

export function rememberInviteToken(token: string) {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // Archiviazione non disponibile: il link resta comunque valido.
  }
}

export function readInviteToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetInviteToken() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // niente da fare
  }
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/invito/${token}`;
}
