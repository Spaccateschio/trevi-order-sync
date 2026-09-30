import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity } from "@/lib/inventory";
import { getFavoriteProductIds, manageCompanyProductFavorite } from "@/lib/inventory-count.functions";
import { cn } from "@/lib/utils";
import { getProductImageUrls } from "@/lib/product-images.functions";
import { addShoppingListItems } from "@/lib/shopping-list.functions";

type Product = {
  id: string;
  code: string;
  description: string | null;
  category: string | null;
  danea_um: string | null;
};

/**
 * Aggiunta multipla alla Lista. Il modello attuale richiede una quantità decisa > 0:
 * ogni prodotto scelto ha il proprio campo, inizialmente vuoto. Nessuna quantità automatica.
 */
export function AddProductsDialog({
  companyId,
  listId,
  resolveListId,
  archiveId,
  existingProductIds,
  open,
  onOpenChange,
}: {
  companyId: string;
  /** null = anteprima inventario: la Lista si crea solo al salvataggio tramite resolveListId. */
  listId: string | null;
  resolveListId?: () => Promise<string | null>;
  archiveId: string;
  existingProductIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const runAdd = useServerFn(addShoppingListItems);
  const getImageUrls = useServerFn(getProductImageUrls);
  const readFavorites = useServerFn(getFavoriteProductIds);
  const runFavorite = useServerFn(manageCompanyProductFavorite);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});

  const productsQuery = useQuery({
    queryKey: ["shopping-add-products", companyId, archiveId],
    enabled: open,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, category, danea_um")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as Product[];
    },
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = productsQuery.data ?? [];
    const filtered = term
      ? all.filter(
          (row) => row.code.toLowerCase().includes(term) || (row.description ?? "").toLowerCase().includes(term),
        )
      : all;
    return filtered.slice(0, 100);
  }, [productsQuery.data, search]);

  const imageIds = useMemo(() => visible.slice(0, 50).map((row) => row.id), [visible]);
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

  // Stesso Preferito dell'Inventario: con la stella il prodotto torna nei prossimi Inventari (non entra da solo in Lista).
  const favoriteIds = useMemo(() => visible.map((row) => row.id).sort(), [visible]);
  const favoritesQuery = useQuery({
    queryKey: ["shopping-extras-favorites", companyId, "add", favoriteIds],
    enabled: open && favoriteIds.length > 0,
    queryFn: async () => new Set(await readFavorites({ data: { companyId, productIds: favoriteIds } })),
  });
  const favoriteMutation = useMutation({
    mutationFn: (input: { productId: string; favorite: boolean }) =>
      runFavorite({ data: { companyId, productId: input.productId, favorite: input.favorite } }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shopping-extras-favorites", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["inventario-preferiti-prodotti"] }),
        queryClient.invalidateQueries({ queryKey: ["catalogo-preferiti"] }),
      ]);
      toast.success(input.favorite ? "Preferito: lo ritroverai nei prossimi Inventari" : "Tolto dai preferiti");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedIds = Object.keys(selected);
  const missingQuantity = selectedIds.filter((id) => {
    const value = parseQuantity(selected[id] ?? "");
    return !value || value <= 0;
  });
  const products = productsQuery.data ?? [];

  const addMutation = useMutation({
    mutationFn: async () => {
      const targetId = listId ?? (await resolveListId?.()) ?? null;
      if (!targetId) throw new Error("Lista della Spesa non creata");
      return runAdd({
        data: {
          companyId,
          listId: targetId,
          replaceExisting: false,
          items: selectedIds.map((id) => ({
            product_id: id,
            decided_quantity: parseQuantity(selected[id] ?? "") ?? null,
            origin: "manuale" as const,
          })),
        },
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-list-overview"] });
      toast.success(
        `${result.added} prodott${result.added === 1 ? "o aggiunto" : "i aggiunti"}` +
          (result.skipped ? ` · ${result.skipped} già in lista` : ""),
      );
      setSelected({});
      setSearch("");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[id] = next[id] ?? "";
      else delete next[id];
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aggiungi prodotti</DialogTitle>
          <DialogDescription>
            Scegli uno o più prodotti e scrivi per ognuno la quantità da acquistare. Con la stella ★ il prodotto diventa preferito e lo ritroverai nei prossimi Inventari.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="h-8 pl-8 text-sm"
            autoFocus
            value={search}
            placeholder="Cerca per codice o descrizione"
            aria-label="Cerca prodotto da aggiungere"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {visible.map((row) => {
            const inList = existingProductIds.has(row.id);
            const isSelected = row.id in selected;
            return (
              <li key={row.id} className={`flex items-center gap-2 px-2 py-1 ${inList ? "opacity-60" : ""}`}>
                <Checkbox
                  checked={isSelected}
                  disabled={inList}
                  aria-label={`Scegli ${row.code}`}
                  onCheckedChange={(checked) => toggle(row.id, checked === true)}
                />
                <Thumb url={images.get(row.id) ?? null} />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-medium">{row.description ?? row.code}</p>
                  <p className="truncate text-muted-foreground">
                    <span className="font-mono">{row.code}</span>
                    {row.category ? ` · ${row.category}` : ""}
                    {row.danea_um ? ` · ${row.danea_um}` : ""}
                  </p>
                </div>
                {(() => {
                  const fav = favoritesQuery.data?.has(row.id) ?? false;
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn("h-7 w-7 shrink-0 px-0", fav && "text-primary")}
                      disabled={favoriteMutation.isPending || !favoritesQuery.data}
                      aria-pressed={fav}
                      aria-label={fav ? `Togli ${row.code} dai preferiti` : `Metti ${row.code} nei preferiti`}
                      title={fav ? "Togli dai preferiti" : "Preferito: torna nei prossimi Inventari"}
                      onClick={() => favoriteMutation.mutate({ productId: row.id, favorite: !fav })}
                    >
                      <Star className={cn("size-3.5", fav && "fill-current")} aria-hidden="true" />
                    </Button>
                  );
                })()}
                {inList ? (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Già in lista</Badge>
                ) : isSelected ? (
                  <Input
                    className="h-7 w-20 text-xs"
                    inputMode="decimal"
                    placeholder="Q.tà"
                    value={selected[row.id] ?? ""}
                    aria-label={`Quantità ${row.code}`}
                    onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.value }))}
                  />
                ) : null}
              </li>
            );
          })}
          {!visible.length && !productsQuery.isLoading ? (
            <li className="p-3 text-xs text-muted-foreground">Nessun prodotto trovato.</li>
          ) : null}
        </ul>
        {products.length > visible.length && !search ? (
          <p className="text-xs text-muted-foreground">Mostro i primi 100: usa la ricerca per trovare gli altri.</p>
        ) : null}
        {missingQuantity.length ? (
          <p className="text-xs text-destructive">
            Scrivi la quantità per {missingQuantity.length} prodott{missingQuantity.length === 1 ? "o" : "i"} scelt
            {missingQuantity.length === 1 ? "o" : "i"}: senza quantità oggi non si può aggiungere.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={!selectedIds.length || missingQuantity.length > 0 || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            Aggiungi alla Lista ({selectedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
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
