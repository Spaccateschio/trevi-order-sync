import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";

import { FavoriteButton } from "@/components/catalog/favorite-button";
import { UnitPicker } from "@/components/catalog/unit-picker";
import type { CatalogSaleUnit } from "@/lib/catalog";
import { euro } from "@/lib/product-grid";

export type CatalogProduct = {
  id: string;
  sellerId: string;
  sellerName: string;
  code: string;
  description: string | null;
  category: string | null;
  danea_um: string | null;
  units: CatalogSaleUnit[];
  selectedUnitId: string | null;
  price: number | null;
  /** U.M. a cui è riferito il prezzo (es. kg): resta la stessa per ogni formato ordinato. */
  priceUnit: string | null;
  availability: "available" | "on_order" | "temporarily_unavailable";
};


const AVAILABILITY_NOTE: Record<CatalogProduct["availability"], string | null> = {
  available: null,
  on_order: "Su ordinazione",
  temporarily_unavailable: "Temporaneamente non disponibile",
};

/**
 * Elenco prodotti del catalogo: usato sia per un singolo fornitore
 * sia per la vista globale (colonna Fornitore attiva con showSeller).
 */
export function CatalogList({
  products,
  imageUrls,
  favorites,
  onToggleFavorite,
  onSelectUnit,
  showSeller = false,
}: {
  products: CatalogProduct[];
  imageUrls: Map<string, string>;
  favorites: Set<string>;
  onToggleFavorite: (product: CatalogProduct) => void;
  onSelectUnit: (product: CatalogProduct, productSaleUnitId: string) => void;
  showSeller?: boolean;
}) {
  if (!products.length) {
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Nessun prodotto corrisponde alla ricerca.
      </p>
    );
  }

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-16 px-3 py-2 text-left font-semibold">Foto</th>
              <th className="px-3 py-2 text-left font-semibold">Codice / Descrizione</th>
              {showSeller ? (
                <th className="w-44 px-3 py-2 text-left font-semibold">Fornitore</th>
              ) : null}
              <th className="w-40 px-3 py-2 text-left font-semibold">Categoria</th>
              <th className="w-32 px-3 py-2 text-left font-semibold">U.M.</th>
              <th className="w-32 px-3 py-2 text-right font-semibold">Prezzo</th>
              <th className="w-14 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={`${product.sellerId}-${product.id}`} className="border-t border-border hover:bg-muted/50">
                <td className="px-3 py-2">
                  <Link
                    to="/acquisti/catalogo/$sellerId/$productId"
                    params={{ sellerId: product.sellerId, productId: product.id }}
                  >
                    {imageUrls.get(product.id) ? (
                      <img
                        src={imageUrls.get(product.id)}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded bg-muted">
                        <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link
                    to="/acquisti/catalogo/$sellerId/$productId"
                    params={{ sellerId: product.sellerId, productId: product.id }}
                    className="block"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
                    <span className="block font-medium">{product.description ?? product.code}</span>
                    {AVAILABILITY_NOTE[product.availability] ? (
                      <span className="block text-xs text-muted-foreground">{AVAILABILITY_NOTE[product.availability]}</span>
                    ) : null}
                  </Link>
                </td>
                {showSeller ? (
                  <td className="px-3 py-2 text-muted-foreground">{product.sellerName}</td>
                ) : null}
                <td className="px-3 py-2 text-muted-foreground">{product.category ?? "—"}</td>
                <td className="px-3 py-2">
                  <UnitPicker
                    units={product.units}
                    value={product.selectedUnitId}
                    fallbackLabel={product.danea_um}
                    onChange={(unitId) => onSelectUnit(product, unitId)}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {product.price === null ? (
                    <span className="text-xs text-muted-foreground">Su richiesta</span>
                  ) : (
                    euro(product.price)
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <FavoriteButton
                    active={favorites.has(product.id)}
                    onToggle={() => onToggleFavorite(product)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Smartphone */}
      <ul className="space-y-2 md:hidden">
        {products.map((product) => (
          <li
            key={`${product.sellerId}-${product.id}`}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="flex items-center gap-3">
              <Link
                to="/acquisti/catalogo/$sellerId/$productId"
                params={{ sellerId: product.sellerId, productId: product.id }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {imageUrls.get(product.id) ? (
                  <img
                    src={imageUrls.get(product.id)}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-muted">
                    <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {product.description ?? product.code}
                  </span>
                  {AVAILABILITY_NOTE[product.availability] ? (
                    <span className="block truncate text-xs text-muted-foreground">{AVAILABILITY_NOTE[product.availability]}</span>
                  ) : null}
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {product.code}
                    {showSeller ? ` · ${product.sellerName}` : ""}
                  </span>
                  <span className="block text-sm tabular-nums">
                    {product.price === null ? (
                      <span className="text-xs text-muted-foreground">Prezzo su richiesta</span>
                    ) : (
                      euro(product.price)
                    )}
                  </span>
                </span>
              </Link>
              <FavoriteButton
                active={favorites.has(product.id)}
                onToggle={() => onToggleFavorite(product)}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground">U.M.</span>
              <UnitPicker
                units={product.units}
                value={product.selectedUnitId}
                fallbackLabel={product.danea_um}
                onChange={(unitId) => onSelectUnit(product, unitId)}
                className="w-32"
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
