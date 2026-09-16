import { parseDaneaProducts, type DaneaDocument, type DaneaIssue } from "./danea-xml";

/** La postazione autenticata: da qui deriva l'azienda, mai dal client. */
export type DaneaStationRow = {
  id: string;
  company_id: string;
};

/**
 * Origine dell'invio. Il motore di importazione è UNICO: cambia solo la porta
 * d'ingresso (postazione Danea via HTTP, oppure file caricato a mano da un
 * amministratore). In entrambi i casi l'azienda è ricavata sul server.
 */
export type DaneaImportOrigin =
  | { kind: "station"; station: DaneaStationRow }
  | { kind: "manual"; companyId: string; userId: string };

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ImportResult = {
  runId: string;
  mode: DaneaDocument["mode"];
  received: number;
  created: number;
  updated: number;
  unpublished: number;
  skipped: number;
};

/**
 * Riceve il catalogo Danea e lo applica in modo idempotente.
 * Identità: (company_id, danea_internal_id) come chiave principale,
 * (company_id, code) come chiave alternativa e unica disponibile nei DeletedProducts.
 */
export async function importDaneaCatalog(
  origin: DaneaImportOrigin,
  xml: string,
): Promise<ImportResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const station = origin.kind === "station" ? origin.station : null;
  const companyId = origin.kind === "station" ? origin.station.company_id : origin.companyId;

  const payloadHash = await sha256Hex(xml);
  const doc = parseDaneaProducts(xml);

  const { data: previous } = await supabaseAdmin
    .from("danea_sync_runs")
    .select("payload_hash")
    .eq("company_id", companyId)
    .eq("outcome", "completato")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: run, error: runError } = await supabaseAdmin
    .from("danea_sync_runs")
    .insert({
      company_id: companyId,
      station_id: station ? station.id : null,
      source: station ? ("postazione" as const) : ("manuale" as const),
      imported_by: origin.kind === "manual" ? origin.userId : null,
      mode: doc.mode,
      app_version: doc.appVersion,
      creator: doc.creator,
      warehouse: doc.warehouse,
      payload_bytes: new TextEncoder().encode(xml).byteLength,
      payload_hash: payloadHash,
      duplicate_payload: previous?.payload_hash === payloadHash,
    })
    .select("id")
    .single();

  if (runError || !run) throw new Error(`Impossibile registrare l'invio: ${runError?.message}`);
  const runId = run.id;
  const issues: DaneaIssue[] = [...doc.issues];

  try {
    // I dati rilevati appartengono alla postazione: l'import manuale non ne ha una.
    if (station) {
      await supabaseAdmin
        .from("danea_stations")
        .update({
          detected_app_version: doc.appVersion,
          detected_creator: doc.creator,
          detected_default_price: doc.defaultPrice,
          detected_warehouse: doc.warehouse,
          detected_image_folder: doc.imageFolder,
        })
        .eq("id", station.id);
    }

    await syncPriceListNames(supabaseAdmin, companyId, doc);

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("products")
      .select("id, code, danea_internal_id")
      .eq("company_id", companyId);
    if (existingError) throw new Error(existingError.message);

    const byInternalId = new Map<string, { id: string; code: string }>();
    const byCode = new Map<string, { id: string }>();
    for (const row of existingRows ?? []) {
      if (row.danea_internal_id) byInternalId.set(row.danea_internal_id, { id: row.id, code: row.code });
      byCode.set(row.code, { id: row.id });
    }

    let created = 0;
    let updated = 0;
    const now = new Date().toISOString();

    // Il codice può cambiare in Danea a InternalID invariato: allineo prima il codice,
    // così l'upsert successivo su (company_id, code) colpisce la stessa riga.
    for (const product of doc.products) {
      if (!product.internalId) continue;
      const match = byInternalId.get(product.internalId);
      if (!match || match.code === product.code) continue;
      if (byCode.has(product.code)) {
        issues.push({
          productCode: product.code,
          fieldName: "Code",
          reason: "Codice già usato da un altro prodotto: rinomina non applicata",
        });
        continue;
      }
      const { error } = await supabaseAdmin
        .from("products")
        .update({ code: product.code })
        .eq("id", match.id);
      if (error) {
        issues.push({ productCode: product.code, fieldName: "Code", reason: error.message });
        continue;
      }
      byCode.delete(match.code);
      byCode.set(product.code, { id: match.id });
      match.code = product.code;
    }

    const rows = doc.products.map((product) => {
      const existing =
        (product.internalId ? byInternalId.get(product.internalId) : undefined) ??
        byCode.get(product.code);
      if (existing) updated += 1;
      else created += 1;

      return {
        company_id: companyId,
        danea_internal_id: product.internalId,
        code: product.code,
        description: product.description,
        description_html: product.descriptionHtml,
        category: product.category,
        subcategory: product.subcategory,
        subcategory_levels: product.subcategoryLevels.length ? product.subcategoryLevels : null,
        danea_um: product.um,
        vat_code: product.vatCode,
        vat_perc: product.vatPerc,
        vat_class: product.vatClass,
        vat_description: product.vatDescription,
        barcode: product.barcode,
        product_type: product.productType,
        producer_name: product.producerName,
        link: product.link,
        notes: product.notes,
        custom_field_1: product.customField1,
        custom_field_2: product.customField2,
        custom_field_3: product.customField3,
        custom_field_4: product.customField4,
        supplier_code: product.supplierCode,
        supplier_name: product.supplierName,
        supplier_product_code: product.supplierProductCode,
        image_file_name: product.imageFileName,
        image_folder: product.imageFileName ? doc.imageFolder : null,
        publish_status: "pubblicato" as const,
        unpublished_at: null,
        last_received_at: now,
        last_sync_run_id: runId,
        raw_payload: product.raw as never,
      };
    });

    const idByCode = new Map<string, string>();
    for (const chunk of chunked(rows, 200)) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .upsert(chunk, { onConflict: "company_id,code" })
        .select("id, code");
      if (error) throw new Error(`Salvataggio prodotti: ${error.message}`);
      for (const row of data ?? []) idByCode.set(row.code, row.id);
    }

    await applyPrices(supabaseAdmin, companyId, doc, idByCode);
    await applySupplierCosts(supabaseAdmin, companyId, doc, idByCode);

    let unpublished = 0;
    if (doc.mode === "full") {
      // PROTEZIONE: la depubblicazione per assenza avviene solo se l'invio completo
      // è stato letto ed elaborato integralmente: ogni prodotto presente nel file
      // deve essere stato salvato. Un file vuoto o parzialmente salvato non può
      // depubblicare in massa. Le segnalazioni sui singoli campi non bloccano
      // l'allineamento: l'invio completo resta la fotografia dell'archivio Danea.
      const everyRowSaved = idByCode.size === rows.length;
      const safeToReconcile = doc.products.length > 0 && everyRowSaved;

      if (safeToReconcile) {
        const { data, error } = await supabaseAdmin
          .from("products")
          .update({ publish_status: "non_pubblicato", unpublished_at: now })
          .eq("company_id", companyId)
          .eq("publish_status", "pubblicato")
          .neq("last_sync_run_id", runId)
          .select("id");
        if (error) throw new Error(`Depubblicazione: ${error.message}`);
        unpublished = data?.length ?? 0;
      } else {
        issues.push({
          productCode: null,
          fieldName: "Products",
          reason:
            "Invio completo non considerato integro (file vuoto, parziale o con righe non valide): depubblicazione per assenza non eseguita",
        });
      }
    } else if (doc.deletedCodes.length) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .update({ publish_status: "non_pubblicato", unpublished_at: now, last_sync_run_id: runId })
        .eq("company_id", companyId)
        .in("code", doc.deletedCodes)
        .select("id");
      if (error) throw new Error(`Depubblicazione: ${error.message}`);
      unpublished = data?.length ?? 0;
      const missing = doc.deletedCodes.length - unpublished;
      if (missing > 0) {
        issues.push({
          productCode: null,
          fieldName: "DeletedProducts",
          reason: `${missing} codici da depubblicare non presenti in archivio`,
        });
      }
    }

    await writeIssues(supabaseAdmin, companyId, runId, issues);

    await supabaseAdmin
      .from("danea_sync_runs")
      .update({
        outcome: "completato",
        received_count: doc.products.length,
        created_count: created,
        updated_count: updated,
        unpublished_count: unpublished,
        skipped_count: issues.length,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (station) {
      await supabaseAdmin
        .from("danea_stations")
        .update({ last_success_at: new Date().toISOString() })
        .eq("id", station.id);
    }

    return {
      runId,
      mode: doc.mode,
      received: doc.products.length,
      created,
      updated,
      unpublished,
      skipped: issues.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    await writeIssues(supabaseAdmin, companyId, runId, issues);
    await supabaseAdmin
      .from("danea_sync_runs")
      .update({ outcome: "fallito", error_message: message, finished_at: new Date().toISOString() })
      .eq("id", runId);
    throw error;
  }
}

export type AnalyzeResult = {
  mode: DaneaDocument["mode"];
  received: number;
  toCreate: number;
  toUpdate: number;
  toUnpublish: number;
  priceLists: { listNumber: number; name: string }[];
  issues: { productCode: string | null; fieldName: string | null; reason: string }[];
  reconciliationBlocked: boolean;
};

/**
 * Anteprima in SOLA LETTURA: usa lo stesso lettore XML del collegamento diretto,
 * non scrive nulla e non registra alcun invio.
 */
export async function analyzeDaneaCatalog(companyId: string, xml: string): Promise<AnalyzeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const doc = parseDaneaProducts(xml);

  const { data: existingRows, error } = await supabaseAdmin
    .from("products")
    .select("id, code, danea_internal_id, publish_status, last_sync_run_id")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  const byInternalId = new Set<string>();
  const byCode = new Set<string>();
  for (const row of existingRows ?? []) {
    if (row.danea_internal_id) byInternalId.add(row.danea_internal_id);
    byCode.add(row.code);
  }

  let toCreate = 0;
  let toUpdate = 0;
  const incomingCodes = new Set<string>();
  for (const product of doc.products) {
    incomingCodes.add(product.code);
    const known =
      (product.internalId && byInternalId.has(product.internalId)) || byCode.has(product.code);
    if (known) toUpdate += 1;
    else toCreate += 1;
  }

  const published = (existingRows ?? []).filter((r) => r.publish_status === "pubblicato");
  const reconciliationBlocked = doc.mode === "full" && (doc.products.length === 0 || doc.issues.length > 0);

  let toUnpublish = 0;
  if (doc.mode === "full") {
    toUnpublish = reconciliationBlocked
      ? 0
      : published.filter((r) => !incomingCodes.has(r.code)).length;
  } else {
    toUnpublish = published.filter((r) => doc.deletedCodes.includes(r.code)).length;
  }

  const priceLists: { listNumber: number; name: string }[] = [];
  for (let i = 1; i <= 9; i += 1) {
    const name = doc.priceNames[i];
    if (name) priceLists.push({ listNumber: i, name });
  }

  return {
    mode: doc.mode,
    received: doc.products.length,
    toCreate,
    toUpdate,
    toUnpublish,
    priceLists,
    issues: doc.issues.slice(0, 50),
    reconciliationBlocked,
  };
}


