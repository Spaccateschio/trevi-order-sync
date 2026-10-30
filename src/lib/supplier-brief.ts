/** Riga riassuntiva dei fornitori in card e destinazioni proposte: sola presentazione, nessuna scrittura. */

import { qty } from "@/lib/inventory";
import type { PickSupplier } from "@/lib/supplier-selection";

/** Riga `product_supplier_overview`: solo i campi che servono alla scelta proposta. */
type OverviewRead = { link_id: string; supplier_name: string; is_active: boolean; is_preferred: boolean | null };
/** Riga `product_supplier_b2b_options`. */
type OptionRead = { link_id: string; is_b2b: boolean; source_product_id: string | null; purchasable: boolean };
/** Riga `shopping_item_supplier_units`. */
type LinkUnitsRead = { link_id: string; is_b2b: boolean; source_linked: boolean; allow_manual: boolean; purchasable: boolean };

const byLink = <T extends { link_id: string }>(rows: unknown[]) =>
  new Map((rows as T[]).map((row) => [row.link_id, row]));

/**
 * Stessa costruzione di `useCardSuppliers` (card-suppliers.tsx) per i soli campi letti da `chooseListDestinations`:
 * i dati del collegamento (`shopping_item_supplier_units`) hanno la precedenza sulle opzioni B2B.
 * `units`/`allowManual` non contano alla scelta, ma restano nel tipo: qui sono vuoti/false.
 */
export function pickFromCardReads(overview: unknown[], b2bOptions: unknown[], supplierUnits: unknown[]): PickSupplier[] {
  const options = byLink<OptionRead>(b2bOptions);
  const linkUnits = byLink<LinkUnitsRead>(supplierUnits);
  return (overview as OverviewRead[])
    .filter((s) => s.is_active)
    .map((s) => {
      const opt = options.get(s.link_id);
      const db = linkUnits.get(s.link_id);
      const isB2B = db ? db.is_b2b : Boolean(opt?.is_b2b);
      return {
        linkId: s.link_id,
        isB2B,
        sourceLinked: db ? db.source_linked : Boolean(opt?.source_product_id),
        purchasable: db ? db.purchasable !== false : opt?.purchasable !== false,
        allowManual: db ? db.allow_manual : !isB2B,
        units: [],
        isPreferred: Boolean(s.is_preferred),
      };
    });
}

/** Fornitore della riga riassuntiva: quota salvata (`quantity`) o scelta senza quota (`note`). */
export type BriefSupplier = { name: string; quantity: number | null; unitCode?: string | null; note?: string | null };

/**
 * Una riga sola per la card chiusa: «CATARINACCI 3 cs · GARBAGLIA 2 cs».
 * Senza quota il fornitore resta visibile con il motivo («GERMANO (proposto)»), mai una quantità inventata.
 */
export function supplierBriefText(items: BriefSupplier[]): string {
  return items
    .map((s) =>
      s.quantity === null
        ? `${s.name}${s.note ? ` (${s.note})` : ""}`
        : `${s.name} ${qty(s.quantity)} ${s.unitCode ?? ""}`.trim(),
    )
    .join(" · ");
}
