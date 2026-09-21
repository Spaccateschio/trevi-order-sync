import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { CatalogList, type CatalogProduct } from "@/components/catalog/catalog-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activeCompany, isRelationOperational, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAssignedPrices,
  fetchSellerCatalogue,
  fetchUnitPreferences,
  resolveSaleUnit,
  saveUnitPreference,
  sortedSaleUnits,
} from "@/lib/catalog";
import { getCatalogImageUrls } from "@/lib/catalog.functions";

export const Route = createFileRoute("/_authenticated/acquisti/catalogo/$sellerId/")({
  head: () => ({
    meta: [
      { title: "Catalogo del fornitore — Trevi Fruit" },
      {
        name: "description",
        content:
          "Prodotti in vetrina del fornitore collegato: foto, unità di misura, prezzi del listino assegnato e preferiti.",
      },
      { property: "og:title", content: "Catalogo del fornitore — Trevi Fruit" },
      {
        property: "og:description",
        content: "Prodotti in vetrina del fornitore collegato, con preferiti e prezzi assegnati.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SellerCatalogue,
});

function SellerCatalogue() {
  const { sellerId } = Route.useParams();
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const company = activeCompany(identity);
  const buyerId = company?.companyId ?? null;
  const signImages = useServerFn(getCatalogImageUrls);

  const relation = (identity?.relations ?? []).find(
    (r) => r.buyerCompanyId === buyerId && r.sellerCompanyId === sellerId,
  );
  const operational = relation ? isRelationOperational(relation) : false;
  const sellerName = relation?.sellerCompanyName ?? "Fornitore";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("tutte");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["catalogo-prodotti", sellerId],
    enabled: operational,
    queryFn: () => fetchSellerCatalogue(sellerId),
  });

  const productIds = (productsQuery.data ?? []).map((product) => product.id);

  const pricesQuery = useQuery({
    queryKey: ["catalogo-prezzi", sellerId, productIds.length],
    enabled: operational && productIds.length > 0,
    queryFn: () => fetchAssignedPrices(sellerId, productIds),
  });

  const favoritesQuery = useQuery({
    queryKey: ["catalogo-preferiti", buyerId, sellerId],
    enabled: operational && Boolean(buyerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyer_product_favorites")
        .select("product_id")
        .eq("buyer_company_id", buyerId!)
        .eq("seller_company_id", sellerId);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((row) => row.product_id));
    },
  });

  const unitsQuery = useQuery({
    queryKey: ["catalogo-um-preferite", buyerId, sellerId],
    enabled: operational && Boolean(buyerId),
    queryFn: () => fetchUnitPreferences(buyerId!, sellerId),
  });

  const imagesQuery = useQuery({
    queryKey: ["catalogo-immagini", sellerId, productIds.length],
    enabled: operational && productIds.length > 0,
    queryFn: async () => {
      const withImage = (productsQuery.data ?? [])
        .filter((product) => product.product_images)
        .map((product) => product.id);
      const urls = new Map<string, string>();
      for (let index = 0; index < withImage.length; index += 60) {
        const chunk = withImage.slice(index, index + 60);
        if (!chunk.length) continue;
        const result = await signImages({
          data: { sellerCompanyId: sellerId, productIds: chunk, thumbnail: true },
        });
        for (const item of result) urls.set(item.productId, item.url);
      }
      return urls;
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (productId: string) => {
      if (!buyerId) throw new Error("Azienda non disponibile");
      if (favoritesQuery.data?.has(productId)) {
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti", buyerId, sellerId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const chooseUnit = useMutation({
    mutationFn: async (input: { productId: string; productSaleUnitId: string }) => {
      if (!buyerId) throw new Error("Azienda non disponibile");
      await saveUnitPreference({
        buyerCompanyId: buyerId,
        sellerCompanyId: sellerId,
        productId: input.productId,
        productSaleUnitId: input.productSaleUnitId,
        userId: identity?.userId ?? null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["catalogo-um-preferite", buyerId] });
      void queryClient.invalidateQueries({ queryKey: ["catalogo-um-preferita", buyerId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const categories = useMemo(
    () =>
      Array.from(
        new Set((productsQuery.data ?? []).map((p) => p.category).filter((c): c is string => Boolean(c))),
      ).sort(),
    [productsQuery.data],
  );

  const favorites = favoritesQuery.data ?? new Set<string>();

  const rows: CatalogProduct[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    const preferences = unitsQuery.data ?? new Map<string, string>();
    return (productsQuery.data ?? [])
      .filter((product) => {
        if (category !== "tutte" && product.category !== category) return false;
        if (onlyFavorites && !favorites.has(product.id)) return false;
        if (!term) return true;
        return (
          product.code.toLowerCase().includes(term) ||
          (product.description ?? "").toLowerCase().includes(term)
        );
      })
      .map((product) => ({
        id: product.id,
        sellerId,
        sellerName,
        code: product.code,
        description: product.description,
        category: product.category,
        danea_um: product.danea_um,
        units: sortedSaleUnits(product),
        selectedUnitId: resolveSaleUnit(product, preferences.get(product.id))?.id ?? null,
        price: pricesQuery.data?.get(product.id) ?? null,
        priceUnit: priceUnitCode(product),
        availability: product.commercial_availability,
      }));
  }, [
    category,
    favorites,
    onlyFavorites,
    pricesQuery.data,
    productsQuery.data,
    search,
    sellerId,
    sellerName,
    unitsQuery.data,
  ]);

  const hasPrices = (pricesQuery.data?.size ?? 0) > 0;

  if (!operational) {
    return (
      <AppShell title="Catalogo" description="Questo catalogo non è disponibile.">
        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Il collegamento con questo fornitore non è attivo dai due lati, quindi il catalogo non è
            visibile.
          </p>
          <Button asChild size="sm">
            <Link to="/collegamenti">Vai a Collegamenti</Link>
          </Button>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={sellerName}
      description={
        hasPrices
          ? "Prezzi del listino che questo fornitore ti ha assegnato."
          : "Prezzi confermati dal fornitore in fase d'ordine."
      }
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/acquisti/catalogo">Tutti i fornitori</Link>
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca per codice o descrizione…"
          className="w-full sm:w-72"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le categorie</SelectItem>
            {categories.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyFavorites ? "secondary" : "outline"}
          size="sm"
          onClick={() => setOnlyFavorites((current) => !current)}
        >
          Solo preferiti
        </Button>
      </div>

      {productsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento del catalogo…</p>
      ) : (
        <CatalogList
          products={rows}
          imageUrls={imagesQuery.data ?? new Map()}
          favorites={favorites}
          onToggleFavorite={(product) => toggleFavorite.mutate(product.id)}
          onSelectUnit={(product, unitId) =>
            chooseUnit.mutate({ productId: product.id, productSaleUnitId: unitId })
          }
        />
      )}
    </AppShell>
  );
}
