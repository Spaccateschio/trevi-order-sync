import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Package, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  addCardToOpenInventory, addCatalogItemToOpenInventory, adoptCatalogProduct,
  getPossibleInventoryCards, startFullGeneralInventory,
  type CatalogCandidate, type PossibleInventoryCard,
} from "@/lib/inventory-count.functions";

const MAX_SHOWN = 60;
const NO_CATEGORY = "Senza categoria";
const NO_SUBCATEGORY = "Senza sottocategoria";

function useRefreshInventory(companyId: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory-rows"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-progress"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-possible-cards"] }),
    queryClient.invalidateQueries({ queryKey: ["inventario-catalogo-candidati", companyId] }),
  ]);
}

/**
 * Card aggiungibili al conteggio: card possibili dei propri prodotti fuori sessione (solo vista «Tutti»)
 * e articoli dei cataloghi fornitori trovati dalla ricerca. Diventano obbligatorie solo dopo l'aggiunta.
 */
export function InventoryExtraCards({
  companyId, sessionId, isAdmin, showPossible, search, category, subcategory, locationId, catalogCandidates,
}: {
  companyId: string;
  sessionId: string | null;
  isAdmin: boolean;
  showPossible: boolean;
  search: string;
  category: string | null;
  subcategory: string | null;
  locationId: string | null;
  catalogCandidates: CatalogCandidate[];
}) {
  const term = search.trim().toLowerCase();
  const refresh = useRefreshInventory(companyId);
  const readPossible = useServerFn(getPossibleInventoryCards);
  const addCard = useServerFn(addCardToOpenInventory);
  const addCatalog = useServerFn(addCatalogItemToOpenInventory);
  const adopt = useServerFn(adoptCatalogProduct);
  const [busy, setBusy] = useState<string | null>(null);

  const possibleQuery = useQuery({
    queryKey: ["inventory-possible-cards", companyId, sessionId],
    enabled: Boolean(sessionId) && showPossible,
    staleTime: 30 * 1000,
    queryFn: () => readPossible({ data: { companyId, sessionId: sessionId! } }),
  });
  const possible = useMemo(() => (possibleQuery.data ?? []).filter((card) => {
    if (category && (card.category ?? NO_CATEGORY) !== category) return false;
    if (subcategory && (card.subcategory ?? NO_SUBCATEGORY) !== subcategory) return false;
    return !term || `${card.code} ${card.description ?? ""} ${card.supplierName ?? ""}`.toLowerCase().includes(term);
  }).sort((a, b) => (a.description ?? a.code).localeCompare(b.description ?? b.code, "it")), [possibleQuery.data, category, subcategory, term]);

  const catalog = term.length >= 2 ? catalogCandidates : [];

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await action();
      await refresh();
      toast.success(message);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addPossible = (card: PossibleInventoryCard) =>
    run(`p-${card.productId}-${card.linkId ?? ""}`,
      () => addCard({ data: { companyId, productId: card.productId, linkId: card.linkId, locationId } }),
      "Card aggiunta al conteggio: ora è da contare");

  const addFromCatalog = (candidate: CatalogCandidate) =>
    run(`c-${candidate.sellerProductId}`,
      () => sessionId
        ? addCatalog({ data: { companyId, sellerCompanyId: candidate.sellerCompanyId, sellerProductId: candidate.sellerProductId, locationId } })
        : adopt({ data: { companyId, sellerCompanyId: candidate.sellerCompanyId, sellerProductId: candidate.sellerProductId } }),
      sessionId ? "Prodotto aggiunto al conteggio" : "Prodotto aggiunto ai tuoi prodotti");

  if (!(showPossible && sessionId && possible.length) && !catalog.length) return null;

  return (
    <div className="space-y-3 border-t border-border p-2">
      {showPossible && sessionId && possible.length ? (
        <section aria-label="Card fuori dal conteggio">
          <p className="mb-1.5 text-xs text-muted-foreground">
            <strong className="text-foreground">Fuori dal conteggio · {possible.length}</strong> — aggiungile solo se le trovi in magazzino:
            diventano da contare dopo l'aggiunta.
          </p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {possible.slice(0, MAX_SHOWN).map((card) => (
              <article key={`${card.productId}-${card.linkId ?? "nofornitore"}`} className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-2 opacity-80">
                <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold uppercase leading-tight">{card.description?.trim() || card.code}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    Cod. {card.code} · {card.supplierName ?? "Senza fornitore"}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={busy !== null} onClick={() => addPossible(card)}>
                  <Plus aria-hidden="true" /> Aggiungi al conteggio
                </Button>
              </article>
            ))}
          </div>
          {possible.length > MAX_SHOWN ? (
            <p className="mt-1 text-xs text-muted-foreground">Mostrate le prime {MAX_SHOWN}: usa la ricerca per trovare le altre.</p>
          ) : null}
        </section>
      ) : null}

      {catalog.length ? (
        <section aria-label="Risultati nei cataloghi dei fornitori">
          <p className="mb-1.5 text-xs text-muted-foreground">
            <strong className="text-foreground">Nei cataloghi dei fornitori · {catalog.length}</strong> — non sono ancora tuoi prodotti.
          </p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {catalog.slice(0, MAX_SHOWN).map((candidate) => (
              <article key={candidate.sellerProductId} className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-card p-2">
                <Store className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold uppercase leading-tight">{candidate.description?.trim() || candidate.code}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    Cod. {candidate.code}{candidate.danea_um ? ` · ${candidate.danea_um}` : ""} · {candidate.sellerCompanyName}
                  </p>
                </div>
                {sessionId ? (
                  <Button size="sm" className="h-8 shrink-0 text-xs" disabled={busy !== null} onClick={() => addFromCatalog(candidate)}>
                    <Plus aria-hidden="true" /> Aggiungi al conteggio
                  </Button>
                ) : isAdmin ? (
                  <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={busy !== null} onClick={() => addFromCatalog(candidate)}>
                    <Plus aria-hidden="true" /> Aggiungi ai miei prodotti
                  </Button>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">Solo amministratore</span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Avvio esplicito «Inventario completo» (solo amministratore, solo senza inventario aperto). */
export function FullInventoryStartButton({ companyId, archiveId, onStarted }: {
  companyId: string;
  archiveId: string;
  onStarted: () => Promise<unknown>;
}) {
  const startFull = useServerFn(startFullGeneralInventory);
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => startFull({ data: { companyId, archiveId } }),
    onSuccess: async () => {
      setOpen(false);
      await onStarted();
      toast.success("Inventario completo aperto: tutte le card dei tuoi prodotti sono da contare");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <ListChecks aria-hidden="true" /> Avvia inventario completo
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avviare un inventario completo?</AlertDialogTitle>
            <AlertDialogDescription>
              Entrano da contare tutte le card dei tuoi prodotti: una per ogni fornitore attivo, oppure «Senza fornitore»
              se il prodotto non ne ha. Utile per il primo inventario. Per un inventario normale basta scrivere una quantità.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={mutation.isPending} onClick={(event) => { event.preventDefault(); mutation.mutate(); }}>
              Avvia inventario completo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
