import type { PickSupplier, ValidConversion } from "@/lib/supplier-selection";
import { splitEvenly, isWholeNumber } from "@/lib/supplier-selection";
import type { SupplierMemory } from "@/lib/supplier-memory";
import { planFromMemory } from "@/lib/supplier-memory";

/**
 * Ripartizione al cambio della quota «Acquisto diretto» (solo calcolo: le scritture passano
 * da commit_shopping_list_item_quantity nella stessa transazione della quota diretta).
 * Regole:
 * - nessuna quota fornitore → nessuna scrittura (la quota diretta è tutta la riga);
 * - un solo fornitore → la sua quota segue il residuo (stessa U.M. o conversione valida, confezioni intere);
 * - più fornitori → solo se le quote sono ancora quelle automatiche (proporzioni della memoria o
 *   parti uguali); le quote modificate a mano non si toccano (differenza da sistemare);
 * - eccedenza ammessa: se la quota diretta supera «Da acquistare», nessuna quota fornitore viene toccata
 *   (la riga resta «da verificare» e la card mostra l'avviso).
 */

const norm = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();

export type DirectPoolRow = {
  id: string;
  linkId: string;
  purchaseQuantity: number | null;
  purchaseUnitId: string | null;
  purchaseUnitCode: string | null;
};

export type DirectChangeWrite = {
  linkId: string;
  assignmentId: string;
  quantity: number;
  unitId: string | null;
  manual: string | null;
};

export type DirectChangePlan =
  | { kind: "scritti"; writes: DirectChangeWrite[] }
  | { kind: "nessuna_scrittura" }
  | { kind: "da_sistemare"; reason: string };

type WriteAttempt = { unchanged: true } | { unchanged: false; write: DirectChangeWrite };

