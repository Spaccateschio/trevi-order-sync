import type { OrderItemRow } from "@/lib/purchase";

const itCollator = new Intl.Collator("it", { sensitivity: "base" });

/**
 * Ordine di lettura delle righe ordinate: alfabetico per descrizione (italiano,
 * maiuscole/minuscole ignorate), a parità per codice articolo.
 * Le righe senza descrizione restano in fondo.
 * Solo presentazione: l'elenco congelato all'invio non cambia.
 */
export function sortOrderItemsAlphabetically(items: OrderItemRow[]): OrderItemRow[] {
  return [...items].sort((a, b) => {
    const left = a.products?.description ?? "";
    const right = b.products?.description ?? "";
    if (left === "" || right === "") {
      if (left === right) return itCollator.compare(a.products?.code ?? "", b.products?.code ?? "");
      return left === "" ? 1 : -1;
    }
    const byDescription = itCollator.compare(left, right);
    if (byDescription !== 0) return byDescription;
    return itCollator.compare(a.products?.code ?? "", b.products?.code ?? "");
  });
}