type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function syncPriceListNames(
  supabaseAdmin: AdminClient,
  companyId: string,
  doc: DaneaDocument,
) {
  const rows = [];
  for (let i = 1; i <= 9; i += 1) {
    const name = doc.priceNames[i] ?? null;
    rows.push({ company_id: companyId, list_number: i, danea_name: name });
  }
  await supabaseAdmin
    .from("danea_price_lists")
    .upsert(rows, { onConflict: "company_id,list_number" });
}

async function applyPrices(
  supabaseAdmin: AdminClient,
  companyId: string,
  doc: DaneaDocument,
  idByCode: Map<string, string>,
) {
  const productIds = [...idByCode.values()];
  if (!productIds.length) return;

  for (const chunk of chunked(productIds, 200)) {
    const { error } = await supabaseAdmin.from("product_prices").delete().in("product_id", chunk);
    if (error) throw new Error(`Pulizia prezzi: ${error.message}`);
  }

  const rows: {
    company_id: string;
    product_id: string;
    list_number: number;
    net_price: number | null;
    gross_price: number | null;
  }[] = [];

  for (const product of doc.products) {
    const productId = idByCode.get(product.code);
    if (!productId) continue;
    for (let i = 1; i <= 9; i += 1) {
      const net = product.netPrices[i] ?? null;
      const gross = product.grossPrices[i] ?? null;
      if (net === null && gross === null) continue;
      rows.push({
        company_id: companyId,
        product_id: productId,
        list_number: i,
        net_price: net,
        gross_price: gross,
      });
    }
  }

  for (const chunk of chunked(rows, 500)) {
    const { error } = await supabaseAdmin.from("product_prices").insert(chunk);
    if (error) throw new Error(`Salvataggio prezzi: ${error.message}`);
  }
}

