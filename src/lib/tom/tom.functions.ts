import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseCardKey } from "@/lib/inventory-cards";
import { matchAllowedUnit, parseItalianQuantity } from "./italian-quantity";
import { parseGuidedStart, parseQuickCommand, type QuickCommand } from "./tom-commands";
import { rankProducts } from "./product-match";

/**
 * Tom (assistente vocale). Abilitazione per azienda verificata nel database; scritture solo
 * nel registro Tom via funzioni service_role dopo la verifica dell'utente. Tom non scrive mai
 * conteggi o bozze: restituisce un comando che il browser applica con i percorsi manuali esistenti.
 */

export const TOM_MAX_PHRASES_PER_SESSION = 150;
export const TOM_MAX_SESSIONS_PER_DAY = 25;
const MAX_AUDIO_BYTES = 2_000_000;

const LIMIT_MESSAGES = {
  TOM_LIMITE_FRASI: "Ho raggiunto il limite di frasi per questa sessione. Mi fermo.",
  TOM_LIMITE_SESSIONI: "Limite giornaliero di sessioni Tom raggiunto per l'azienda. Riprova domani.",
  TOM_NON_ABILITATO: "Tom non è attivo per questa azienda.",
  TOM_SESSIONE_NON_VALIDA: "Sessione Tom non valida: riaprila.",
  TOM_INVENTARIO_NON_APERTO: "Tom funziona solo con un inventario aperto.",
} as const;

function friendly(message: string) {
  const code = (Object.keys(LIMIT_MESSAGES) as (keyof typeof LIMIT_MESSAGES)[]).find((key) => message.includes(key));
  return code ? LIMIT_MESSAGES[code] : message;
}

export const getTomAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // has_company_feature verifica anche l'appartenenza dell'utente (auth.uid()).
    const { data: enabled, error } = await (context.supabase.rpc as any)("has_company_feature", {
      _company_id: data.companyId,
      _feature_key: "assistente_vocale",
    });
    if (error) return { enabled: false };
    return { enabled: Boolean(enabled) };
  });

async function inventoryCompany(context: { supabase: any }, inventorySessionId: string) {
  const { data, error } = await context.supabase
    .from("inventory_sessions")
    .select("id, company_id, status")
    .eq("id", inventorySessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== "in_corso") throw new Error(LIMIT_MESSAGES.TOM_INVENTARIO_NON_APERTO);
  return data.company_id as string;
}

export const startTomInventorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ inventorySessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const companyId = await inventoryCompany(context, data.inventorySessionId);
    const { data: enabled } = await (context.supabase.rpc as any)("has_company_feature", { _company_id: companyId, _feature_key: "assistente_vocale" });
    if (!enabled) throw new Error(LIMIT_MESSAGES.TOM_NON_ABILITATO);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await (supabaseAdmin.rpc as any)("tom_start_session", {
      _user_id: context.userId,
      _company_id: companyId,
      _page: "inventario",
      _inventory_session_id: data.inventorySessionId,
      _max_daily: TOM_MAX_SESSIONS_PER_DAY,
    });
    if (error) throw new Error(friendly(error.message));
    return { tomSessionId: id as string };
  });

type CardInfo = { key: string; productId: string; name: string; supplier: string | null; location: string; units: { id: string; code: string }[] };

export type TomPhraseResult =
  | { kind: "quick"; command: QuickCommand }
  | { kind: "set"; cardKey: string; quantity: number; unitId: string | null; unitCode: string | null; label: string }
  | { kind: "ask_unit"; cardKey: string; quantity: number; label: string; options: string[] }
  | { kind: "ask"; question: string; cardKey: string | null }
  | { kind: "query"; cardKey: string; label: string }
  | { kind: "start_guided"; zone: string | null }
  | { kind: "none" };

