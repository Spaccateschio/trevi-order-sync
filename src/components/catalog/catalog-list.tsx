import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";

import { FavoriteButton } from "@/components/catalog/favorite-button";
import { euro } from "@/lib/product-grid";

export type CatalogProduct = {
  id: string;
  code: string;
  description: string | null;
  category: string | null;
  danea_um: string | null;
  saleUnits: string[];
  price: number | null;
};

export function CatalogList({
  sellerId,
  products,
  imageUrls,
  favorites,
  onToggleFavorite,
}: {
  sellerId: string;
  products: CatalogProduct[];
  imageUrls: Map<string, string>;
  favorites: Set<string>;
  onToggleFavorite: (productId: string) => void;
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
              <th className="w-40 px-3 py-2 text-left font-semibold">Categoria</th>
              <th className="w-32 px-3 py-2 text-left font-semibold">U.M.</th>
              <th className="w-32 px-3 py-2 text-right font-semibold">Prezzo</th>
              <th className="w-14 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-3 py-2">
                  <Link
                    to="/acquisti/catalogo/$sellerId/$productId"
                    params={{ sellerId, productId: product.id }}
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
                    params={{ sellerId, productId: product.id }}
                    className="block"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
                    <span className="block font-medium">{product.description ?? product.code}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{product.category ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {product.saleUnits.length ? product.saleUnits.join(", ") : product.danea_um ?? "—"}
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
                    onToggle={() => onToggleFavorite(product.id)}
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
            key={product.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <Link
              to="/acquisti/catalogo/$sellerId/$productId"
              params={{ sellerId, productId: product.id }}
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
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {product.code}
                  {product.saleUnits.length ? ` · ${product.saleUnits.join(", ")}` : ""}
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
              onToggle={() => onToggleFavorite(product.id)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
