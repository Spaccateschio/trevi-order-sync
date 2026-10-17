/** Esito di «Genera ordini selezionati» per singolo documento. */
export type GenerationOutcome =
  | { kind: "inviato"; name: string; orderId: string; number: string | null }
  | { kind: "da_condividere"; name: string; orderId: string; number: string | null }
  | { kind: "errore_invio"; name: string; orderId: string; number: string | null; isB2b: boolean; message: string }
  | { kind: "errore_generazione"; name: string; message: string }
  | { kind: "acquisto_diretto"; name: string; id: string; number: string | null };

/** Dopo la creazione: B2B si invia subito tramite piattaforma, non B2B resta da condividere (mai «inviato» da solo). */
export function afterCreateAction(isB2b: boolean): "invia_piattaforma" | "condividi" {
  return isB2b ? "invia_piattaforma" : "condividi";
}

/** Sostituisce l'esito di un documento (es. dopo «Riprova» o dopo la condivisione confermata). */
export function replaceOutcome(list: GenerationOutcome[], orderId: string, next: GenerationOutcome): GenerationOutcome[] {
  return list.map((o) => ("orderId" in o && o.orderId === orderId ? next : o));
}

export function summarize(list: GenerationOutcome[]) {
  return {
    inviati: list.filter((o) => o.kind === "inviato").length,
    daCondividere: list.filter((o) => o.kind === "da_condividere").length,
    errori: list.filter((o) => o.kind === "errore_invio" || o.kind === "errore_generazione").length,
    diretti: list.filter((o) => o.kind === "acquisto_diretto").length,
  };
}

/** Testo dell'ordine da condividere via WhatsApp/email. */
export function orderShareText(
  number: string | null,
  supplier: string,
  lines: { product_name: string | null; product_code: string | null; purchase_quantity: number | null; purchase_unit_code: string | null }[],
  linkUrl: string,
  delivery?: { date?: string | null; from?: string | null; to?: string | null; address?: string | null; notes?: string | null; lineNotes?: string[] },
) {
  const rows = lines.map((l) => `- ${l.product_code ? `${l.product_code} ` : ""}${l.product_name ?? ""}: ${l.purchase_quantity ?? "Non indicata"} ${l.purchase_unit_code ?? ""}`.trim());
  return [`Ordine ${number ?? ""} per ${supplier}`.trim(), "", ...rows,
    ...(delivery ? ["", `Data consegna: ${delivery.date ?? "Non indicata"}`, `Orario: ${[delivery.from, delivery.to].filter(Boolean).join(" – ") || "Non indicato"}`, `Luogo: ${delivery.address ?? "Non indicato"}`, `Note per il fornitore: ${delivery.notes?.trim() || "Nessuna"}`, ...(delivery.lineNotes ?? [])] : []),
    ...(linkUrl ? ["", `Comunica la consegna da qui: ${linkUrl}`] : []),
  ].join("\n");
}