const phraseInput = z.object({
  tomSessionId: z.string().uuid(),
  inventorySessionId: z.string().uuid(),
  audioBase64: z.string().min(10).max(Math.ceil(MAX_AUDIO_BYTES * 1.4)),
  mime: z.string().max(80),
  cardKeys: z.array(z.string().max(120)).max(500),
  guidedCardKey: z.string().max(120).nullable(),
  pending: z.object({ cardKey: z.string().max(120), quantity: z.number().min(0).max(100000) }).nullable(),
});

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadCards(context: { supabase: any }, companyId: string, keys: string[]): Promise<CardInfo[]> {
  const parsed = keys.map((key) => ({ key, card: parseCardKey(key) })).filter((entry) => entry.card);
  if (!parsed.length) return [];
  const productIds = [...new Set(parsed.map((entry) => entry.card!.productId))];
  const locationIds = [...new Set(parsed.map((entry) => entry.card!.locationId))];
  const linkIds = [...new Set(parsed.map((entry) => entry.card!.linkId).filter(Boolean))] as string[];
  const [products, locations, links, configured, companyUnits] = await Promise.all([
    context.supabase.from("products").select("id, code, description").eq("company_id", companyId).in("id", productIds),
    context.supabase.from("inventory_locations").select("id, name").eq("company_id", companyId).in("id", locationIds),
    linkIds.length
      ? context.supabase.from("product_supplier_links").select("id, supplier_records(legal_name)").eq("company_id", companyId).in("id", linkIds)
      : Promise.resolve({ data: [], error: null }),
    context.supabase.from("product_inventory_units").select("product_id, unit_id, units_of_measure(code)").eq("company_id", companyId).in("product_id", productIds).order("created_at"),
    context.supabase.from("units_of_measure").select("id, code").eq("company_id", companyId).eq("status", "attivo"),
  ]);
  for (const result of [products, locations, links, configured, companyUnits]) if (result.error) throw new Error(result.error.message);
  const productMap = new Map<string, { code: string; description: string | null }>((products.data ?? []).map((p: any) => [p.id, p]));
  const locationMap = new Map<string, string>((locations.data ?? []).map((l: any) => [l.id, l.name]));
  const linkMap = new Map<string, string>((links.data ?? []).map((l: any) => [l.id, l.supplier_records?.legal_name ?? "Fornitore"]));
  const unitsByProduct = new Map<string, { id: string; code: string }[]>();
  for (const row of configured.data ?? []) {
    const list = unitsByProduct.get(row.product_id) ?? [];
    list.push({ id: row.unit_id, code: row.units_of_measure?.code ?? "" });
    unitsByProduct.set(row.product_id, list);
  }
  const cards: CardInfo[] = [];
  for (const { key, card } of parsed) {
    const product = productMap.get(card!.productId);
    const location = locationMap.get(card!.locationId);
    if (!product || !location) continue; // card non dell'azienda: ignorata
    if (card!.linkId && !linkMap.has(card!.linkId)) continue;
    const ownUnits = unitsByProduct.get(card!.productId) ?? [];
    // Stesse U.M. ammesse del menu manuale della card: abituali del prodotto + U.M. aziendali attive.
    const units = [...ownUnits, ...(companyUnits.data ?? []).filter((u: any) => !ownUnits.some((o) => o.id === u.id))];
    cards.push({
      key,
      productId: card!.productId,
      name: (product.description?.trim() || product.code).toUpperCase(),
      supplier: card!.linkId ? linkMap.get(card!.linkId)! : null,
      location,
      units,
    });
  }
  return cards;
}

function cardLabel(card: CardInfo, sameProductCount: number) {
  return sameProductCount > 1 ? `${card.name} (${card.supplier ?? "senza fornitore"}, ${card.location})` : card.name;
}

function resolveSet(card: CardInfo, label: string, quantity: number, unitWord: string | null): TomPhraseResult {
  if (!unitWord) return { kind: "set", cardKey: card.key, quantity, unitId: null, unitCode: null, label };
  const unit = matchAllowedUnit(unitWord, card.units);
  if (!unit) {
    const own = card.units.slice(0, 3).map((u) => u.code);
    return { kind: "ask_unit", cardKey: card.key, quantity, label, options: own };
  }
  return { kind: "set", cardKey: card.key, quantity, unitId: unit.id, unitCode: unit.code, label };
}

function outcomeOf(result: TomPhraseResult) {
  if (result.kind === "set") return "applicato";
  if (result.kind === "ask" || result.kind === "ask_unit") return "domanda";
  if (result.kind === "quick") {
    if (result.command.kind === "correct") return "corretto";
    if (result.command.kind === "undo") return "annullato";
    if (result.command.kind === "quantity") return "applicato";
  }
  return "comando";
}

