import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductsWorkspace } from "@/components/products/products-workspace";

/**
 * Scheda prodotto completa in finestra sopra l'Inventario: riusa ProductsWorkspace in modalità
 * sheetOnly (stessi dati, salvataggi e permessi della pagina Prodotti). L'Inventario resta montato.
 */
export function InventoryProductDialog({ productId, supplierLinkId, supplierName, onClose }: {
  productId: string | null;
  supplierLinkId: string | null;
  supplierName: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const dirtyRef = useRef(false);
  const scrollRef = useRef(0);

  // Modifiche non salvate: un campo della finestra modificato dopo l'ultimo salvataggio riuscito.
  useEffect(() => {
    if (!productId) return;
    dirtyRef.current = false;
    scrollRef.current = window.scrollY;
    const onInput = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-inventory-product-sheet]")?.contains(target) || target?.closest('[role="dialog"]')) dirtyRef.current = true;
    };
    document.addEventListener("input", onInput, true);
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.status === "success") dirtyRef.current = false;
    });
    return () => { document.removeEventListener("input", onInput, true); unsubscribe(); };
  }, [productId, queryClient]);

  if (!productId) return null;

  const close = () => {
    // Aggiorna solo i dati delle card (prodotti, U.M., fornitori), non bozze né filtri.
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && (key.startsWith("inventario-") || key === "inventory-rows" || key === "inventory-allowed-units" || key === "inventory-progress");
      },
    });
    onClose();
    // Riporta l'Inventario allo stesso punto (la chiusura della finestra rimette il focus sul menu).
    const y = scrollRef.current;
    for (const delay of [0, 120, 400, 900]) window.setTimeout(() => window.scrollTo({ top: y }), delay);
  };

  const banner = (
    <div data-inventory-product-sheet className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 pr-10 text-xs">
      <span className="text-muted-foreground">
        Card di partenza: <span className="font-medium text-foreground">{supplierLinkId ? (supplierName ?? "Fornitore") : "Senza fornitore"}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/acquisti/prodotti" search={{ prodotto: productId }}><ExternalLink className="size-3.5" /> Apri in pagina intera</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => { if (confirmClose()) { dirtyRef.current = false; close(); } }}>Chiudi</Button>
      </div>
    </div>
  );

  function confirmClose() {
    return !dirtyRef.current || window.confirm("Ci sono modifiche non salvate. Chiudere comunque la scheda?");
  }

  return (
    <ProductsWorkspace
      key={productId}
      gridKey="acquisti.prodotti"
      prodottoParam={productId}
      initialTab="acquisto"
      sheetOnly
      sheetBanner={banner}
      sheetBeforeClose={confirmClose}
      onSheetClose={close}
    />
  );
}
