import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { UnitPicker } from "@/components/catalog/unit-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { activeCompany, isRelationOperational, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import {
  CATALOG_SELECT,
  fetchAssignedPrices,
  fetchUnitPreferences,
  resolveSaleUnit,
  saveUnitPreference,
  sortedSaleUnits,
  type CatalogProductRow,
} from "@/lib/catalog";
import { getCatalogImageUrls } from "@/lib/catalog.functions";
import { euro } from "@/lib/product-grid";

export const Route = createFileRoute("/_authenticated/acquisti/catalogo/$sellerId/$productId")({
  head: () => ({
    meta: [
      { title: "Prodotto del fornitore — Trevi Fruit" },
      {
        name: "description",
        content:
          "Scheda prodotto del catalogo di un fornitore collegato: foto, descrizione, unità di misura e prezzo assegnato.",
      },
      { property: "og:title", content: "Prodotto del fornitore — Trevi Fruit" },
      {
        property: "og:description",
        content: "Scheda prodotto del catalogo di un fornitore collegato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogProductPage,
});

function CatalogProductPage() {
  const { sellerId, productId } = Route.useParams();
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const company = activeCompany(identity);
  const buyerId = company?.companyId ?? null;
  const signImages = useServerFn(getCatalogImageUrls);

  const relation = (identity?.relations ?? []).find(
    (r) => r.buyerCompanyId === buyerId && r.sellerCompanyId === sellerId,
  );
  const operational = relation ? isRelationOperational(relation) : false;

  const productQuery = useQuery({
    queryKey: ["catalogo-prodotto", sellerId, productId],
    enabled: operational,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, code, description, description_html, category, subcategory, danea_um, notes, product_images(id), product_sale_units(is_default, conversion_factor, conversion_reference_um, units_of_measure(code, description))",
        )
        .eq("company_id", sellerId)
        .eq("publish_status", "pubblicato")
        .eq("b2b_visible", true)
        .eq("id", productId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as CatalogProductRow | null) ?? null;
    },
  });

  const priceQuery = useQuery({
    queryKey: ["catalogo-prezzo", sellerId, productId],
    enabled: operational && Boolean(productQuery.data),
    queryFn: () => fetchAssignedPrices(sellerId, [productId]),
  });

  const imageQuery = useQuery({
    queryKey: ["catalogo-immagine", sellerId, productId],
    enabled: operational && Boolean(productQuery.data?.product_images),
    queryFn: async () => {
      const result = await signImages({
        data: { sellerCompanyId: sellerId, productIds: [productId], thumbnail: false },
      });
      return result[0]?.url ?? null;
    },
  });

  const favoriteQuery = useQuery({
    queryKey: ["catalogo-preferito", buyerId, productId],
    enabled: operational && Boolean(buyerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyer_product_favorites")
        .select("id")
        .eq("buyer_company_id", buyerId!)
        .eq("product_id", productId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!buyerId) throw new Error("Azienda non disponibile");
      if (favoriteQuery.data) {
        const { error } = await supabase
          .from("buyer_product_favorites")
          .delete()
          .eq("buyer_company_id", buyerId)
          .eq("product_id", productId);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("buyer_product_favorites").insert({
        buyer_company_id: buyerId,
        seller_company_id: sellerId,
        product_id: productId,
        created_by: identity?.userId ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["catalogo-preferito", buyerId, productId] });
      void queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti", buyerId, sellerId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!operational) {
    return (
      <AppShell title="Prodotto" description="Questo catalogo non è disponibile.">
        <Button asChild size="sm">
          <Link to="/collegamenti">Vai a Collegamenti</Link>
        </Button>
      </AppShell>
    );
  }

  const product = productQuery.data;
  const price = priceQuery.data?.get(productId) ?? null;

  return (
    <AppShell
      title={product?.description ?? product?.code ?? "Prodotto"}
      description={relation?.sellerCompanyName ?? "Catalogo del fornitore"}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/acquisti/catalogo/$sellerId" params={{ sellerId }}>
            Torna al catalogo
          </Link>
        </Button>
      }
    >
      {productQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !product ? (
        <p className="text-sm text-muted-foreground">
          Prodotto non disponibile: il fornitore potrebbe averlo nascosto dalla vetrina.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {imageQuery.data ? (
              <img src={imageQuery.data} alt={product.description ?? product.code} className="w-full object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center bg-muted">
                <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {product.code}
              </Badge>
              {product.category ? <Badge variant="secondary">{product.category}</Badge> : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Prezzo</p>
              {price === null ? (
                <p className="text-sm">Prezzo confermato dal fornitore in fase d'ordine.</p>
              ) : (
                <p className="text-2xl font-semibold tabular-nums">{euro(price)}</p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Unità di misura</p>
              {product.product_sale_units.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {product.product_sale_units.map((unit, index) => (
                    <li key={`${unit.units_of_measure?.code ?? index}`}>
                      <span className="font-medium">{unit.units_of_measure?.code ?? "—"}</span>
                      {unit.units_of_measure?.description
                        ? ` · ${unit.units_of_measure.description}`
                        : ""}
                      {unit.is_default ? " · predefinita" : ""}
                      {unit.conversion_factor
                        ? ` · circa ${unit.conversion_factor} ${unit.conversion_reference_um ?? ""}`.trimEnd()
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {product.danea_um ?? "Non indicata"}
                </p>
              )}
            </div>

            {product.description_html || product.notes ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm">
                <p className="text-xs uppercase text-muted-foreground">Descrizione</p>
                <p className="mt-1 whitespace-pre-line">
                  {product.description_html ?? product.notes}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <FavoriteButton
                active={Boolean(favoriteQuery.data)}
                size="default"
                label={favoriteQuery.data ? "Nei preferiti" : "Preferito"}
                onToggle={() => toggleFavorite.mutate()}
              />
              <Button variant="outline" size="sm" disabled title="Disponibile a breve">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Aggiungi alla lista della spesa · a breve
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
