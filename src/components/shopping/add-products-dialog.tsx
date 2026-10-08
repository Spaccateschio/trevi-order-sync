import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, Search, Star } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { fetchSellerCatalogue } from "@/lib/catalog";
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
const PAGE = 100;

type OwnProduct = {
  id: string;
  code: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  danea_um: string | null;
  created_from_product_id: string | null;
};

type Row = {
  key: string;
  /** Prodotto proprio; null = referenza del catalogo fornitore non ancora fra i propri prodotti. */
  ownProductId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  code: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  baseUm: string | null;
  /** Nomi fornitore per il filtro (collegamenti propri o venditore B2B). */
  supplierNames: string[];
  /** U.M. d'acquisto proponibili: codici già configurati. */
  unitCodes: string[];
  /** B2B: solo U.M. pubblicate dal venditore, niente «Altra U.M.». */
  isB2b: boolean;
};

type Draft = { qty: string; unit: string; manual: string };

/**
 * Aggiunta multipla alla Lista: prodotti propri + cataloghi dei fornitori collegati.
 * Filtri per fornitore, categoria e sottocategoria; quantità e U.M. d'acquisto si
 * impostano qui. La referenza di catalogo diventa prodotto proprio con fornitore
 * collegato (add_catalog_product_to_own_products), senza doppioni.
 */
