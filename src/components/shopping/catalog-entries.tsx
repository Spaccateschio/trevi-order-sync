import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, Plus, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activeCompany, isRelationOperational, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { fetchSellerCatalogue } from "@/lib/catalog";
import { getCatalogImageUrls } from "@/lib/catalog.functions";
import { catalogSupplierLabel } from "@/lib/card-labels";
import { parseQuantity } from "@/lib/inventory";
import {
  adoptCatalogProduct,
  getFavoriteProductIds,
  manageCatalogProductFavorite,
  manageCompanyProductFavorite,
} from "@/lib/inventory-count.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { addShoppingListItems } from "@/lib/shopping-list.functions";
import { cn } from "@/lib/utils";

const MANUAL = "__manuale__";

/**
 * Prodotto mostrabile nella vista unica della Lista quando ★ Preferiti è spento.
 * Solo lettura di dati esistenti: le referenze B2B restano del fornitore finché non si
 * mette la stella o si preme Aggiungi (logiche d'importazione già esistenti).
 */
export type CatalogEntry = {
  key: string;
  ownProductId: string | null;
  sellerId: string | null;
  sellerProductId: string | null;
  code: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  baseUm: string | null;
  /** Anagrafiche fornitore (supplier_records) per il filtro unico della pagina. */
  supplierRecordIds: string[];
  supplierNames: string[];
  unitCodes: string[];
  isB2b: boolean;
};

