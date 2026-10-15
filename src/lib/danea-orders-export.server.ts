/**
 * Scarico ordini B2B per Danea: selezione → validazione → XML → registrazione.
 * Lo scarico viene registrato SOLO dopo che l'XML è stato preparato.
 * Limite tecnico: una risposta HTTP riuscita non prova che Danea abbia
 * importato i documenti; per questo lo stato è «Scaricato da Danea».
 */
import { buildDaneaOrdersXml, type DaneaOrderCandidate } from "@/lib/danea-orders-xml";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function exportDaneaOrders(station: { id: string; company_id: string }): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("legal_name")
    .eq("id", station.company_id)
    .maybeSingle();

  // Due tentativi: se un'altra richiesta contemporanea ha già preso gli
  // ordini, si rilegge l'elenco aggiornato (nessun ordine esce due volte).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseAdmin.rpc("danea_orders_export_candidates", {
      _station_id: station.id,
    });
    if (error) throw new Error(error.message);
    const candidates = (data ?? []) as unknown as DaneaOrderCandidate[];
    const built = buildDaneaOrdersXml(company?.legal_name ?? null, candidates);

    if (!built.exportedIds.length) {
      await supabaseAdmin.rpc("danea_log_order_export", {
        _station_id: station.id,
        _outcome: "nessun_ordine",
        _excluded: built.excluded,
        _error: null as unknown as string,
      });
      return built.xml;
    }

    const bytes = new TextEncoder().encode(built.xml).byteLength;
    const { error: markError } = await supabaseAdmin.rpc("danea_mark_orders_exported", {
      _station_id: station.id,
      _order_ids: built.exportedIds,
      _excluded: built.excluded,
      _payload_bytes: bytes,
      _payload_hash: await sha256Hex(built.xml),
    });
    if (!markError) return built.xml;
    if (!markError.message.includes("DANEA_CONCURRENT")) throw new Error(markError.message);
  }
  throw new Error("Scarico già in corso da un'altra postazione: riprovare tra qualche secondo");
}

export async function logDaneaOrderFailure(stationId: string, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("danea_log_order_export", {
    _station_id: stationId,
    _outcome: "fallito",
    _excluded: [],
    _error: message,
  });
}
