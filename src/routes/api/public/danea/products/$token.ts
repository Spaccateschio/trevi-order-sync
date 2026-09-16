import { createFileRoute } from "@tanstack/react-router";

const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

function plain(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readXml(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) return await file.text();
    if (typeof file === "string" && file.trim().length) return file;
    for (const value of form.values()) {
      if (value instanceof File) return await value.text();
      if (typeof value === "string" && value.includes("<EasyfattProducts")) return value;
    }
    throw new Error("Nessun file XML nella trasmissione");
  }
  return await request.text();
}

function checkBasicAuth(
  request: Request,
  login: string | null,
  passwordHashPresent: boolean,
): string | null {
  if (!login && !passwordHashPresent) return null;
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("basic ")) {
    return "Autenticazione richiesta: inserire Login e Password nelle impostazioni Easyfatt";
  }
  return null;
}

export const Route = createFileRoute("/api/public/danea/products/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { sha256Hex, importDaneaCatalog } = await import("@/lib/danea-import.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const token = params.token?.trim();
          if (!token) return plain("Collegamento non valido", 401);

          const tokenHash = await sha256Hex(token);
          const { data: connection } = await supabaseAdmin
            .from("danea_connections")
            .select("id, company_id, status, basic_login, basic_password_hash")
            .eq("token_hash", tokenHash)
            .maybeSingle();

          if (!connection) return plain("Collegamento Danea non riconosciuto", 401);
          if (connection.status !== "attivo") return plain("Collegamento Danea revocato", 403);

          const authError = checkBasicAuth(
            request,
            connection.basic_login,
            Boolean(connection.basic_password_hash),
          );
          if (authError) return plain(authError, 401);

          if (connection.basic_login || connection.basic_password_hash) {
            const header = request.headers.get("authorization") ?? "";
            const decoded = atob(header.slice(6).trim());
            const separator = decoded.indexOf(":");
            const login = decoded.slice(0, separator);
            const password = decoded.slice(separator + 1);
            const passwordHash = await sha256Hex(password);
            if (
              (connection.basic_login && login !== connection.basic_login) ||
              (connection.basic_password_hash && passwordHash !== connection.basic_password_hash)
            ) {
              return plain("Login o password del collegamento Danea non corretti", 401);
            }
          }

          const xml = await readXml(request);
          const bytes = new TextEncoder().encode(xml).byteLength;
          if (!bytes) return plain("Trasmissione vuota", 400);
          if (bytes > MAX_PAYLOAD_BYTES) return plain("File troppo grande", 413);

          const result = await importDaneaCatalog(connection, xml);

          // Easyfatt considera positiva esclusivamente la risposta "OK".
          if (result.skipped > 0) {
            return plain(
              `Ricezione completata con ${result.skipped} segnalazioni (${result.received} prodotti). Controlla la diagnostica in Trevi Fruit.`,
            );
          }
          return plain("OK");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Errore imprevisto";
          console.error("[Danea] ricezione catalogo:", error);
          return plain(`Errore Trevi Fruit: ${message}`, 200);
        }
      },
    },
  },
});
