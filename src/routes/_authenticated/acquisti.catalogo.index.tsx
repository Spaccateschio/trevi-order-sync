import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { CatalogList, type CatalogProduct } from "@/components/catalog/catalog-list";
import { fetchPriceSeriesForCatalog } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeCompany,
  companyBuys,
  isRelationOperational,
  useIdentity,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAssignedPrices,
  fetchSellerCatalogue,
  fetchUnitPreferences,
  priceUnitCode,
  resolveSaleUnit,
  saveUnitPreference,
  sortedSaleUnits,
  type CatalogProductRow,
} from "@/lib/catalog";
import {
  favoriteToggleMessage,
  invalidateAfterFavoriteChange,
  toggleCatalogFavorite,
} from "@/lib/catalog-favorites";
import { getCatalogImageUrls } from "@/lib/catalog.functions";

export const Route = createFileRoute("/_authenticated/acquisti/catalogo/")({
  head: () => ({
    meta: [
      { title: "Catalogo fornitori — Trevi Fruit" },
      {
        name: "description",
        content:
          "Le vetrine dei fornitori con cui hai un collegamento attivo e l'elenco unico di tutti i loro prodotti, con prezzi assegnati e preferiti.",
      },
      { property: "og:title", content: "Catalogo fornitori — Trevi Fruit" },
      {
        property: "og:description",
        content: "Vetrine dei fornitori collegati e catalogo unico di tutti i loro prodotti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogoIndex,
});

type SellerCatalogue = { sellerId: string; sellerName: string; products: CatalogProductRow[] };

function CatalogoIndex() {
  const { data: identity, isLoading } = useIdentity();
  const queryClient = useQueryClient();
  const company = activeCompany(identity);
  const buyerId = company?.companyId ?? null;
  const signImages = useServerFn(getCatalogImageUrls);

  const [view, setView] = useState<"vetrine" | "prodotti">("vetrine");
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("tutti");
  const [category, setCategory] = useState("tutte");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyWithPrice, setOnlyWithPrice] = useState(false);

  const relations = (identity?.relations ?? []).filter((r) => r.buyerCompanyId === buyerId);
  const operational = relations.filter(isRelationOperational);
  const suspended = relations.filter(
    (r) => !isRelationOperational(r) && (r.status === "attivo" || r.status === "sospeso"),
  );
  const sellers = operational.map((r) => ({
    sellerId: r.sellerCompanyId,
    sellerName: r.sellerCompanyName ?? "Fornitore",
  }));
  const sellerKey = sellers.map((s) => s.sellerId).join(",");

  /** Un catalogo per fornitore: i prezzi restano sempre per fornitore (buyer_catalog_prices). */
  const cataloguesQuery = useQuery({
    queryKey: ["catalogo-globale", buyerId, sellerKey],
    enabled: sellers.length > 0,
    queryFn: async () => {
      const result: SellerCatalogue[] = [];
      for (const seller of sellers) {
        const products = await fetchSellerCatalogue(seller.sellerId);
        result.push({ ...seller, products });
      }
      return result;
    },
  });

  const pricesQuery = useQuery({
    queryKey: ["catalogo-globale-prezzi", buyerId, sellerKey, cataloguesQuery.data?.length ?? 0],
    enabled: Boolean(cataloguesQuery.data?.length),
    queryFn: async () => {
      const prices = new Map<string, number>();
      for (const entry of cataloguesQuery.data ?? []) {
        const ids = entry.products.map((product) => product.id);
        if (!ids.length) continue;
        const sellerPrices = await fetchAssignedPrices(entry.sellerId, ids);
        for (const [productId, value] of sellerPrices) prices.set(productId, value);
      }
      return prices;
    },
  });

  const favoritesQuery = useQuery({
    queryKey: ["catalogo-preferiti-tutti", buyerId],
    enabled: Boolean(buyerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyer_product_favorites")
        .select("product_id")
        .eq("buyer_company_id", buyerId!);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((row) => row.product_id));
    },
  });

  const unitsQuery = useQuery({
    queryKey: ["catalogo-um-preferite", buyerId, "tutti"],
    enabled: Boolean(buyerId),
    queryFn: () => fetchUnitPreferences(buyerId!),
  });

  // Andamento prezzo in sola lettura: nessuna osservazione viene creata qui.
  const seriesQuery = useQuery({
    queryKey: ["catalogo-andamento-prezzo", buyerId, sellerKey, cataloguesQuery.data?.length ?? 0],
    enabled: Boolean(buyerId && cataloguesQuery.data?.length),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      fetchPriceSeriesForCatalog(
        buyerId!,
        (cataloguesQuery.data ?? []).flatMap((entry) => entry.products.map((product) => product.id)),
      ),
  });

  const imagesQuery = useQuery({
    queryKey: ["catalogo-globale-immagini", buyerId, sellerKey, cataloguesQuery.data?.length ?? 0],
    enabled: Boolean(cataloguesQuery.data?.length),
    queryFn: async () => {
      const urls = new Map<string, string>();
      for (const entry of cataloguesQuery.data ?? []) {
        const withImage = entry.products
          .filter((product) => product.product_images)
          .map((product) => product.id);
        for (let index = 0; index < withImage.length; index += 60) {
          const chunk = withImage.slice(index, index + 60);
          if (!chunk.length) continue;
          const result = await signImages({
            data: { sellerCompanyId: entry.sellerId, productIds: chunk, thumbnail: true },
          });
          for (const item of result) urls.set(item.productId, item.url);
        }
      }
      return urls;
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (product: CatalogProduct) => {
      if (!buyerId) throw new Error("Azienda non disponibile");
      return toggleCatalogFavorite({
        buyerCompanyId: buyerId,
        sellerCompanyId: product.sellerId,
        productId: product.id,
        userId: identity?.userId ?? null,
        isFavorite: Boolean(favoritesQuery.data?.has(product.id)),
      });
    },
    onSuccess: (result) => {
      toast.success(favoriteToggleMessage(result));
      invalidateAfterFavoriteChange(queryClient, buyerId);
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const chooseUnit = useMutation({
    mutationFn: async (input: { product: CatalogProduct; productSaleUnitId: string }) => {
      if (!buyerId) throw new Error("Azienda non disponibile");
      await saveUnitPreference({
        buyerCompanyId: buyerId,
        sellerCompanyId: input.product.sellerId,
        productId: input.product.id,
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
        new Set(
          (cataloguesQuery.data ?? [])
            .flatMap((entry) => entry.products.map((product) => product.category))
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [cataloguesQuery.data],
  );

  const favorites = favoritesQuery.data ?? new Set<string>();

  const rows: CatalogProduct[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    const preferences = unitsQuery.data ?? new Map<string, string>();
    const result: CatalogProduct[] = [];
    for (const entry of cataloguesQuery.data ?? []) {
      if (sellerFilter !== "tutti" && entry.sellerId !== sellerFilter) continue;
      for (const product of entry.products) {
        if (category !== "tutte" && product.category !== category) continue;
        if (onlyFavorites && !favorites.has(product.id)) continue;
        const price = pricesQuery.data?.get(product.id) ?? null;
        if (onlyWithPrice && price === null) continue;
        if (
          term &&
          !product.code.toLowerCase().includes(term) &&
          !(product.description ?? "").toLowerCase().includes(term)
        )
          continue;
        result.push({
          id: product.id,
          sellerId: entry.sellerId,
          sellerName: entry.sellerName,
          code: product.code,
          description: product.description,
          category: product.category,
          danea_um: product.danea_um,
          units: sortedSaleUnits(product),
          selectedUnitId: resolveSaleUnit(product, preferences.get(product.id))?.id ?? null,
          price,
          priceUnit: priceUnitCode(product),
          availability: product.commercial_availability,
        });
      }
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }, [
    cataloguesQuery.data,
    category,
    favorites,
    onlyFavorites,
    onlyWithPrice,
    pricesQuery.data,
    search,
    sellerFilter,
    unitsQuery.data,
  ]);

  if (!isLoading && !companyBuys(identity)) {
    return (
      <AppShell title="Catalogo" description="Area riservata alle aziende che acquistano.">
        <p className="text-sm text-muted-foreground">
          Il profilo di acquisto non è attivo per la tua azienda. Un amministratore può attivarlo
          dalla pagina Azienda.
        </p>
      </AppShell>
    );
  }

  const counts = new Map<string, number>(
    (cataloguesQuery.data ?? []).map((entry) => [entry.sellerId, entry.products.length]),
  );

  return (
    <AppShell title="Catalogo" description="I fornitori collegati e i loro prodotti in vetrina.">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={view === "vetrine" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("vetrine")}
        >
          Vetrine
        </Button>
        <Button
          variant={view === "prodotti" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("prodotti")}
        >
          Tutti i prodotti
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !operational.length ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Non hai ancora fornitori collegati e operativi: il catalogo compare appena un
            collegamento è attivo dai due lati.
          </p>
          <Button asChild size="sm">
            <Link to="/collegamenti">Vai a Collegamenti</Link>
          </Button>
        </section>
      ) : view === "vetrine" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operational.map((relation) => (
            <Link
              key={relation.id}
              to="/acquisti/catalogo/$sellerId"
              params={{ sellerId: relation.sellerCompanyId }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-accent"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15">
                <Store className="h-4 w-4 text-accent" aria-hidden="true" />
              </span>
              <span className="mt-3 block font-semibold">
                {relation.sellerCompanyName ?? "Fornitore"}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {cataloguesQuery.isLoading
                  ? "Conteggio prodotti…"
                  : `${counts.get(relation.sellerCompanyId) ?? 0} prodotti in vetrina`}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca per codice o descrizione…"
              className="w-full sm:w-72"
            />
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Fornitore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i fornitori</SelectItem>
                {sellers.map((seller) => (
                  <SelectItem key={seller.sellerId} value={seller.sellerId}>
                    {seller.sellerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-52">
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
            <Button
              variant={onlyWithPrice ? "secondary" : "outline"}
              size="sm"
              onClick={() => setOnlyWithPrice((current) => !current)}
            >
              Solo con prezzo
            </Button>
          </div>

          {cataloguesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento dei cataloghi…</p>
          ) : (
            <CatalogList
              products={rows}
              imageUrls={imagesQuery.data ?? new Map()}
              favorites={favorites}
              priceSeries={seriesQuery.data}
              showSeller
              onToggleFavorite={(product) => toggleFavorite.mutate(product)}
              onSelectUnit={(product, unitId) =>
                chooseUnit.mutate({ product, productSaleUnitId: unitId })
              }
            />
          )}
        </>
      )}

      {suspended.length ? (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Cataloghi non disponibili</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {suspended.map((relation) => (
              <li key={relation.id}>
                {relation.sellerCompanyName ?? "Fornitore"} — collegamento sospeso da uno dei due
                lati
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
