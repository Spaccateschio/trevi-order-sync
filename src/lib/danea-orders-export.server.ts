/**
 * Scarico ordini B2B per Danea: selezione → validazione → XML → registrazione.
 * Lo scarico viene registrato SOLO dopo che l'XML è stato preparato.
 * Limite tecnico: una risposta HTTP riuscita non prova che Danea abbia
 * importato i documenti; per questo lo stato è «Scaricato da Danea».
 */
import {
  buildDaneaOrdersXml,
  filterHasNumberRange,
  matchesDaneaFilter,
  type DaneaExportPrice,
  type DaneaOrderCandidate,
  type DaneaRequestFilter,
} from "@/lib/danea-orders-xml";
import { PRICE_NOT_UPDATED_WARNING, priceListNotUpdatedToday } from "@/lib/price-info";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type PriceInfoRow = { usual_update_time: string | null; last_price_update_at: string | null };

export function attachPrices(candidates: DaneaOrderCandidate[], lines: DaneaExportPrice[]) {
  const byItem = new Map(lines.map((l) => [l.item_id, l]));
  return candidates.map((o) => ({
    ...o,
    lines: o.lines.map((line) => ({ ...line, export_price: byItem.get(line.item_id) ?? null })),
  }));
}

export async function exportDaneaOrders(
  station: { id: string; company_id: string },
  filter: DaneaRequestFilter,
): Promise<string> {
  // Con un intervallo di numeri esplicito Danea può riscaricare ordini già
  // scaricati dalla stessa postazione (es. finestra chiusa senza importare):
  // è Danea a non reimportare lo stesso numero. Questi ordini non vengono
  // registrati una seconda volta e riusano i prezzi già registrati.
  const includeExported = filterHasNumberRange(filter);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: company }, { data: info }] = await Promise.all([
    supabaseAdmin.from("companies").select("legal_name").eq("id", station.company_id).maybeSingle(),
    supabaseAdmin
      .from("seller_price_info")
      .select("usual_update_time, last_price_update_at")
      .eq("company_id", station.company_id)
      .maybeSingle(),
  ]);
  const priceInfo = (info ?? null) as PriceInfoRow | null;
  const warnings = priceListNotUpdatedToday(priceInfo?.last_price_update_at, priceInfo?.usual_update_time)
    ? [PRICE_NOT_UPDATED_WARNING]
    : [];

  // Due tentativi: se un'altra richiesta contemporanea ha già preso gli
  // ordini, si rilegge l'elenco aggiornato (nessun ordine esce due volte).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseAdmin.rpc("danea_orders_export_candidates", {
      _station_id: station.id,
      _include_exported: includeExported,
    });
    if (error) throw new Error(error.message);
    const candidates = ((data ?? []) as unknown as DaneaOrderCandidate[]).filter((o) =>
      matchesDaneaFilter(o, filter),
    );
    // Validazione prima di qualsiasi registrazione: gli ordini con errori restano fuori.
    const check = buildDaneaOrdersXml(null, candidates);
    const valid = new Set(check.exportedIds);
    const reExportIds = candidates.filter((o) => o.already_exported && valid.has(o.order_id)).map((o) => o.order_id);
    const newIds = check.exportedIds.filter((id) => !reExportIds.includes(id));

    let stored: DaneaExportPrice[] = [];
    if (reExportIds.length) {
      const { data: s, error: e } = await supabaseAdmin.rpc("danea_export_stored_prices", {
        _station_id: station.id,
        _order_ids: reExportIds,
      });
      if (e) throw new Error(e.message);
      stored = (s ?? []) as unknown as DaneaExportPrice[];
    }

    if (!newIds.length) {
      const built = buildDaneaOrdersXml(company?.legal_name ?? null, attachPrices(candidates, stored));
      await supabaseAdmin.rpc("danea_log_order_export_warn", {
        _station_id: station.id,
        _outcome: "nessun_ordine",
        _excluded: built.excluded,
        _error: null as unknown as string,
        _warnings: warnings,
      });
      return built.xml;
    }

    // Prezzi del listino in vigore, calcolati e registrati con gli ordini in
    // un'unica operazione con blocco del listino (versione coerente).
    const { data: priced, error: markError } = await supabaseAdmin.rpc("danea_export_orders_priced", {
      _station_id: station.id,
      _order_ids: newIds,
      _excluded: check.excluded,
      _warnings: warnings,
    });
    if (markError) {
      if (markError.message.includes("DANEA_CONCURRENT")) continue;
      throw new Error(markError.message);
    }
    const result = priced as unknown as { export_id: string; lines: DaneaExportPrice[] };
    const built = buildDaneaOrdersXml(
      company?.legal_name ?? null,
      attachPrices(candidates, [...stored, ...result.lines]),
    );
    const bytes = new TextEncoder().encode(built.xml).byteLength;
    await supabaseAdmin.rpc("danea_set_export_payload", {
      _station_id: station.id,
      _export_id: result.export_id,
      _payload_bytes: bytes,
      _payload_hash: await sha256Hex(built.xml),
    });
    return built.xml;
  }
  throw new Error("Scarico già in corso da un'altra postazione: riprovare tra qualche secondo");
}

export async function logDaneaOrderFailure(stationId: string, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("danea_log_order_export_warn", {
    _station_id: stationId,
    _outcome: "fallito",
    _excluded: [],
    _error: message,
    _warnings: [],
  });
}