export function useCatalogEntries({ companyId, archiveId, enabled }: { companyId: string; archiveId: string; enabled: boolean }) {
  const { data: identity } = useIdentity();
  const company = activeCompany(identity);
  const readFavorites = useServerFn(getFavoriteProductIds);

  const productsQuery = useQuery({
    queryKey: ["shopping-add-products", companyId, archiveId],
    enabled: enabled && Boolean(archiveId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, category, subcategory, danea_um, created_from_product_id")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as {
        id: string;
        code: string;
        description: string | null;
        category: string | null;
        subcategory: string | null;
        danea_um: string | null;
        created_from_product_id: string | null;
      }[];
    },
  });

  const linksQuery = useQuery({
    queryKey: ["shopping-add-links", companyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select("product_id, supplier_record_id, purchase_unit_id, supplier_records(legal_name), units_of_measure!purchase_unit_id(code)")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as {
        product_id: string;
        supplier_record_id: string | null;
        supplier_records: { legal_name: string } | null;
        units_of_measure: { code: string } | null;
      }[];
    },
  });

  /** Fornitori con rapporto operativo: il vero proprietario del catalogo e la sua anagrafica fornitore. */
  const sellers = useMemo(
    () =>
      (identity?.relations ?? [])
        .filter((r) => r.buyerCompanyId === company?.companyId && isRelationOperational(r))
        .map((r) => ({ sellerId: r.sellerCompanyId, sellerName: r.sellerCompanyName ?? "Fornitore", recordId: r.supplierRecordId })),
    [identity, company],
  );
  const sellerKey = sellers.map((s) => s.sellerId).join(",");

  const cataloguesQuery = useQuery({
    queryKey: ["shopping-add-catalogues", companyId, sellerKey],
    enabled: enabled && sellers.length > 0,
    queryFn: async () => {
      const result = [];
      for (const seller of sellers) result.push({ ...seller, products: await fetchSellerCatalogue(seller.sellerId) });
      return result;
    },
  });

  const entries = useMemo<CatalogEntry[]>(() => {
    const byProduct = new Map<string, { ids: Set<string>; names: Set<string>; units: Set<string> }>();
    for (const link of linksQuery.data ?? []) {
      const e = byProduct.get(link.product_id) ?? { ids: new Set<string>(), names: new Set<string>(), units: new Set<string>() };
      if (link.supplier_record_id) e.ids.add(link.supplier_record_id);
      if (link.supplier_records?.legal_name) e.names.add(link.supplier_records.legal_name);
      if (link.units_of_measure?.code) e.units.add(link.units_of_measure.code);
      byProduct.set(link.product_id, e);
    }
    const own: CatalogEntry[] = (productsQuery.data ?? []).map((p) => {
      const l = byProduct.get(p.id);
      const units = new Set<string>();
      if (p.danea_um) units.add(p.danea_um);
      for (const c of l?.units ?? []) units.add(c);
      return {
        key: `own:${p.id}`,
        ownProductId: p.id,
        sellerId: null,
        sellerProductId: null,
        code: p.code,
        description: p.description,
        category: p.category,
        subcategory: p.subcategory,
        baseUm: p.danea_um,
        supplierRecordIds: [...(l?.ids ?? [])],
        supplierNames: [...(l?.names ?? [])],
        unitCodes: [...units],
        isB2b: false,
      };
    });
    const owned = new Set((productsQuery.data ?? []).map((p) => p.created_from_product_id).filter(Boolean));
    const b2b: CatalogEntry[] = [];
    for (const cat of cataloguesQuery.data ?? []) {
      for (const p of cat.products) {
        if (owned.has(p.id)) continue;
        b2b.push({
          key: `cat:${p.id}`,
          ownProductId: null,
          sellerId: cat.sellerId,
          sellerProductId: p.id,
          code: p.code,
          description: p.description,
          category: p.category,
          subcategory: p.subcategory,
          baseUm: p.danea_um,
          supplierRecordIds: cat.recordId ? [cat.recordId] : [],
          supplierNames: [cat.sellerName],
          unitCodes: p.product_sale_units.map((u) => u.units_of_measure?.code).filter((c): c is string => Boolean(c)),
          isB2b: true,
        });
      }
    }
    return [...own, ...b2b];
  }, [productsQuery.data, linksQuery.data, cataloguesQuery.data]);

  const favoriteIds = useMemo(() => (productsQuery.data ?? []).map((p) => p.id).sort().slice(0, 500), [productsQuery.data]);
  const favoritesQuery = useQuery({
    queryKey: ["shopping-extras-favorites", companyId, "add", favoriteIds],
    enabled: enabled && favoriteIds.length > 0,
    queryFn: async () => new Set(await readFavorites({ data: { companyId, productIds: favoriteIds } })),
  });

  return {
    entries,
    favorites: favoritesQuery.data ?? new Set<string>(),
    favoritesReady: Boolean(favoritesQuery.data) || favoriteIds.length === 0,
    loading: productsQuery.isLoading || linksQuery.isLoading || cataloguesQuery.isLoading,
  };
}

/** Immagini: foto propria per i prodotti propri, foto originale del fornitore (stessa fonte del Catalogo B2B) per le referenze B2B. */
export function useCatalogImages(visible: CatalogEntry[]) {
  const getOwn = useServerFn(getProductImageUrls);
  const getCatalog = useServerFn(getCatalogImageUrls);
  const ownIds = visible.map((e) => e.ownProductId).filter((id): id is string => Boolean(id)).slice(0, 50);
  const bySeller = new Map<string, string[]>();
  for (const e of visible) {
    if (!e.sellerId || !e.sellerProductId) continue;
    const list = bySeller.get(e.sellerId) ?? [];
    if (list.length < 60) list.push(e.sellerProductId);
    bySeller.set(e.sellerId, list);
  }
  const sellerKey = [...bySeller.entries()].map(([s, ids]) => `${s}:${ids.join(",")}`).join("|");
  const query = useQuery({
    queryKey: ["shopping-catalog-images", ownIds.join(","), sellerKey],
    enabled: ownIds.length > 0 || bySeller.size > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: async () => {
      const map = new Map<string, string>();
      if (ownIds.length) for (const i of await getOwn({ data: { productIds: ownIds, thumbnail: true } })) if (i.url) map.set(`own:${i.productId}`, i.url);
      for (const [sellerCompanyId, productIds] of bySeller) {
        try {
          for (const i of await getCatalog({ data: { sellerCompanyId, productIds, thumbnail: true } })) map.set(`cat:${i.productId}`, i.url);
        } catch {
          // nessuna foto disponibile: resta il segnaposto
        }
      }
      return map;
    },
  });
  return query.data ?? new Map<string, string>();
}

