import { createFileRoute } from "@tanstack/react-router";

const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
const REALM = 'Basic realm="Trevi Fruit Danea"';

function plain(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function unauthorized(body: string) {
  return new Response(body, {
    status: 401,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "www-authenticate": REALM,
    },
  });
}

/**
 * Indirizzo pubblico STABILE per la ricezione prodotti da Danea Easyfatt.
 * Uguale per tutte le aziende: nessun token, nessun company_id nell'URL.
 * L'azienda viene ricavata dalla postazione autenticata con HTTP Basic.
 */
export const Route = createFileRoute("/api/public/danea/products")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { authenticateStation, parseBasicAuth, readDaneaXml } = await import(
            "@/lib/danea-auth.server"
          );
          const { importDaneaCatalog } = await import("@/lib/danea-import.server");

          const credentials = parseBasicAuth(request.headers.get("authorization"));
          const remoteHint =
            request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");

          const auth = await authenticateStation(credentials, "prodotti", remoteHint);
          if (!auth.ok) {
            return unauthorized(
              "Autenticazione non riuscita: verificare utente e password della postazione Danea in Trevi Fruit",
            );
          }

          const xml = await readDaneaXml(request);
          const bytes = new TextEncoder().encode(xml).byteLength;
          if (!bytes) return plain("Trasmissione vuota", 400);
          if (bytes > MAX_PAYLOAD_BYTES) return plain("File troppo grande", 413);

          const result = await importDaneaCatalog(
            { id: auth.station.id, company_id: auth.station.company_id },
            xml,
          );

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