export function AddProductsDialog({
  companyId,
  listId,
  resolveListId,
  archiveId,
  existingProductIds,
  open,
  onOpenChange,
  inline = false,
}: {
  companyId: string;
  /** null = anteprima inventario: la Lista si crea solo al salvataggio tramite resolveListId. */
  listId: string | null;
  resolveListId?: () => Promise<string | null>;
  archiveId: string;
  existingProductIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vista catalogo dentro la pagina (Preferiti spento): nessuna finestra, si vede tutto. */
  inline?: boolean;
}) {
  const queryClient = useQueryClient();
  const runAdd = useServerFn(addShoppingListItems);
  const getImageUrls = useServerFn(getProductImageUrls);
  const readFavorites = useServerFn(getFavoriteProductIds);
  const runFavorite = useServerFn(manageCompanyProductFavorite);
  const runCatalogFavorite = useServerFn(manageCatalogProductFavorite);
  const runAdopt = useServerFn(adoptCatalogProduct);
  const { data: identity } = useIdentity();
  const company = activeCompany(identity);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("tutti");
  const [categoryFilter, setCategoryFilter] = useState("tutte");
  const [subcategoryFilter, setSubcategoryFilter] = useState("tutte");
  const [limit, setLimit] = useState(PAGE);
  /** All'apertura solo i Preferiti; togliendo il filtro si vedono anche i cataloghi B2B. */
  const [favoritesOnly, setFavoritesOnly] = useState(true);
  const [selected, setSelected] = useState<Record<string, Draft>>({});
  /** Ricerca rapida: menu suggerimenti sotto il campo Cerca. */
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const productsQuery = useQuery({
    queryKey: ["shopping-add-products", companyId, archiveId],
    enabled: open,
    queryFn: async (): Promise<OwnProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, category, subcategory, danea_um, created_from_product_id")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as OwnProduct[];
    },
  });

  /** Collegamenti fornitore dei prodotti propri: nomi per il filtro e U.M. d'acquisto configurate. */
  const linksQuery = useQuery({
    queryKey: ["shopping-add-links", companyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_links")
        .select(
          "product_id, supplier_record_id, purchase_unit_id, supplier_records(legal_name), units_of_measure!purchase_unit_id(code)",
        )
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as {
        product_id: string;
        supplier_record_id: string | null;
        purchase_unit_id: string | null;
        supplier_records: { legal_name: string } | null;
        units_of_measure: { code: string } | null;
      }[];
    },
  });

  /** Cataloghi dei fornitori con rapporto operativo (stessa fonte della pagina Catalogo). */
  const sellers = useMemo(() => {
    const relations = (identity?.relations ?? []).filter(
      (r) => r.buyerCompanyId === company?.companyId && isRelationOperational(r),
    );
    return relations.map((r) => ({
      sellerId: r.sellerCompanyId,
      sellerName: r.sellerCompanyName ?? "Fornitore",
    }));
  }, [identity, company]);
  const sellerKey = sellers.map((s) => s.sellerId).join(",");

  const cataloguesQuery = useQuery({
    queryKey: ["shopping-add-catalogues", companyId, sellerKey],
    enabled: open && sellers.length > 0,
    queryFn: async () => {
      const result: { sellerId: string; sellerName: string; products: Awaited<ReturnType<typeof fetchSellerCatalogue>> }[] = [];
      for (const seller of sellers) {
        const products = await fetchSellerCatalogue(seller.sellerId);
        result.push({ ...seller, products });
      }
      return result;
    },
  });

  const rows = useMemo<Row[]>(() => {
    const linksByProduct = new Map<string, { names: Set<string>; units: Set<string> }>();
    for (const link of linksQuery.data ?? []) {
      const entry = linksByProduct.get(link.product_id) ?? { names: new Set<string>(), units: new Set<string>() };
      if (link.supplier_records?.legal_name) entry.names.add(link.supplier_records.legal_name);
      if (link.units_of_measure?.code) entry.units.add(link.units_of_measure.code);
      linksByProduct.set(link.product_id, entry);
    }

    const own: Row[] = (productsQuery.data ?? []).map((p) => {
      const links = linksByProduct.get(p.id);
      const units = new Set<string>();
      if (p.danea_um) units.add(p.danea_um);
      for (const code of links?.units ?? []) units.add(code);
      return {
        key: `own:${p.id}`,
        ownProductId: p.id,
        sellerId: null,
        sellerName: null,
        code: p.code,
        description: p.description,
        category: p.category,
        subcategory: p.subcategory,
        baseUm: p.danea_um,
        supplierNames: [...(links?.names ?? [])],
        unitCodes: [...units],
        isB2b: false,
      };
    });

    // Referenze di catalogo già diventate prodotti propri: non si mostrano due volte.
    const ownedFromCatalog = new Set(
      (productsQuery.data ?? [])
        .map((p) => p.created_from_product_id)
        .filter((id): id is string => Boolean(id)),
    );
    const catalog: Row[] = [];
    for (const cat of cataloguesQuery.data ?? []) {
      for (const p of cat.products) {
        if (ownedFromCatalog.has(p.id)) continue;
        catalog.push({
          key: `cat:${p.id}`,
          ownProductId: null,
          sellerId: cat.sellerId,
          sellerName: cat.sellerName,
          code: p.code,
          description: p.description,
          category: p.category,
          subcategory: p.subcategory,
          baseUm: p.danea_um,
          supplierNames: [cat.sellerName],
          unitCodes: p.product_sale_units
            .map((u) => u.units_of_measure?.code)
            .filter((code): code is string => Boolean(code)),
          isB2b: true,
        });
      }
    }
    // Ordine stabile (descrizione, poi codice): mettere/togliere la stella non sposta nulla.
    return [...own, ...catalog].sort(
      (a, b) =>
        (a.description ?? a.code).localeCompare(b.description ?? b.code, "it") || a.code.localeCompare(b.code, "it"),
    );
  }, [productsQuery.data, linksQuery.data, cataloguesQuery.data]);

  const supplierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) for (const name of row.supplierNames) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b, "it"));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) if (row.category) values.add(row.category);
    return [...values].sort((a, b) => a.localeCompare(b, "it"));
  }, [rows]);

  const subcategoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (categoryFilter !== "tutte" && row.category !== categoryFilter) continue;
      if (row.subcategory) values.add(row.subcategory);
    }
    return [...values].sort((a, b) => a.localeCompare(b, "it"));
  }, [rows, categoryFilter]);

  const favoriteIds = useMemo(
    () => (productsQuery.data ?? []).map((p) => p.id).sort().slice(0, 500),
    [productsQuery.data],
  );
  const favoritesQuery = useQuery({
    queryKey: ["shopping-extras-favorites", companyId, "add", favoriteIds],
    enabled: open && favoriteIds.length > 0,
    queryFn: async () => new Set(await readFavorites({ data: { companyId, productIds: favoriteIds } })),
  });
  // Senza nessun preferito il filtro non avrebbe senso: si vede tutto.
  const hasFavorites = (favoritesQuery.data?.size ?? 0) > 0;
  const applyFavorites = !inline && favoritesOnly && hasFavorites;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      // Una riga già scelta resta sempre visibile (stella, filtri o codice cambiato non la nascondono).
      if (row.key in selected) return true;
      if (applyFavorites && !(row.ownProductId && favoritesQuery.data?.has(row.ownProductId))) return false;
      if (supplierFilter === "senza" && row.supplierNames.length > 0) return false;
      if (supplierFilter !== "tutti" && supplierFilter !== "senza" && !row.supplierNames.includes(supplierFilter))
        return false;
      if (categoryFilter !== "tutte" && row.category !== categoryFilter) return false;
      if (subcategoryFilter !== "tutte" && row.subcategory !== subcategoryFilter) return false;
      if (!term) return true;
      return (
        row.code.toLowerCase().includes(term) ||
        (row.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, supplierFilter, categoryFilter, subcategoryFilter, applyFavorites, favoritesQuery.data, selected]);

  const visible = filtered.slice(0, limit);

  /**
   * Suggerimenti della ricerca rapida: da 2 caratteri, massimo 10.
   * Il filtro Preferiti NON si applica (serve a trovare anche prodotti non preferiti);
   * fornitore, categoria e sottocategoria sì. Ordine: corrispondenza esatta,
   * nome che inizia con il testo, nome che lo contiene, codice corrispondente.
   */
  const suggestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 2) return [];
    const matches = rows.filter((row) => {
      if (supplierFilter === "senza" && row.supplierNames.length > 0) return false;
      if (supplierFilter !== "tutti" && supplierFilter !== "senza" && !row.supplierNames.includes(supplierFilter))
        return false;
      if (categoryFilter !== "tutte" && row.category !== categoryFilter) return false;
      if (subcategoryFilter !== "tutte" && row.subcategory !== subcategoryFilter) return false;
      const name = (row.description ?? "").toLowerCase();
      const code = row.code.toLowerCase();
      return name.includes(term) || code.includes(term);
    });
    const rank = (row: Row) => {
      const name = (row.description ?? "").toLowerCase();
      const code = row.code.toLowerCase();
      if (name === term || code === term) return 0;
      if (name.startsWith(term)) return 1;
      if (name.includes(term)) return 2;
      return 3;
    };
    return matches
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.description ?? a.code).localeCompare(b.description ?? b.code, "it") ||
          a.code.localeCompare(b.code, "it"),
      )
      .slice(0, 10);
  }, [rows, search, supplierFilter, categoryFilter, subcategoryFilter]);

  const imageIds = useMemo(() => {
    const ids = visible.map((row) => row.ownProductId).filter((id): id is string => Boolean(id));
    for (const row of suggestions) if (row.ownProductId) ids.push(row.ownProductId);
    return [...new Set(ids)].slice(0, 50);
  }, [visible, suggestions]);
  const imagesQuery = useQuery({
    queryKey: ["shopping-add-images", imageIds],
    enabled: open && imageIds.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: () => getImageUrls({ data: { productIds: imageIds, thumbnail: true } }),
  });
  const images = useMemo(
    () => new Map((imagesQuery.data ?? []).map((image) => [image.productId, image.url])),
    [imagesQuery.data],
  );

  const favoriteMutation = useMutation({
    mutationFn: async (input: { productId: string | null; row?: Row; favorite: boolean }) => {
      if (input.productId) {
        return runFavorite({ data: { companyId, productId: input.productId, favorite: input.favorite } });
      }
      // Referenza B2B: stella del Catalogo + stesso meccanismo d'importazione del Catalogo
      // (prodotto proprio con fornitore collegato, nessun doppione).
      const row = input.row!;
      const sellerProductId = row.key.slice(4);
      await runCatalogFavorite({
        data: { companyId, sellerCompanyId: row.sellerId!, sellerProductId, favorite: true },
      });
      const adopted = await runAdopt({ data: { companyId, sellerCompanyId: row.sellerId!, sellerProductId } });
      // La referenza B2B diventa prodotto proprio: la riga cambia identità, quindi la scelta
      // (quantità e U.M. già scritte) passa alla nuova riga invece di sparire.
      const newKey = `own:${adopted.productId}`;
      setSelected((current) => {
        if (!(row.key in current)) return current;
        const { [row.key]: draft, ...rest } = current;
        return { ...rest, [newKey]: draft };
      });
      return { favorite: true };
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping-add-products", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-add-links", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-catalogo-candidati", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["company-has-favorites", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-favorites", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-preferiti-prodotti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti"] }),
      ]);
      toast.success(
        input.favorite
          ? "Preferito: lo ritrovi nei Preferiti di Lista della Spesa e Inventario"
          : "Tolto dai preferiti",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedKeys = Object.keys(selected);
  const missingQuantity = selectedKeys.filter((key) => {
    const value = parseQuantity(selected[key]?.qty ?? "");
    return !value || value <= 0;
  });
  const missingUnit = selectedKeys.filter((key) => {
    const draft = selected[key];
    return draft?.unit === MANUAL && !draft.manual.trim();
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const targetId = listId ?? (await resolveListId?.()) ?? null;
      if (!targetId) throw new Error("Lista della Spesa non creata");
      const byKey = new Map(rows.map((row) => [row.key, row]));
      const items: {
        product_id: string;
        decided_quantity: number | null;
        decided_unit_code: string | null;
        origin: "manuale";
      }[] = [];
      for (const key of selectedKeys) {
        const row = byKey.get(key);
        if (!row) continue;
        let productId = row.ownProductId;
        if (!productId) {
          // Referenza di catalogo: diventa prodotto proprio con il fornitore già collegato.
          const { data, error } = await supabase.rpc("add_catalog_product_to_own_products", {
            _buyer_company_id: companyId,
            _seller_company_id: row.sellerId!,
            _seller_product_id: key.slice(4),
          });
          if (error) throw new Error(error.message);
          productId = (data as { product_id?: string } | null)?.product_id ?? null;
          if (!productId) throw new Error(`Prodotto non creato per ${row.code}`);
        }
        const draft = selected[key] ?? { qty: "", unit: "", manual: "" };
        const unitCode = draft.unit === MANUAL ? draft.manual.trim().toUpperCase() : draft.unit || null;
        items.push({
          product_id: productId,
          decided_quantity: parseQuantity(draft.qty) ?? null,
          decided_unit_code: unitCode,
          origin: "manuale",
        });
      }
      return runAdd({
        data: { companyId, listId: targetId, replaceExisting: false, items },
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["shopping-add-products", companyId] });
      toast.success(
        `${result.added} prodott${result.added === 1 ? "o aggiunto" : "i aggiunti"}` +
          (result.skipped ? ` · ${result.skipped} già in lista` : ""),
      );
      setSelected({});
      if (!inline) {
        setSearch("");
        onOpenChange(false);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Scelta dal menu suggerimenti: seleziona subito il prodotto e mostra quantità/U.M. nella lista. */
  const pickSuggestion = (row: Row) => {
    setSelected((current) =>
      row.key in current ? current : { ...current, [row.key]: { qty: "", unit: "", manual: "" } },
    );
    // Il prodotto scelto deve vedersi subito con quantità e U.M.: il filtro Preferiti
    // potrebbe nasconderlo, quindi si spegne e la ricerca mostra solo lui.
    setFavoritesOnly(false);
    setSearch(row.code);
    setSuggestOpen(false);
    setActiveSuggestion(0);
    searchInputRef.current?.focus();
  };

  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[key] = next[key] ?? { qty: "", unit: "", manual: "" };
      else delete next[key];
      return next;
    });

  const patch = (key: string, part: Partial<Draft>) =>
    setSelected((current) => ({
      ...current,
      [key]: { qty: "", unit: "", manual: "", ...current[key], ...part },
    }));

  const loading = productsQuery.isLoading || linksQuery.isLoading || cataloguesQuery.isLoading;

  const header = inline ? (
    <p className="text-xs text-muted-foreground">
      Tutti i prodotti: tuoi, dei fornitori collegati e dei cataloghi B2B. Quelli già nella Lista sono evidenziati
      con «In lista»; per gli altri spunta, scrivi quantità e U.M. e premi Aggiungi.
    </p>
  ) : (
    <>
        <DialogHeader>
          <DialogTitle>Aggiungi prodotti</DialogTitle>
          <DialogDescription>
            Vedi tutto quello che puoi comprare: i tuoi prodotti e i cataloghi dei fornitori collegati. Filtra per
            fornitore, categoria o sottocategoria, scegli quantità e U.M. d'acquisto. Con la stella ★ il prodotto
            diventa preferito e lo ritroverai nei prossimi Inventari.
          </DialogDescription>
        </DialogHeader>
    </>
  );

  const body = (
    <>
        {header}
        {!inline ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={applyFavorites ? "default" : "outline"}
            className="h-8 gap-1"
            aria-pressed={applyFavorites}
            disabled={!hasFavorites}
            onClick={() => {
              setFavoritesOnly((value) => !value);
              setLimit(PAGE);
            }}
          >
            <Star className={cn("size-3.5", applyFavorites && "fill-current")} aria-hidden="true" />
            Preferiti
          </Button>
          <span className="text-xs text-muted-foreground">
            {applyFavorites
              ? "Solo preferiti. Tocca per vedere tutti i prodotti, anche dei fornitori B2B."
              : "Tutti i prodotti: tuoi e dei fornitori B2B collegati."}
          </span>
        </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              className="h-8 pl-8 text-sm"
              autoFocus={!inline}
              value={search}
              placeholder="Codice o descrizione"
              aria-label="Cerca prodotto da aggiungere"
              aria-expanded={suggestOpen && suggestions.length > 0}
              aria-controls="suggerimenti-rapidi"
              role="combobox"
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(PAGE);
                setSuggestOpen(true);
                setActiveSuggestion(0);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => {
                // Ritardo per permettere il click sul suggerimento prima della chiusura.
                window.setTimeout(() => setSuggestOpen(false), 150);
              }}
              onKeyDown={(event) => {
                if (!suggestOpen || suggestions.length === 0) {
                  if (event.key === "Escape") setSuggestOpen(false);
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSuggestion((i) => (i + 1) % suggestions.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const row = suggestions[activeSuggestion] ?? suggestions[0];
                  if (row) pickSuggestion(row);
                } else if (event.key === "Escape") {
                  setSuggestOpen(false);
                }
              }}
            />
            {suggestOpen && suggestions.length > 0 ? (
              <ul
                id="suggerimenti-rapidi"
                role="listbox"
                aria-label="Suggerimenti prodotti"
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
              >
                {suggestions.map((row, index) => {
                  const fav = row.ownProductId ? (favoritesQuery.data?.has(row.ownProductId) ?? false) : false;
                  const inList = row.ownProductId ? existingProductIds.has(row.ownProductId) : false;
                  return (
                    <li key={row.key} role="option" aria-selected={index === activeSuggestion}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 px-2 py-1.5 text-left",
                          index === activeSuggestion && "bg-accent",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickSuggestion(row)}
                        onMouseEnter={() => setActiveSuggestion(index)}
                      >
                        <Thumb url={row.ownProductId ? (images.get(row.ownProductId) ?? null) : null} />
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="block truncate font-medium">{row.description ?? row.code}</span>
                          <span className="block truncate text-muted-foreground">
                            <span className="font-mono">{row.code}</span>
                            {row.baseUm ? ` · ${row.baseUm}` : ""}
                            {" · "}
                            {catalogSupplierLabel(row)}
                          </span>
                        </span>
                        {inList ? (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">In lista</Badge>
                        ) : null}
                        <Star
                          className={cn("size-3.5 shrink-0", fav ? "fill-current text-primary" : "text-muted-foreground/40")}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <Select
            value={supplierFilter}
            onValueChange={(value) => {
              setSupplierFilter(value);
              setLimit(PAGE);
            }}
          >
            <SelectTrigger className="h-8 text-sm" aria-label="Filtra per fornitore">
              <SelectValue placeholder="Fornitore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i fornitori</SelectItem>
              {supplierOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              <SelectItem value="senza">Nessun fornitore collegato</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={categoryFilter}
            onValueChange={(value) => {
              setCategoryFilter(value);
              setSubcategoryFilter("tutte");
              setLimit(PAGE);
            }}
          >
            <SelectTrigger className="h-8 text-sm" aria-label="Filtra per categoria">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le categorie</SelectItem>
              {categoryOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={subcategoryFilter}
            onValueChange={(value) => {
              setSubcategoryFilter(value);
              setLimit(PAGE);
            }}
          >
            <SelectTrigger className="h-8 text-sm" aria-label="Filtra per sottocategoria">
              <SelectValue placeholder="Sottocategoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le sottocategorie</SelectItem>
              {subcategoryOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ul className={inline ? "divide-y divide-border rounded-md border border-border" : "min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border"}>
          {visible.map((row) => {
            const inList = row.ownProductId ? existingProductIds.has(row.ownProductId) : false;
            const isSelected = row.key in selected;
            const draft = selected[row.key];
            return (
              <li
                key={row.key}
                className={cn(
                  "flex items-center gap-2 px-2 py-1",
                  inList && (inline ? "border-l-4 border-l-primary bg-primary/10" : "opacity-60"),
                )}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={inList}
                  aria-label={`Scegli ${row.code}`}
                  onCheckedChange={(checked) => toggle(row.key, checked === true)}
                />
                <Thumb url={row.ownProductId ? (images.get(row.ownProductId) ?? null) : null} />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-medium">{row.description ?? row.code}</p>
                  <p className="truncate text-muted-foreground">
                    <span className="font-mono">{row.code}</span>
                    {row.category ? ` · ${row.category}` : ""}
                    {row.subcategory ? ` · ${row.subcategory}` : ""}
                    {row.baseUm ? ` · ${row.baseUm}` : ""}
                  </p>
                  <p className="truncate text-muted-foreground">
                    {catalogSupplierLabel(row)}
                  </p>
                </div>
                {(() => {
                  const fav = row.ownProductId ? (favoritesQuery.data?.has(row.ownProductId) ?? false) : false;
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn("h-7 w-7 shrink-0 px-0", fav && "text-primary")}
                      disabled={favoriteMutation.isPending || (Boolean(row.ownProductId) && !favoritesQuery.data)}
                      aria-pressed={fav}
                      aria-label={fav ? `Togli ${row.code} dai preferiti` : `Metti ${row.code} nei preferiti`}
                      title={fav ? "Togli dai preferiti" : "Metti nei preferiti"}
                      onClick={() =>
                        favoriteMutation.mutate({ productId: row.ownProductId, row, favorite: !fav })
                      }
                    >
                      <Star className={cn("size-3.5", fav && "fill-current")} aria-hidden="true" />
                    </Button>
                  );
                })()}
                {inList ? (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{inline ? "In lista" : "Già in lista"}</Badge>
                ) : isSelected && draft ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Input
                      className="h-7 w-20 text-xs"
                      inputMode="decimal"
                      placeholder="Q.tà"
                      value={draft.qty}
                      aria-label={`Quantità ${row.code}`}
                      onChange={(event) => patch(row.key, { qty: event.target.value })}
                    />
                    <Select
                      value={draft.unit}
                      onValueChange={(value) => patch(row.key, { unit: value })}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs" aria-label={`U.M. acquisto ${row.code}`}>
                        <SelectValue placeholder={row.baseUm ?? "U.M."} />
                      </SelectTrigger>
                      <SelectContent>
                        {row.unitCodes.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                        {!row.isB2b ? <SelectItem value={MANUAL}>Altra U.M.</SelectItem> : null}
                      </SelectContent>
                    </Select>
                    {draft.unit === MANUAL ? (
                      <Input
                        className="h-7 w-20 text-xs uppercase"
                        placeholder="Es. PEDANA"
                        value={draft.manual}
                        aria-label={`Altra U.M. ${row.code}`}
                        onChange={(event) => patch(row.key, { manual: event.target.value })}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
          {!visible.length && !loading ? (
            <li className="p-3 text-xs text-muted-foreground">Nessun prodotto trovato con questi filtri.</li>
          ) : null}
          {loading ? <li className="p-3 text-xs text-muted-foreground">Caricamento prodotti…</li> : null}
        </ul>

        {filtered.length > visible.length ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setLimit((value) => value + PAGE)}>
            Mostra altri ({filtered.length - visible.length} rimanenti)
          </Button>
        ) : null}
        {missingQuantity.length ? (
          <p className="text-xs text-destructive">
            Scrivi la quantità per {missingQuantity.length} prodott{missingQuantity.length === 1 ? "o" : "i"} scelt
            {missingQuantity.length === 1 ? "o" : "i"}: senza quantità oggi non si può aggiungere.
          </p>
        ) : null}
        {missingUnit.length ? (
          <p className="text-xs text-destructive">Scrivi l'U.M. per chi ha «Altra U.M.».</p>
        ) : null}
        {inline ? (
          selectedKeys.length ? (
            <div className="sticky bottom-2 z-10 flex justify-end">
              <Button
                disabled={missingQuantity.length > 0 || missingUnit.length > 0 || addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                Aggiungi alla Lista ({selectedKeys.length})
              </Button>
            </div>
          ) : null
        ) : (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={!selectedKeys.length || missingQuantity.length > 0 || missingUnit.length > 0 || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            Aggiungi alla Lista ({selectedKeys.length})
          </Button>
        </DialogFooter>
        )}
    </>
  );

  if (inline) return <div className="flex flex-col gap-3">{body}</div>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-3xl">{body}</DialogContent>
    </Dialog>
  );
}

export function Thumb({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="size-8 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <ImageOff className="size-3.5" aria-hidden="true" />
    </span>
  );
}
