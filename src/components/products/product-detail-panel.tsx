import { SearchX } from "lucide-react";

import { ProductDetailContent, type ProductDetailTab } from "@/components/products/product-detail-sheet";
import type { CompanyCaps } from "@/lib/products-view";
import type { CompanyUnit, ProductSaleUnit } from "@/components/products/sales-unit-manager";
import type { ProductRow } from "@/lib/product-grid";

/**
 * Pannello fisso della scheda prodotto per computer (≥1280 px): sempre visibile accanto
 * all'elenco, senza oscurare nulla. Senza prodotto selezionato mostra l'invito.
 * La scheda è la stessa della finestra modale: cambi solo i bordi e l'apertura.
 */
export function ProductDetailPanel({
  product,
  archiveName,
  listName,
  isAdmin,
  cost,
  companyId,
  companyUnits,
  saleUnits,
  initialTab,
  caps,
  tab,
  onTabChange,
  onClose,
}: {
  product: ProductRow | null;
  archiveName: string;
  listName: (number: number) => string;
  isAdmin: boolean;
  cost?: { supplier_name: string | null; supplier_code: string | null; supplier_product_code: string | null; supplier_net_price: number | null } | null;
  companyId: string | null;
  companyUnits: CompanyUnit[];
  saleUnits: ProductSaleUnit[];
  initialTab?: ProductDetailTab;
  caps: CompanyCaps;
  tab?: ProductDetailTab;
  onTabChange?: (tab: ProductDetailTab) => void;
  onClose?: () => void;
}) {
  if (!product) {
    return (
      <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center" aria-label="Scheda prodotto">
        <div className="space-y-2">
          <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Seleziona un prodotto</p>
          <p className="text-xs text-muted-foreground">Tocca una riga dell'elenco: la scheda si apre qui, a fianco.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Scheda prodotto">
      <ProductDetailContent
        product={product}
        archiveName={archiveName}
        listName={listName}
        isAdmin={isAdmin}
        cost={cost ?? null}
        companyId={companyId}
        companyUnits={companyUnits}
        saleUnits={saleUnits}
        initialTab={initialTab ?? "prodotto"}
        caps={caps}
        variant="panel"
        tab={tab}
        onTabChange={onTabChange}
        onClose={onClose}
      />
    </div>
  );
}