export const processTomInventoryPhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => phraseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // 1) Prenota la frase (tetto per sessione) prima di spendere crediti.
    const { data: companyId, error: reserveError } = await (supabaseAdmin.rpc as any)("tom_reserve_phrase", {
      _user_id: context.userId,
      _tom_session_id: data.tomSessionId,
      _max_phrases: TOM_MAX_PHRASES_PER_SESSION,
    });
    if (reserveError) throw new Error(friendly(reserveError.message));
    if ((await inventoryCompany(context, data.inventorySessionId)) !== companyId) throw new Error(LIMIT_MESSAGES.TOM_SESSIONE_NON_VALIDA);

    const log = async (transcript: string, command: unknown, outcome: string, cardKey: string | null) => {
      await (supabaseAdmin.rpc as any)("tom_log_command", {
        _user_id: context.userId, _tom_session_id: data.tomSessionId, _transcript: transcript,
        _command: command, _outcome: outcome, _card_key: cardKey,
      });
    };

    const { tomTranscribe, tomInterpret, TomServiceError } = await import("./tom-ai.server");
    let transcript = "";
    try {
      const audio = decodeBase64(data.audioBase64);
      if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new Error("Frase troppo lunga o vuota");
      const cards = await loadCards(context, companyId, data.cardKeys);
      const guided = data.guidedCardKey ? cards.find((card) => card.key === data.guidedCardKey) ?? null : null;
      const keywords = [...new Set([guided?.name, ...cards.map((card) => card.name), ...cards.map((card) => card.location)].filter(Boolean) as string[])];
      transcript = await tomTranscribe(audio, data.mime, keywords);
      if (!transcript) {
        const result: TomPhraseResult = { kind: "none" };
        return { transcript, result };
      }
      const countByProduct = new Map<string, number>();
      for (const card of cards) countByProduct.set(card.productId, (countByProduct.get(card.productId) ?? 0) + 1);
      const label = (card: CardInfo) => cardLabel(card, countByProduct.get(card.productId) ?? 1);

      let result: TomPhraseResult | null = null;
      // Risposta a «casse o kg?»: solo l'unità, la quantità era già capita.
      const pendingCard = data.pending ? cards.find((card) => card.key === data.pending!.cardKey) : null;
      const spoken = parseItalianQuantity(transcript);
      if (pendingCard && spoken.unitWord && (spoken.quantity === null || spoken.quantity === data.pending!.quantity)) {
        result = resolveSet(pendingCard, label(pendingCard), data.pending!.quantity, spoken.unitWord);
      }
      if (!result) {
        const quick = parseQuickCommand(transcript, Boolean(guided));
        if (quick?.kind === "quantity" && guided) result = resolveSet(guided, label(guided), quick.quantity, quick.unitWord);
        else if (quick) result = { kind: "quick", command: quick };
      }
      if (!result) {
        const start = parseGuidedStart(transcript);
        if (start) result = { kind: "start_guided", zone: start.zone };
      }
      if (!result) {
        // 2) Interpretazione: candidati cercati lato server tra le card visibili dell'azienda.
        const ranked = rankProducts(transcript, cards.map((card) => ({ ...card, name: label(card) })), 8);
        const candidates = ranked.map((entry) => entry.item);
        const ai = await tomInterpret(transcript, candidates.map((card) => card.name));
        const chosen = ai.candidate_index >= 0 ? candidates[ai.candidate_index] ?? null : null;
        const original = chosen ? cards.find((card) => card.key === chosen.key) ?? null : null;
        if (ai.action === "start_guided") result = { kind: "start_guided", zone: ai.zone_text };
        else if (!original || ai.confidence === "bassa") {
          result = { kind: "ask", question: ai.question?.slice(0, 160) || (candidates.length ? `Non ho capito il prodotto. Intendi ${candidates.slice(0, 2).map((c) => c.name).join(" o ")}?` : "Non trovo il prodotto tra le card visibili. Ripeti o togli i filtri."), cardKey: null };
        } else if (ai.action === "query_stock") result = { kind: "query", cardKey: original.key, label: label(original) };
        else if (ai.action === "set_quantity") {
          // Il numero lo legge il server dalle parole dette, mai il modello.
          const quantity = parseItalianQuantity(ai.quantity_text ?? "");
          const unitWord = parseItalianQuantity(ai.unit_word ?? "").unitWord ?? quantity.unitWord;
          if (quantity.quantity === null) result = { kind: "ask", question: `${label(original)}: quante?`, cardKey: original.key };
          else result = resolveSet(original, label(original), quantity.quantity, unitWord);
        } else result = { kind: "ask", question: "Non ho capito. Ripeti, per favore.", cardKey: null };
      }
      const cardKey = "cardKey" in result ? result.cardKey : (data.guidedCardKey ?? null);
      await log(transcript, result, outcomeOf(result), cardKey);
      return { transcript, result };
    } catch (error) {
      const message = error instanceof Error ? friendly(error.message) : "Errore";
      await log(transcript, { error: message }, "errore", data.guidedCardKey).catch(() => undefined);
      if (error instanceof TomServiceError && (error.status === 402 || error.status === 403 || error.status === 401)) throw new Error(`STOP:${message}`);
      throw new Error(message);
    }
  });

/** Esiti decisi nel browser (conferma tutto, sì/no, card bloccata) per misurare la precisione. */
export const logTomEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    tomSessionId: z.string().uuid(),
    outcome: z.enum(["applicato", "annullato", "corretto", "errore", "comando"]),
    note: z.string().max(300),
    cardKey: z.string().max(120).nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.rpc as any)("tom_log_command", {
      _user_id: context.userId, _tom_session_id: data.tomSessionId, _transcript: null,
      _command: { evento: data.note }, _outcome: data.outcome, _card_key: data.cardKey,
    });
    if (error) throw new Error(friendly(error.message));
    return { ok: true };
  });
