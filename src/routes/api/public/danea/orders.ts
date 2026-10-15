import { createFileRoute } from "@tanstack/react-router";

const REALM = 'Basic realm="Trevi Fruit Danea"';

function text(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Indirizzo STABILE per «Strumenti → Scarica ordini da e-commerce» di Danea.
 * Nessun token o company_id nell'URL: l'azienda si ricava dalla postazione
 * autenticata in HTTP Basic, che deve avere l'uso «ordini».
 */
async function handle(request: Request): Promise<Response> {
  const { authenticateStation, parseBasicAuth } = await import("@/lib/danea-auth.server");
  const credentials = parseBasicAuth(request.headers.get("authorization"));
  const remoteHint =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");

  const auth = await authenticateStation(credentials, "ordini", remoteHint);
  if (!auth.ok) {
    return new Response(
      "Autenticazione non riuscita: verificare login e password della postazione ordini in Trevi Fruit",
      {
        status: 401,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "www-authenticate": REALM,
        },
      },
    );
  }

  const { exportDaneaOrders, logDaneaOrderFailure } = await import(
    "@/lib/danea-orders-export.server"
  );
  try {
    const xml = await exportDaneaOrders(auth.station);
    return new Response(xml, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore imprevisto";
    console.error("[Danea] scarico ordini:", error);
    await logDaneaOrderFailure(auth.station.id, message).catch(() => undefined);
    // Nessun ordine è stato segnato come scaricato: si può riprovare.
    return text(`Errore Trevi Fruit: ${message}`, 500);
  }
}

export const Route = createFileRoute("/api/public/danea/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
