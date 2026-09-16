/**
 * Autenticazione delle postazioni Danea.
 * L'indirizzo pubblico è fisso: l'identificazione avviene solo con utente e
 * password (HTTP Basic) e l'azienda viene ricavata dalla postazione lato server.
 */

/**
 * Numero di iterazioni PBKDF2: il runtime serverless accetta al massimo 100.000.
 * Questa costante è l'unica usata sia in creazione/rigenerazione password sia
 * nella verifica HTTP Basic, così i parametri restano sempre identici.
 */
const PBKDF2_ITERATIONS = 100_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

/** Password leggibile ma robusta: 24 caratteri senza simboli ambigui. */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

export function slugForUsername(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  return slug.length >= 3 ? slug : "trevi";
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/** Confronto a tempo costante fra due impronte esadecimali. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type BasicCredentials = { username: string; password: string };

export function parseBasicAuth(header: string | null): BasicCredentials | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return null;
  let decoded: string;
  try {
    decoded = atob(encoded.trim());
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  const username = decoded.slice(0, separator).trim();
  const password = decoded.slice(separator + 1);
  if (!username) return null;
  return { username, password };
}

export type StationRow = {
  id: string;
  company_id: string;
  status: "attivo" | "revocato";
  password_hash: string;
  password_salt: string;
  allowed_uses: string[];
};

export type AuthOutcome =
  | { ok: true; station: StationRow }
  | { ok: false; reason: string; station: StationRow | null };

/**
 * Verifica le credenziali di una postazione.
 * L'esito viene registrato sulla postazione quando l'utente esiste, altrimenti
 * in un registro separato di accessi non riusciti (senza mai la password).
 */
export async function authenticateStation(
  credentials: BasicCredentials | null,
  use: string,
  remoteHint: string | null,
): Promise<AuthOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const logFailure = async (reason: string, station: StationRow | null) => {
    if (station) {
      await supabaseAdmin
        .from("danea_stations")
        .update({ last_auth_at: new Date().toISOString(), last_auth_outcome: reason })
        .eq("id", station.id);
    } else {
      await supabaseAdmin.from("danea_auth_failures").insert({
        attempted_username: credentials?.username ?? null,
        reason,
        remote_hint: remoteHint,
      });
    }
    return { ok: false as const, reason, station };
  };

  if (!credentials) return await logFailure("credenziali_assenti", null);

  const { data: station } = await supabaseAdmin
    .from("danea_stations")
    .select("id, company_id, status, password_hash, password_salt, allowed_uses")
    .eq("username", credentials.username)
    .maybeSingle();

  if (!station) return await logFailure("utente_inesistente", null);
  const row = station as StationRow;

  if (row.status !== "attivo") return await logFailure("postazione_revocata", row);
  if (!row.allowed_uses.includes(use)) return await logFailure("uso_non_consentito", row);

  const computed = await hashPassword(credentials.password, row.password_salt);
  if (!constantTimeEqual(computed, row.password_hash)) {
    return await logFailure("password_errata", row);
  }

  await supabaseAdmin
    .from("danea_stations")
    .update({ last_auth_at: new Date().toISOString(), last_auth_outcome: "ok" })
    .eq("id", row.id);

  return { ok: true, station: row };
}

/**
 * Danea può inviare l'XML in UTF-8 oppure in ISO-8859-1/Windows-1252:
 * l'encoding viene letto dalla dichiarazione iniziale, con ripiego automatico
 * se compaiono caratteri non decodificabili.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 200));
  const declared = /encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase() ?? null;

  const tryDecode = (label: string): string | null => {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      return null;
    }
  };

  if (declared && !declared.includes("utf-8") && !declared.includes("utf8")) {
    const decoded = tryDecode(declared) ?? tryDecode("windows-1252");
    if (decoded) return decoded;
  }

  const utf8 = tryDecode("utf-8") ?? "";
  // Il carattere di sostituzione indica byte non validi in UTF-8: riprovo in Windows-1252.
  if (utf8.includes("\uFFFD")) {
    const latin = tryDecode("windows-1252");
    if (latin) return latin;
  }
  return utf8;
}

/**
 * Estrae l'XML dalla richiesta senza dipendere dal nome del campo:
 * prima entry di tipo file, poi i campi `xml`/`file`, infine il corpo grezzo.
 */
export async function readDaneaXml(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();

    for (const value of form.values()) {
      if (value instanceof File) {
        return decodeXmlBytes(new Uint8Array(await value.arrayBuffer()));
      }
    }
    for (const name of ["xml", "file"]) {
      const value = form.get(name);
      if (typeof value === "string" && value.trim().length) return value;
    }
    for (const value of form.values()) {
      if (typeof value === "string" && value.includes("<EasyfattProducts")) return value;
    }
    throw new Error("Nessun file XML nella trasmissione");
  }

  return decodeXmlBytes(new Uint8Array(await request.arrayBuffer()));
}