/** Azioni esplicite: ★ (logica Catalogo B2B esistente) e Aggiungi (eventuale importazione esistente, poi riga di Lista). */
export function useCatalogActions({
  companyId,
  listId,
  resolveListId,
}: {
  companyId: string;
  listId: string | null;
  resolveListId?: () => Promise<string | null>;
}) {
  const queryClient = useQueryClient();
  const runFavorite = useServerFn(manageCompanyProductFavorite);
  const runCatalogFavorite = useServerFn(manageCatalogProductFavorite);
  const runAdopt = useServerFn(adoptCatalogProduct);
  const runAdd = useServerFn(addShoppingListItems);

  const refresh = () =>
    Promise.all(
      [
        ["shopping-add-products", companyId],
        ["shopping-add-links", companyId],
        ["shopping-extras-favorites", companyId],
        ["company-has-favorites", companyId],
        ["inventario-catalogo-candidati", companyId],
        ["inventario-preferiti-prodotti"],
        ["catalogo-preferiti"],
        ["shopping-list-overview"],
        ["shopping-filter-links", companyId],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );

  const favorite = useMutation({
    mutationFn: async ({ entry, value }: { entry: CatalogEntry; value: boolean }) => {
      if (entry.ownProductId) return runFavorite({ data: { companyId, productId: entry.ownProductId, favorite: value } });
      await runCatalogFavorite({ data: { companyId, sellerCompanyId: entry.sellerId!, sellerProductId: entry.sellerProductId!, favorite: true } });
      await runAdopt({ data: { companyId, sellerCompanyId: entry.sellerId!, sellerProductId: entry.sellerProductId! } });
      return undefined;
    },
    onSuccess: async (_r, { value }) => {
      await refresh();
      toast.success(value ? "Messo nei preferiti" : "Tolto dai preferiti");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async ({ entry, quantity, unitCode }: { entry: CatalogEntry; quantity: number; unitCode: string | null }) => {
      const targetId = listId ?? (await resolveListId?.()) ?? null;
      if (!targetId) throw new Error("Lista della Spesa non creata");
      let productId = entry.ownProductId;
      if (!productId) {
        const { data, error } = await supabase.rpc("add_catalog_product_to_own_products", {
          _buyer_company_id: companyId,
          _seller_company_id: entry.sellerId!,
          _seller_product_id: entry.sellerProductId!,
        });
        if (error) throw new Error(error.message);
        const res = (data ?? {}) as { product_id?: string; status?: string; message?: string };
        if (res.status === "choose_candidate") throw new Error("Esistono più copie: scegli quale usare dal Catalogo");
        if (res.status === "link_identity_uncertain") {
          throw new Error(res.message ?? "Collegamento esistente senza codice articolo: verifica il collegamento prima di procedere");
        }
        productId = res.product_id ?? null;
        if (!productId) throw new Error(`Prodotto non creato per ${entry.code}`);
      }
      return runAdd({
        data: {
          companyId,
          listId: targetId,
          replaceExisting: false,
          items: [{ product_id: productId, decided_quantity: quantity, decided_unit_code: unitCode, origin: "manuale" }],
        },
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Aggiunto alla Lista");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { favorite, add };
}

/** Card (o riga) di un prodotto non ancora in Lista: stesse proporzioni delle card della Lista. */
export function CatalogProductCard({
  entry,
  imageUrl,
  isFavorite,
  favoriteDisabled,
  layout,
  canAdd,
  adding,
  onToggleFavorite,
  onAdd,
}: {
  entry: CatalogEntry;
  imageUrl: string | null;
  isFavorite: boolean;
  favoriteDisabled: boolean;
  layout: "card" | "row";
  canAdd: boolean;
  adding: boolean;
  onToggleFavorite: () => void;
  onAdd: (quantity: number, unitCode: string | null) => void;
}) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(entry.unitCodes[0] ?? "");
  const [manual, setManual] = useState("");
  const quantity = parseQuantity(qty);
  const unitCode = unit === MANUAL ? manual.trim().toUpperCase() || null : unit || null;
  const ready = canAdd && Boolean(quantity && quantity > 0) && (unit !== MANUAL || Boolean(unitCode));
  const name = entry.description ?? entry.code;
  const supplier = catalogSupplierLabel(entry);

  const star = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-7 w-7 shrink-0 px-0", isFavorite && "text-primary")}
      disabled={favoriteDisabled}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Togli ${entry.code} dai preferiti` : `Metti ${entry.code} nei preferiti`}
      onClick={onToggleFavorite}
    >
      <Star className={cn("size-4", isFavorite && "fill-current")} aria-hidden="true" />
    </Button>
  );
  const image = imageUrl ? (
    <img src={imageUrl} alt="" loading="lazy" className={cn("shrink-0 rounded object-cover", layout === "card" ? "size-14" : "size-9")} />
  ) : (
    <div className={cn("flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground", layout === "card" ? "size-14" : "size-9")}>
      <ImageOff className="size-4" aria-hidden="true" />
    </div>
  );
  const controls = canAdd ? (
    <div className="flex items-center gap-1">
      <Input className="h-8 w-20 text-right text-sm" inputMode="decimal" placeholder="Q.tà" value={qty} aria-label={`Quantità ${entry.code}`} onChange={(e) => setQty(e.target.value)} />
      <Select value={unit} onValueChange={setUnit}>
        <SelectTrigger className="h-8 w-24 text-xs" aria-label={`U.M. acquisto ${entry.code}`}>
          <SelectValue placeholder={entry.baseUm ?? "U.M."} />
        </SelectTrigger>
        <SelectContent>
          {entry.unitCodes.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
          {!entry.isB2b ? <SelectItem value={MANUAL}>Altra U.M.</SelectItem> : null}
        </SelectContent>
      </Select>
      {unit === MANUAL ? (
        <Input className="h-8 w-20 text-xs uppercase" placeholder="U.M." value={manual} aria-label={`Altra U.M. ${entry.code}`} onChange={(e) => setManual(e.target.value)} />
      ) : null}
      <Button type="button" size="sm" className="h-8 gap-1 px-2 text-xs" disabled={!ready || adding} onClick={() => quantity && onAdd(quantity, unitCode)}>
        <Plus className="size-3.5" aria-hidden="true" />
        Aggiungi
      </Button>
    </div>
  ) : null;
  const meta = [entry.code, entry.category, entry.subcategory, entry.baseUm].filter(Boolean).join(" · ");

  if (layout === "row") {
    return (
      <article className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border-2 border-dashed border-border bg-card px-2 py-1.5">
        {image}
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-muted-foreground">{meta}</p>
          <p className="truncate text-muted-foreground">{supplier}{entry.isB2b ? " · catalogo B2B" : ""}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">Non in lista</Badge>
        {star}
        {controls}
      </article>
    );
  }
  return (
    <article className="flex h-full min-w-0 flex-col gap-1.5 rounded-md border-2 border-dashed border-border bg-card p-2">
      <div className="flex items-start gap-2">
        {image}
        <div className="min-w-0 flex-1 text-xs">
          <p className="line-clamp-2 text-sm font-semibold">{name}</p>
          <p className="truncate text-muted-foreground">{meta}</p>
          <p className="truncate text-muted-foreground">{supplier}{entry.isB2b ? " · catalogo B2B" : ""}</p>
        </div>
        {star}
      </div>
      <Badge variant="outline" className="w-fit text-[10px]">Non in lista</Badge>
      {controls}
    </article>
  );
}