export function planDirectChange(args: {
  quantity: number;
  directOld: number | null;
  directNew: number;
  suppliers: PickSupplier[];
  assignments: DirectPoolRow[];
  decidedUnitId: string | null;
  decidedCode: string;
  stockUnitId: string | null;
  conversions: Record<string, ValidConversion[]>;
  memory: SupplierMemory | null;
}): DirectChangePlan {
  const { quantity, directOld, directNew, suppliers, assignments, decidedUnitId, decidedCode, stockUnitId, conversions, memory } = args;
  if (!assignments.length) return { kind: "nessuna_scrittura" };
  // Confrontabile: stessa U.M. per id, oppure stesso codice (riga senza U.M. decisa: il fornitore la offre),
  // oppure U.M. del fornitore convertibile nell'U.M. di magazzino quando «Da acquistare» è nell'U.M. di magazzino.
  const sameUnit = (r: DirectPoolRow) => {
    if (r.purchaseUnitId ? r.purchaseUnitId === decidedUnitId : false) return true;
    if (!r.purchaseUnitId && norm(r.purchaseUnitCode ?? "") === norm(decidedCode)) return true;
    if (r.purchaseUnitId && !decidedUnitId) {
      const s = suppliers.find((x) => x.linkId === r.linkId);
      return Boolean(s?.units.some((u) => u.unitId === r.purchaseUnitId && norm(u.code) === norm(decidedCode)));
    }
    return false;
  };
  const convertible = (r: DirectPoolRow) => {
    if (sameUnit(r)) return true;
    if (!stockUnitId || decidedUnitId !== stockUnitId) return false;
    return (conversions[r.linkId] ?? []).some((c) => c.unitId === r.purchaseUnitId && c.factor > 0);
  };
  if (assignments.some((r) => !convertible(r)))
    return { kind: "da_sistemare", reason: "Quote in U.M. diversa senza conversione valida: sistemale a mano" };

  const supplierTarget = quantity - directNew;
  if (supplierTarget < 0) return { kind: "nessuna_scrittura" };
  if (supplierTarget === 0)
    return { kind: "da_sistemare", reason: "La quota diretta copre tutta la quantità: togli la spunta ai fornitori o riduci le quote a mano" };

  // Quantità che la riga porterebbe per la quota «share» nella sua U.M. (null = non scrivibile).
  const inRowUnit = (r: DirectPoolRow, share: number): number | null => {
    if (sameUnit(r)) return share;
    const conv = (conversions[r.linkId] ?? []).find((c) => c.unitId === r.purchaseUnitId && c.factor > 0);
    if (!conv) return null;
    const packs = share / conv.factor;
    return isWholeNumber(packs) ? Math.round(packs) : null;
  };
  const writeFor = (r: DirectPoolRow, share: number): WriteAttempt | null => {
    const q = inRowUnit(r, share);
    if (q === null) return null;
    if (r.purchaseQuantity !== null && Math.abs(q - r.purchaseQuantity) < 1e-9) return { unchanged: true };
    return { unchanged: false, write: { linkId: r.linkId, assignmentId: r.id, quantity: q, unitId: r.purchaseUnitId, manual: r.purchaseUnitId ? null : r.purchaseUnitCode } };
  };

  if (assignments.length === 1) {
    const attempt = writeFor(assignments[0]!, supplierTarget);
    if (attempt === null) return { kind: "da_sistemare", reason: "La quota non è convertibile: sistema le quote a mano" };
    return attempt.unchanged ? { kind: "nessuna_scrittura" } : { kind: "scritti", writes: [attempt.write] };
  }

  const previousPool = quantity - (directOld ?? 0);
  // Memoria: le quote attuali hanno le proporzioni dell'ultima Lista chiusa → il residuo si ridistribuisce in proporzione.
  if (memory) {
    const prev = planFromMemory(memory, { suppliers, deselected: new Set(), decidedUnitId, decidedCode, quantity: previousPool, stockUnitId, conversions });
    if (prev.kind === "scrivi" && prev.writes.length === assignments.length + (directOld !== null ? 1 : 0)) {
      const matches = prev.writes.every((w) => {
        if (w.kind === "diretto") return directOld !== null && Math.abs(directOld - w.quantity) < 1e-6;
        const r = assignments.find((x) => x.linkId === w.linkId);
        if (!r) return false;
        const same = w.target.unitId ? w.target.unitId === r.purchaseUnitId : !r.purchaseUnitId && norm(w.target.manual ?? "") === norm(r.purchaseUnitCode ?? "");
        return same && r.purchaseQuantity !== null && Math.abs(r.purchaseQuantity - w.target.quantity) < 1e-6;
      });
      if (matches && previousPool > 0) {
        const scale = supplierTarget / previousPool;
        const writes: DirectChangeWrite[] = [];
        for (const w of prev.writes) {
          if (w.kind === "diretto") continue;
          const r = assignments.find((x) => x.linkId === w.linkId)!;
          const attempt = writeFor(r, w.target.quantity * scale);
          if (attempt === null) return { kind: "da_sistemare", reason: "Le proporzioni non danno quote esatte: sistema le quote a mano" };
          if (!attempt.unchanged) writes.push(attempt.write);
        }
        return { kind: "scritti", writes };
      }
    }
  }
  // Parti uguali: le quote attuali sono state divise in parti uguali (regola della spunta multipla).
  const prevParts = splitEvenly(previousPool, assignments.length, isWholeNumber(previousPool));
  const evenMatch =
    prevParts.length === assignments.length &&
    assignments.every((r, i) => {
      const t = inRowUnit(r, prevParts[i]!);
      return t !== null && r.purchaseQuantity !== null && Math.abs(r.purchaseQuantity - t) < 1e-9;
    });
  if (!evenMatch) return { kind: "da_sistemare", reason: "Quote modificate a mano: sistema le quote dei fornitori a mano" };
  const parts = splitEvenly(supplierTarget, assignments.length, isWholeNumber(supplierTarget));
  if (parts.length !== assignments.length) return { kind: "da_sistemare", reason: "Le nuove quote non sono esatte: sistema le quote a mano" };
  const writes: DirectChangeWrite[] = [];
  for (const [i, r] of assignments.entries()) {
    const attempt = writeFor(r, parts[i]!);
    if (attempt === null) return { kind: "da_sistemare", reason: "Le nuove quote non sono esatte: sistema le quote a mano" };
    if (!attempt.unchanged) writes.push(attempt.write);
  }
  return { kind: "scritti", writes };
}