/** Danea trasmette un solo fornitore/costo per prodotto: memorizziamo solo quello ricevuto. */
async function applySupplierCosts(
  supabaseAdmin: AdminClient,
  companyId: string,
  doc: DaneaDocument,
  idByCode: Map<string, string>,
) {
  const rows = [];
  const withoutCost: string[] = [];

  for (const product of doc.products) {
    const productId = idByCode.get(product.code);
    if (!productId) continue;
    const hasCost =
      product.supplierNetPrice !== null ||
      product.supplierGrossPrice !== null ||
      product.supplierCode !== null ||
      product.supplierName !== null;
    if (!hasCost) {
      withoutCost.push(productId);
      continue;
    }
    rows.push({
      company_id: companyId,
      product_id: productId,
      supplier_code: product.supplierCode,
      supplier_name: product.supplierName,
      supplier_product_code: product.supplierProductCode,
      supplier_net_price: product.supplierNetPrice,
      supplier_gross_price: product.supplierGrossPrice,
      received_at: new Date().toISOString(),
    });
  }

  for (const chunk of chunked(withoutCost, 200)) {
    const { error } = await supabaseAdmin
      .from("product_supplier_costs")
      .delete()
      .in("product_id", chunk);
    if (error) throw new Error(`Pulizia costi: ${error.message}`);
  }

  for (const chunk of chunked(rows, 300)) {
    const { error } = await supabaseAdmin
      .from("product_supplier_costs")
      .upsert(chunk, { onConflict: "product_id" });
    if (error) throw new Error(`Salvataggio costi: ${error.message}`);
  }
}

async function writeIssues(
  supabaseAdmin: AdminClient,
  companyId: string,
  runId: string,
  issues: DaneaIssue[],
) {
  if (!issues.length) return;
  const rows = issues.slice(0, 500).map((issue) => ({
    company_id: companyId,
    sync_run_id: runId,
    product_code: issue.productCode,
    field_name: issue.fieldName,
    reason: issue.reason,
  }));
  await supabaseAdmin.from("danea_sync_issues").insert(rows);
}
