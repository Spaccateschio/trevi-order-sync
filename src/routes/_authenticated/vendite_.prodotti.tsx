import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ColumnOrderState, ColumnSizingState, SortingState, VisibilityState } from "@tanstack/react-table";
import { Columns3, Download, Eye, EyeOff, FileUp, Printer, Ruler, RotateCcw, Search, SquareCheckBig } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ProductDetailSheet } from "@/components/products/product-detail-sheet";
import { ProductGrid } from "@/components/products/product-grid";
import { ProductMobileList } from "@/components/products/product-mobile-list";
import { SalesUnitBatchDialog } from "@/components/products/sales-unit-batch-dialog";
import type { CompanyUnit, ProductSaleUnit } from "@/components/products/sales-unit-manager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activeCompany, companySells, hasRole, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { analyzeDaneaFile, importDaneaFile } from "@/lib/danea.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import {
  DEFAULT_COLUMN_ORDER,
  columnLabel,
  PRODUCT_COLUMNS,
  defaultGridPreferences,
  formatGridValue,
  type GridDevice,
  type GridPreferences,
  type ProductRow,
} from "@/lib/product-grid";

export const Route = createFileRoute("/_authenticated/vendite_/prodotti")({
  head: () => ({
    meta: [
      { title: "Prodotti da Danea — Trevi Fruit" },
      { name: "description", content: "Griglia operativa dei prodotti ricevuti da Danea Easyfatt." },
      { property: "og:title", content: "Prodotti da Danea — Trevi Fruit" },
      { property: "og:description", content: "Griglia operativa dei prodotti ricevuti da Danea Easyfatt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { prodotto?: string } =>
    typeof search['prodotto'] === "string" && search['prodotto'] ? { prodotto: search['prodotto'] } : {},
  component: ProdottiPage,
});

const PAGE_SIZE = 50;
const GRID_KEY = "vendite.prodotti";

function getDeviceClass(): GridDevice {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 768) return "smartphone";
  if (window.innerWidth < 1280) return "tablet";
  return "desktop";
}

function sortProducts(products: ProductRow[], sorting: SortingState, archives: Map<string, string>) {
  const active = sorting[0];
  if (!active) return products;
  const column = PRODUCT_COLUMNS.find((item) => item.id === active.id);
  if (!column) return products;
  return [...products].sort((left, right) => {
    const a = column.value(left, archives);
    const b = column.value(right, archives);
    if (a === b) return 0;
    if (a === null || a === "—") return 1;
    if (b === null || b === "—") return -1;
    const result = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "it", { numeric: true, sensitivity: "base" });
    return active.desc ? -result : result;
  });
}

function ProdottiPage() {
  const { prodotto: prodottoParam } = Route.useSearch();
  const { data: identity, isLoading: identityLoading } = useIdentity();
  const company = activeCompany(identity);
  const companyId = company?.companyId ?? null;
  const userId = identity?.userId ?? null;
  const isAdmin = hasRole(identity, "amministratore");
  const queryClient = useQueryClient();
  const defaults = useMemo(() => defaultGridPreferences(), []);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("tutte");
  const [archiveFilter, setArchiveFilter] = useState("tutti");
  const [status, setStatus] = useState("pubblicato");
  const [imageFilter, setImageFilter] = useState("tutte");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [unitBatchOpen, setUnitBatchOpen] = useState(false);
  const [deviceClass, setDeviceClass] = useState<GridDevice>("desktop");
  const [visibility, setVisibility] = useState<VisibilityState>(defaults.visibility);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(defaults.order);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(defaults.sizing);
  const [sorting, setSorting] = useState<SortingState>(defaults.sorting);
  const [preferencesReady, setPreferencesReady] = useState(false);

  // Vetrina B2B: products resta in sola scrittura Danea, l'interruttore passa dalla funzione dedicata.
  const showcaseMutation = useMutation({
    mutationFn: async (visible: boolean) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase.rpc("set_product_b2b_visibility", {
        _company_id: companyId,
        _product_ids: Array.from(selectedIds),
        _visible: visible,
      });
      if (error) throw new Error(error.message);
      return visible;
    },
    onSuccess: (visible) => {
      toast.success(visible ? "Prodotti messi in vetrina B2B" : "Prodotti nascosti dalla vetrina");
      void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    const update = () => setDeviceClass(getDeviceClass());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Header compatto sticky su smartphone: si attiva appena si inizia a scorrere.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  useEffect(() => setPreferencesReady(false), [deviceClass, userId]);

  const archivesQuery = useQuery({
    queryKey: ["danea-archivi", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("danea_archives").select("id, name, is_default, status").eq("company_id", companyId).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["prodotti", companyId],
    enabled: Boolean(companyId),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("products").select("id, archive_id, code, description, description_html, category, subcategory, danea_um, size_um, weight_um, vat_perc, vat_code, vat_description, vat_class, publish_status, b2b_visible, danea_internal_id, notes, image_file_name, image_folder, supplier_code, supplier_name, supplier_product_code, supplier_notes, producer_name, product_type, barcode, link, custom_field_1, custom_field_2, custom_field_3, custom_field_4, first_received_at, last_received_at, product_prices(list_number, net_price, gross_price), product_images(id)").eq("company_id", companyId).order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  const priceListsQuery = useQuery({
    queryKey: ["danea-listini", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("danea_price_lists").select("list_number, danea_name, display_name").eq("company_id", companyId).order("list_number");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const preferencesQuery = useQuery({
    queryKey: ["product-grid-preferences", userId, deviceClass],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("user_grid_preferences").select("columns, sort").eq("user_id", userId).eq("grid_key", GRID_KEY).eq("device_class", deviceClass).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    if (preferencesQuery.isLoading) return;
    const row = preferencesQuery.data;
    const columns = row?.columns as Partial<GridPreferences> | undefined;
    const savedSort = row?.sort as SortingState | undefined;
    setVisibility({ ...defaults.visibility, ...(columns?.visibility ?? {}) });
    const savedOrder = columns?.order ?? [];
    setColumnOrder([...savedOrder, ...defaults.order.filter((id) => !savedOrder.includes(id))]);
    setColumnSizing({ ...defaults.sizing, ...(columns?.sizing ?? {}) });
    setSorting(Array.isArray(savedSort) ? savedSort : defaults.sorting);
    setPreferencesReady(true);
  }, [defaults, deviceClass, preferencesQuery.data, preferencesQuery.isLoading]);

  useEffect(() => {
    if (!preferencesReady || !userId) return;
    const timer = window.setTimeout(async () => {
      const columns = { visibility, order: columnOrder, sizing: columnSizing };
      const { error } = await supabase.from("user_grid_preferences").upsert({ user_id: userId, grid_key: GRID_KEY, device_class: deviceClass, columns: columns as Json, sort: sorting as unknown as Json }, { onConflict: "user_id,grid_key,device_class" });
      if (error) toast.error("Impossibile salvare le preferenze della griglia");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [columnOrder, columnSizing, deviceClass, preferencesReady, sorting, userId, visibility]);

  const costsQuery = useQuery({
    queryKey: ["danea-costi", companyId, selected?.id],
    enabled: Boolean(companyId && selected && isAdmin),
    queryFn: async () => {
      if (!selected) return null;
      const { data } = await supabase.from("product_supplier_costs").select("supplier_name, supplier_code, supplier_product_code, supplier_net_price, supplier_gross_price, received_at").eq("product_id", selected.id).maybeSingle();
      return data;
    },
  });

  const companyUnitsQuery = useQuery({ queryKey: ["company-units", companyId], enabled: Boolean(companyId), queryFn: async () => { if (!companyId) return []; const { data, error } = await supabase.from("units_of_measure").select("id, code, description, status").eq("company_id", companyId).order("code"); if (error) throw new Error(error.message); return data as CompanyUnit[]; } });
  const saleUnitsQuery = useQuery({ queryKey: ["product-sale-units", companyId], enabled: Boolean(companyId), queryFn: async () => { if (!companyId) return []; const { data, error } = await supabase.from("product_sale_units").select("id, product_id, unit_id, is_active, is_customer_visible, is_default, conversion_factor, conversion_reference_um, needs_review, units_of_measure(code, description)").eq("company_id", companyId); if (error) throw new Error(error.message); return data as ProductSaleUnit[]; } });

  const archives = archivesQuery.data ?? [];
  const archiveNameById = useMemo(() => new Map(archives.map((archive) => [archive.id, archive.name])), [archives]);
  const allProducts = useMemo(() => (productsQuery.data ?? []).map((product) => ({ ...product, sale_units: (saleUnitsQuery.data ?? []).filter((row) => row.product_id === product.id).map((row) => ({ code: row.units_of_measure?.code ?? "—", is_default: row.is_default, needs_review: row.needs_review })) })), [productsQuery.data, saleUnitsQuery.data]);
  const currentProduct = selected ? allProducts.find((product) => product.id === selected.id) ?? selected : null;
  // Apertura diretta della scheda quando si arriva dalla sezione Prodotti forniti del fornitore.
  const openedFromParam = useRef<string | null>(null);
  useEffect(() => {
    if (!prodottoParam || openedFromParam.current === prodottoParam) return;
    const target = allProducts.find((product) => product.id === prodottoParam);
    if (!target) return;
    openedFromParam.current = prodottoParam;
    setStatus("tutti");
    setSelected(target);
  }, [allProducts, prodottoParam]);
  const categories = useMemo(() => [...new Set(allProducts.flatMap((product) => product.category ? [product.category] : []))].sort((a, b) => a.localeCompare(b, "it")), [allProducts]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allProducts.filter((product) => {
      if (category !== "tutte" && product.category !== category) return false;
      if (archiveFilter !== "tutti" && product.archive_id !== archiveFilter) return false;
      if (status !== "tutti" && product.publish_status !== status) return false;
      if (imageFilter === "con" && !product.product_images) return false;
      if (imageFilter === "senza" && product.product_images) return false;
      return !term || product.code.toLowerCase().includes(term) || (product.description ?? "").toLowerCase().includes(term);
    });
  }, [allProducts, archiveFilter, category, imageFilter, search, status]);
  const sortedFiltered = useMemo(() => sortProducts(filtered, sorting, archiveNameById), [archiveNameById, filtered, sorting]);
  const pageCount = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = sortedFiltered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const getImageUrls = useServerFn(getProductImageUrls);
  const imageColumnVisible = visibility["image"] !== false;
  const needsThumbnails = imageColumnVisible || deviceClass === "smartphone";
  const visibleImageProductIds = useMemo(() => needsThumbnails ? visible.filter((product) => product.product_images).map((product) => product.id) : [], [needsThumbnails, visible]);
  const imageUrlsQuery = useQuery({
    queryKey: ["product-grid-image-urls", visibleImageProductIds],
    enabled: visibleImageProductIds.length > 0,
    queryFn: () => getImageUrls({ data: { productIds: visibleImageProductIds, thumbnail: true } }),
    staleTime: 8 * 60 * 1000,
  });
  const imageUrls = useMemo(() => new Map((imageUrlsQuery.data ?? []).map((row) => [row.productId, row.url])), [imageUrlsQuery.data]);
  const selectedProducts = sortedFiltered.filter((product) => selectedIds.has(product.id));
  const outputProducts = selectedProducts.length ? selectedProducts : sortedFiltered;
  const visibleColumns = columnOrder.map((id) => PRODUCT_COLUMNS.find((column) => column.id === id)).filter((column) => column && visibility[column.id] !== false && (isAdmin || !column.adminOnly));
  // Le card smartphone usano le stesse preferenze "Colonne" del dispositivo corrente.
  const mobileColumns = visibleColumns.filter((column): column is ProductColumn => Boolean(column));


  const listName = (number: number) => {
    const row = priceListsQuery.data?.find((list) => list.list_number === number);
    return row?.display_name ?? row?.danea_name ?? `Listino ${number}`;
  };

  function resetPreferences() {
    const next = defaultGridPreferences();
    setVisibility(next.visibility);
    setColumnOrder(next.order);
    setColumnSizing(next.sizing);
    setSorting(next.sorting);
  }

  function exportCsv() {
    const header = visibleColumns.map((column) => `"${(column ? columnLabel(column, listName) : "").replaceAll('"', '""')}"`).join(";");
    const rows = outputProducts.map((product) => visibleColumns.map((column) => {
      if (!column) return '""';
      const value = formatGridValue(column, column.value(product, archiveNameById));
      return `"${value.replaceAll('"', '""')}"`;
    }).join(";"));
    const blob = new Blob(["\ufeff", [header, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prodotti-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!identityLoading && !companySells(identity)) return <AppShell title="Prodotti" description="Area riservata alle aziende che vendono."><p className="text-sm text-muted-foreground">Il profilo di vendita non è attivo per la tua azienda.</p></AppShell>;

  const filterSelects = (stacked: boolean) => {
    const triggerClass = (width: string) => cn("h-9", stacked ? "w-full" : `${width} shrink-0`);
    return <>
      <Select value={category} onValueChange={(value) => { setCategory(value); setPage(0); }}><SelectTrigger className={triggerClass("w-44")}><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="tutte">Tutte le categorie</SelectItem>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      {archives.length > 1 ? <Select value={archiveFilter} onValueChange={(value) => { setArchiveFilter(value); setPage(0); }}><SelectTrigger className={triggerClass("w-44")}><SelectValue placeholder="Archivio" /></SelectTrigger><SelectContent><SelectItem value="tutti">Tutti gli archivi</SelectItem>{archives.map((archive) => <SelectItem key={archive.id} value={archive.id}>{archive.name}</SelectItem>)}</SelectContent></Select> : null}
      <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}><SelectTrigger className={triggerClass("w-48")}><SelectValue placeholder="Stato" /></SelectTrigger><SelectContent><SelectItem value="pubblicato">Catalogo attuale</SelectItem><SelectItem value="non_pubblicato">Non più inviati</SelectItem><SelectItem value="tutti">Tutti gli stati</SelectItem></SelectContent></Select>
      <Select value={imageFilter} onValueChange={(value) => { setImageFilter(value); setPage(0); }}><SelectTrigger className={triggerClass("w-40")}><SelectValue placeholder="Immagine" /></SelectTrigger><SelectContent><SelectItem value="tutte">Tutte le immagini</SelectItem><SelectItem value="con">Con immagine</SelectItem><SelectItem value="senza">Senza immagine</SelectItem></SelectContent></Select>
    </>;
  };

  const columnsMenu = (iconOnly: boolean) => <DropdownMenu><DropdownMenuTrigger asChild>{iconOnly ? <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Colonne"><Columns3 /></Button> : <Button variant="outline" size="sm"><Columns3 />Colonne</Button>}</DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto"><DropdownMenuLabel>{deviceClass === "smartphone" ? "Campi visibili nelle card" : "Colonne visibili"}</DropdownMenuLabel>{PRODUCT_COLUMNS.filter((column) => isAdmin || !column.adminOnly).map((column) => <DropdownMenuCheckboxItem key={column.id} checked={visibility[column.id] !== false} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setVisibility((current) => ({ ...current, [column.id]: checked }))}>{columnLabel(column, listName)}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><DropdownMenuItem onSelect={resetPreferences}><RotateCcw />Ripristina predefinite</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;

  return <AppShell title="Prodotti" compact wide>
    <div className="space-y-2">
      {/* Smartphone: barra operativa compatta sticky, visibile appena si inizia a scorrere. */}
      <div className={cn("sticky top-14 z-20 -mx-3 border-b border-border bg-background px-3 py-2 md:hidden", scrolled ? "block" : "hidden")}>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-sm font-semibold">Prodotti</span>
          <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca prodotti" className="h-9 pl-8" placeholder="Cerca" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></div>
          <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Filtri"><SlidersHorizontal /></Button></PopoverTrigger><PopoverContent align="end" className="w-64 space-y-2">{filterSelects(true)}</PopoverContent></Popover>
          {columnsMenu(true)}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Altre azioni"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setSelectedIds(new Set(visible.map((product) => product.id)))}>Seleziona questa pagina ({visible.length})</DropdownMenuItem><DropdownMenuItem disabled={!selectedIds.size} onSelect={() => setSelectedIds(new Set())}>Azzera selezione</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={!outputProducts.length} onSelect={() => window.print()}><Printer />Stampa</DropdownMenuItem><DropdownMenuItem disabled={!outputProducts.length} onSelect={exportCsv}><Download />Esporta</DropdownMenuItem>{isAdmin ? <DropdownMenuItem onSelect={() => setImportOpen(true)}><FileUp />Importa da Danea</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu>
        </div>
      </div>

      <div className={cn("space-y-2", scrolled && "max-md:hidden")}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 xl:flex xl:items-center">
          <div className="relative min-w-0 xl:w-72"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca prodotti" className="h-9 pl-8" placeholder="Codice o descrizione" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></div>
          <div className="flex shrink-0 items-center gap-1 xl:order-last">
            {columnsMenu(false)}
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Seleziona prodotti"><SquareCheckBig /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setSelectedIds(new Set(visible.map((product) => product.id)))}>Seleziona questa pagina ({visible.length})</DropdownMenuItem><DropdownMenuItem onSelect={() => setSelectedIds(new Set(sortedFiltered.map((product) => product.id)))}>Seleziona tutti i risultati ({sortedFiltered.length})</DropdownMenuItem><DropdownMenuItem disabled={!selectedIds.size} onSelect={() => setSelectedIds(new Set())}>Azzera selezione</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>
          <div className="col-span-2 flex min-w-0 gap-2 overflow-x-auto xl:col-span-1 xl:flex-1">
            {filterSelects(false)}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-y border-border py-1.5 text-xs">
          <p className="truncate text-muted-foreground">{productsQuery.isLoading ? "Caricamento…" : `${sortedFiltered.length} prodotti`}{selectedProducts.length ? ` · ${selectedProducts.length} selezionati` : ""}</p>
          <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={!outputProducts.length} onClick={() => window.print()}><Printer />Stampa</Button><Button variant="ghost" size="sm" disabled={!outputProducts.length} onClick={exportCsv}><Download />Esporta</Button>{isAdmin && selectedProducts.length ? <><Button variant="outline" size="sm" disabled={showcaseMutation.isPending} onClick={() => showcaseMutation.mutate(true)}><Eye />In vetrina</Button><Button variant="outline" size="sm" disabled={showcaseMutation.isPending} onClick={() => showcaseMutation.mutate(false)}><EyeOff />Nascondi</Button><Button variant="outline" size="sm" onClick={() => setUnitBatchOpen(true)}><Ruler />Gestisci U.M. vendita</Button></> : null}{isAdmin ? <Button size="sm" onClick={() => setImportOpen(true)}><FileUp />Importa da Danea</Button> : null}</div>
        </div>
      </div>

      <ProductGrid products={visible} archives={archiveNameById} isAdmin={isAdmin} selectedIds={selectedIds} visibility={visibility} order={columnOrder} sizing={columnSizing} sorting={sorting} onSelectionChange={setSelectedIds} onVisibilityChange={setVisibility} onOrderChange={setColumnOrder} onSizingChange={setColumnSizing} onSortingChange={(next) => { setSorting(next); setPage(0); }} onOpen={setSelected} imageUrls={imageUrls} listName={listName} />
      <ProductMobileList products={visible} selectedIds={selectedIds} imageUrls={imageUrls} columns={mobileColumns} archives={archiveNameById} listName={listName} onSelect={(id, checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; })} onOpen={setSelected} />


      {pageCount > 1 ? <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</Button><span className="truncate text-center text-xs text-muted-foreground">Pagina {currentPage + 1} di {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Successivi</Button></div> : null}
    </div>

    <div id="product-print-area" className="hidden print:block"><h1 className="mb-3 text-lg font-semibold">Prodotti</h1><p className="mb-3 text-xs">{outputProducts.length} prodotti · {new Intl.DateTimeFormat("it-IT").format(new Date())}</p><table className="w-full border-collapse text-[9pt]"><thead><tr>{visibleColumns.map((column) => <th key={column?.id} className="border border-border p-1 text-left">{column ? columnLabel(column, listName) : ""}</th>)}</tr></thead><tbody>{outputProducts.map((product) => <tr key={product.id}>{visibleColumns.map((column) => <td key={column?.id} className="border border-border p-1">{column ? formatGridValue(column, column.value(product, archiveNameById)) : ""}</td>)}</tr>)}</tbody></table></div>

    <ProductDetailSheet product={currentProduct} archiveName={currentProduct ? archiveNameById.get(currentProduct.archive_id) ?? "—" : "—"} listName={listName} isAdmin={isAdmin} cost={costsQuery.data ?? null} companyId={companyId} companyUnits={companyUnitsQuery.data ?? []} saleUnits={(saleUnitsQuery.data ?? []).filter((row) => row.product_id === currentProduct?.id)} onClose={() => setSelected(null)} />
    {companyId ? <SalesUnitBatchDialog open={unitBatchOpen} onOpenChange={setUnitBatchOpen} companyId={companyId} productIds={selectedProducts.map((product) => product.id)} units={companyUnitsQuery.data ?? []} /> : null}
    <ImportDialog open={importOpen} onOpenChange={setImportOpen} companyId={companyId} archives={archives.filter((archive) => archive.status === "attivo").map((archive) => ({ id: archive.id, name: archive.name, isDefault: archive.is_default }))} onImported={() => { void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] }); void queryClient.invalidateQueries({ queryKey: ["danea-listini", companyId] }); }} />
  </AppShell>;
}

type Analysis = Awaited<ReturnType<typeof analyzeDaneaFile>>;

function ImportDialog({
  open,
  onOpenChange,
  companyId,
  archives,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  archives: { id: string; name: string; isDefault: boolean }[];
  onImported: () => void;
}) {
  const analyze = useServerFn(analyzeDaneaFile);
  const runImport = useServerFn(importDaneaFile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [archiveId, setArchiveId] = useState("");

  const chosenArchiveId =
    archiveId || archives.find((a) => a.isDefault)?.id || archives[0]?.id || "";

  const reset = () => {
    setXml(null);
    setFileName(null);
    setAnalysis(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const analyzeMutation = useMutation({
    mutationFn: async () =>
      analyze({ data: { companyId: companyId!, archiveId: chosenArchiveId, xml: xml! } }),
    onSuccess: (result) => setAnalysis(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: async () =>
      runImport({ data: { companyId: companyId!, archiveId: chosenArchiveId, xml: xml! } }),
    onSuccess: (result) => {
      toast.success("Importazione Danea completata", {
        description: `Creati ${result.created}, aggiornati ${result.updated}, invariati ${Math.max(
          0,
          result.received - result.created - result.updated,
        )}, depubblicati ${result.unpublished}.`,
      });
      onImported();
      reset();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importa da Danea</DialogTitle>
          <DialogDescription>
            Carica il file XML ottenuto con “Salva su file” di Danea Easyfatt. Viene usato lo stesso
            motore del collegamento diretto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">1. Archivio Danea da aggiornare</p>
            <Select
              value={chosenArchiveId}
              onValueChange={(v) => {
                setArchiveId(v);
                setAnalysis(null);
              }}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Archivio Danea" />
              </SelectTrigger>
              <SelectContent>
                {archives.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Il file aggiorna soltanto i prodotti di questo archivio.
            </p>
          </div>

          <div>
            <p className="font-medium">2. Seleziona file Danea</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="mt-2 w-full text-sm"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                setAnalysis(null);
                if (!file) {
                  setXml(null);
                  setFileName(null);
                  return;
                }
                setFileName(file.name);
                const buffer = await file.arrayBuffer();
                // Lo stesso decodificatore usato dal collegamento diretto vive sul
                // server: qui leggiamo il testo e lasciamo al lettore XML il resto.
                const head = new TextDecoder("utf-8").decode(buffer.slice(0, 200));
                const match = /encoding=["']([^"']+)["']/i.exec(head);
                const encoding = match?.[1]?.toLowerCase() ?? "utf-8";
                try {
                  setXml(new TextDecoder(encoding).decode(buffer));
                } catch {
                  setXml(new TextDecoder("utf-8").decode(buffer));
                }
              }}
            />
            {fileName ? (
              <p className="mt-1 text-xs text-muted-foreground">File scelto: {fileName}</p>
            ) : null}
          </div>

          <div>
            <p className="font-medium">3. Analizza file</p>
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={!xml || !companyId || !chosenArchiveId || analyzeMutation.isPending}
              onClick={() => analyzeMutation.mutate()}
            >
              {analyzeMutation.isPending ? "Analisi…" : "Analizza file"}
            </Button>

            {analysis ? (
              <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Tipo invio: </span>
                  {analysis.mode === "full" ? "COMPLETO" : "INCREMENTALE"}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti trovati: </span>
                  {analysis.received}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti nuovi: </span>
                  {analysis.toCreate}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti da aggiornare: </span>
                  {analysis.toUpdate}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti da depubblicare: </span>
                  {analysis.toUnpublish}
                </p>
                <p>
                  <span className="text-muted-foreground">Listini trovati: </span>
                  {analysis.priceLists.length
                    ? analysis.priceLists.map((l) => l.name).join(", ")
                    : "nessun nome listino"}
                </p>
                <p>
                  <span className="text-muted-foreground">Segnalazioni: </span>
                  {analysis.issues.length ? analysis.issues.length : "nessuna"}
                </p>
                {analysis.issues.length ? (
                  <ul className="ml-4 list-disc text-xs text-muted-foreground">
                    {analysis.issues.slice(0, 5).map((issue, index) => (
                      <li key={index}>
                        {issue.productCode ? `${issue.productCode}: ` : ""}
                        {issue.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {analysis.reconciliationBlocked ? (
                  <p className="text-xs font-medium text-destructive">
                    Invio completo non integro: nessun prodotto verrà depubblicato per assenza.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <p className="font-medium">4. Conferma importazione</p>
            <p className="text-xs text-muted-foreground">
              Le modifiche vengono applicate solo dopo la conferma.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={!analysis || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? "Importazione…" : "Conferma importazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
