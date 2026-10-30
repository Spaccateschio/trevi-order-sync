import { ShoppingQuantityEditor } from "./shopping-quantity-editor";
import { ShoppingMobileCard } from "./shopping-mobile-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { Check, Copy, Lock, MoreVertical, Package, Plus, Star, StickyNote, Trash2, TriangleAlert, Truck, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { readCardBundle } from "@/lib/shopping-card-reads";
import { useEffect, useState, type ReactNode } from "react";
import { supplierUnitProposal, unitsSoldText, type ProposalLink } from "@/lib/supplier-unit-proposal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ALL_VISIBLE, type DisplayPrefs } from "./card-display";
import { CardSuppliers } from "./card-suppliers";
import type { RowExtras } from "./use-shopping-list-extras";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { evaluationBadge, type EvaluationBadgeStatus } from "@/lib/card-labels";
import { dateTimeShort, qty } from "@/lib/inventory";
import { type OverviewRow } from "@/lib/shopping-list";
import type { SupplierMemory } from "@/lib/supplier-memory";
import { factsFromRow, rowLabel } from "@/lib/supplier-selection";
import { cn } from "@/lib/utils";
import { companyProductPurchaseUnitsOptions, productPurchaseDefault, productUnitsReplaceLinkUnits } from "@/lib/product-purchase-units";

export type StockInfo = {
  lastQuantity: number | null;
  lastUnit: string | null;
  lastAt: string | null;
  stock: number | null;
  /** U.M. di magazzino del prodotto: la giacenza è sempre espressa in questa, non in quella della riga. */
  stockUnit: string | null;
};

const QUICK_STEPS = [1, 3, 5, 10] as const;
const PRODUCT_UNIT = "__prodotto__";

type UnitOption = { key: string; unitId: string | null; code: string; factor: number | null };

/**
 * U.M. per «Da acquistare»: U.M. del prodotto + U.M. già configurate sui fornitori collegati (anche manuali), senza doppioni.
 * L'equivalente si mostra solo se TUTTI i fornitori che offrono quella U.M. hanno la stessa conversione: mai applicare
 * la conversione di un fornitore agli altri.
 */
function useDecidedUnitOptions(companyId: string, itemId: string, enabled: boolean, manualCodes: string[], productId: string, replaceManualLinks: boolean) {
  // Stessa lettura di card-suppliers: quali collegamenti sono B2B (dal database).
  const b2b = useQuery({
    queryKey: ["shopping-card-b2b-options", companyId, productId],
    staleTime: 60_000,
    enabled: enabled && replaceManualLinks,
    queryFn: async () => {
      const bundle = await readCardBundle(`${companyId}:${itemId}`);
      if (bundle) return Object.fromEntries((bundle.b2b_options as unknown as { link_id: string; is_b2b: boolean }[]).map((r) => [r.link_id, r]));
      const { data, error } = await supabase.rpc("product_supplier_b2b_options", { _company_id: companyId, _product_id: productId });
      if (error) throw new Error(error.message);
      return Object.fromEntries(((data ?? []) as unknown as { link_id: string; is_b2b: boolean }[]).map((r) => [r.link_id, r]));
    },
  });
  const query = useQuery({
    queryKey: ["shopping-item-supplier-units", itemId],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const bundle = await readCardBundle(`${companyId}:${itemId}`);
      if (bundle) return Object.fromEntries((bundle.supplier_units as { link_id: string; units: { unit_id: string; code: string; conversion_factor: number | null }[] }[]).map((r) => [r.link_id, r]));
      const { data, error } = await supabase.rpc("shopping_item_supplier_units", { _item_id: itemId });
      if (error) throw new Error(error.message);
      return Object.fromEntries(
        ((data ?? []) as unknown as { link_id: string; units: { unit_id: string; code: string; conversion_factor: number | null }[] }[]).map((r) => [r.link_id, r]),
      );
    },
  });
  const byUnit = new Map<string, { code: string; factors: (number | null)[] }>();
  // Codici U.M. offerti dai fornitori ATTIVI (stessa fonte e stessa normalizzazione di unlink_supplier_preview).
  const offeredCodes = new Set<string>();
  for (const link of Object.values(query.data ?? {})) {
    // Fornitori non B2B: con U.M. impostate nella tab Acquisto valgono solo quelle del prodotto.
    if (replaceManualLinks && !(b2b.data as Record<string, { is_b2b: boolean }> | undefined)?.[link.link_id]?.is_b2b) continue;
    for (const u of link.units ?? []) {
      const entry = byUnit.get(u.unit_id) ?? { code: u.code, factors: [] };
      entry.factors.push(u.conversion_factor === null || u.conversion_factor === undefined ? null : Number(u.conversion_factor));
      byUnit.set(u.unit_id, entry);
      offeredCodes.add(normUnit(u.code));
    }
  }
  const options: UnitOption[] = [];
  const seen = new Set<string>();
  for (const [unitId, { code, factors }] of byUnit) {
    const first = factors[0];
    const certain = first !== null && factors.every((f) => f === first);
    options.push({ key: unitId, unitId, code, factor: certain ? (first ?? null) : null });
    seen.add(code.trim().toUpperCase());
  }
  for (const raw of manualCodes) {
    const code = raw.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    options.push({ key: `m:${code}`, unitId: null, code, factor: null });
  }
  return { options, offeredCodes, loaded: query.isSuccess, links: Object.values(query.data ?? {}) as unknown as ProposalLink[] };
}

/** Stessa normalizzazione del database: maiuscole, spazi compressi. */
const normUnit = (code: string | null | undefined) => (code ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * Card / Riga della Lista della Spesa: stessi dati e stessi comandi, cambia solo la disposizione.
 * Quantità da acquistare = obiettivo in U.M. di magazzino; le ripartizioni sono quantità + U.M. d'acquisto per fornitore
 * e non vengono mai modificate dai tasti rapidi.
 */
export function ShoppingListCard({
  companyId,
  row,
  extra,
  stock,
  editable,
  layout = "card",
  quantityInput,
  onQuickAdd,
  onToggleFavorite,
  favoritePending,
  onOpenSuppliers,
  onRemove,
  onSaveNotes,
  onToggleLock,
  lockPending = false,
  autoConfirm = false,
  saving = false,
  memoryNote = null,
  memory = null,
  onUnitChange,
  onProposeUnit,
  onFixUnit,
  onClearQuantity,
  pending = false,
  pendingQuantity,
  evaluation,
  show = ALL_VISIBLE,
  onCopyToOwnProducts,
  listConfirmed = false,
  draftQuantity,
  quantityLocked,
  quantityOnly = false,
  excluded = false,
  onRestore,
  onNonPurchase,
  mobileOpen = false,
  onToggleMobile,
}: {
  mobileOpen?: boolean;
  onToggleMobile?: () => void;
  quantityOnly?: boolean;
  excluded?: boolean;
  onRestore?: () => void;
  onNonPurchase?: () => void;
  /** «Copia nei miei prodotti»: passato solo per card B2B e amministratori. */
  onCopyToOwnProducts?: (() => void) | undefined;
  /** Prodotto dell'inventario non ancora in Lista: stessa card, comandi della Lista non ancora attivi. */
  pending?: boolean;
  /** Decisione salvata in inventory_purchase_evaluation_items (fonte ufficiale del badge di valutazione). */
  evaluation?: { status: EvaluationBadgeStatus; decided_quantity: number | null } | undefined;
  /** Quantità scritta su un prodotto «Da valutare» (serve solo ad abilitare Conferma). */
  pendingQuantity?: number | null;
  /** «Visualizza dati»: nasconde solo informazioni, non cambia dati né comandi salvati. */
  show?: DisplayPrefs;
  companyId: string;
  row: OverviewRow;
  extra: RowExtras | undefined;
  stock: StockInfo | undefined;
  editable: boolean;
  layout?: "card" | "row";
  quantityInput: ReactNode;
  onQuickAdd: (step: number) => void;
  onToggleFavorite: () => void;
  favoritePending: boolean;
  onOpenSuppliers: () => void;
  onRemove: () => void;
  /** Nota libera del prodotto: salvata solo su Liste aperte; null = nota rimossa. */
  onSaveNotes?: ((notes: string | null) => Promise<boolean>) | undefined;
  onToggleLock: () => void;
  lockPending?: boolean;
  /** Conferma automatica (uscita dal campo, Invio, tasti rapidi): niente pulsante «Conferma». */
  autoConfirm?: boolean;
  draftQuantity?: number | null;
  quantityLocked?: boolean;
  saving?: boolean;
  /** «Come l'ultima volta» quando fornitori/quote vengono dalla memoria. */
  memoryNote?: string | null;
  memory?: SupplierMemory | null;
  /** Cambio U.M. di «Da acquistare»: (null, null) = U.M. del prodotto. */
  onUnitChange?: (unitId: string | null, unitCode: string | null) => void;
  /** U.M. del fornitore proposta per la prima quantità (nessuna scrittura finché non si inserisce la quantità). */
  onProposeUnit?: (unit: { unitId: string; code: string } | null) => void;
  /** Correzione esplicita di U.M. (e quantità) già salvate: solo dopo conferma, mai conversione automatica. */
  onFixUnit?: (unitId: string, unitCode: string, quantity: number) => void;
  /** Svuota la quantità «Da acquistare» (obiettivo non indicato, mai 0). */
  onClearQuantity?: () => void;
  /** Lista confermata: le ripartizioni sono bloccate (solo informazione mostrata nella card). */
  listConfirmed?: boolean;
}) {
  const isMobile = useIsMobile();
  const name = row.description ?? row.code;
  const unit = row.unit_code ?? "";
  const suppliers = extra?.suppliers ?? [];
  const ownUnitsQuery = useQuery(companyProductPurchaseUnitsOptions(companyId));
  const ownUnits = (ownUnitsQuery.data ?? []).filter((u) => u.product_id === row.product_id);
  const decided = useDecidedUnitOptions(
    companyId,
    row.item_id,
    !pending && (Boolean(onUnitChange) || editable),
    suppliers.filter((s) => !s.purchaseUnitId && s.purchaseUnitCode).map((s) => s.purchaseUnitCode as string),
    row.product_id,
    productUnitsReplaceLinkUnits(ownUnits, row.product_id),
  );
  const ownOptions: UnitOption[] = ownUnits.flatMap((u) => u.units_of_measure ? [{ key: u.unit_id, unitId: u.unit_id, code: u.units_of_measure.code, factor: null }] : []);
  const unitOptions = [...decided.options, ...ownOptions.filter((o) => !decided.options.some((u) => u.unitId === o.unitId))].filter((o) => o.code.trim().toLowerCase() !== unit.trim().toLowerCase());
  const decidedKey = extra?.decidedUnitId
    ? extra.decidedUnitId
    : extra?.decidedUnitCode
      ? `m:${extra.decidedUnitCode.trim().toUpperCase()}`
      : PRODUCT_UNIT;
  const decidedOption = unitOptions.find((o) => o.key === decidedKey) ?? null;
  const otherUnit = decidedKey !== PRODUCT_UNIT;
  const decidedCode = otherUnit ? (decidedOption?.code ?? extra?.decidedUnitCode ?? "") : unit;
  // Badge solo informativo «U.M. non più offerta»: stessa regola di unlink_supplier_preview (Liste aperte),
  // U.M. di magazzino e U.M. della riga sempre valide. Non cambia quantità, U.M., stato o chiusura.
  const decidedNorm = normUnit(decidedCode);
  const unitNotOffered =
    editable &&
    !pending &&
    otherUnit &&
    decided.loaded &&
    decidedNorm !== "" &&
    decidedNorm !== normUnit(unit) &&
    decidedNorm !== normUnit(stock?.stockUnit) &&
    !decided.offeredCodes.has(decidedNorm) && !ownOptions.some((o) => normUnit(o.code) === decidedNorm);
  // U.M. del fornitore usato/preselezionato: stessa fonte del database, nessuna conversione inventata.
  const supplierInfo = useQuery({
    queryKey: ["shopping-card-unit-suppliers", companyId, row.item_id],
    staleTime: 60_000,
    enabled: !pending && editable,
    queryFn: async () => {
      const bundle = await readCardBundle(`${companyId}:${row.item_id}`);
      const rows = (bundle?.overview ?? []) as { link_id: string; supplier_name: string | null; is_preferred: boolean | null; is_active: boolean | null }[];
      return new Map(rows.filter((r) => r.is_active).map((r) => [r.link_id, { name: r.supplier_name ?? "Il fornitore", preferred: Boolean(r.is_preferred) }]));
    },
  });
  const proposal = decided.loaded && supplierInfo.isSuccess
    ? supplierUnitProposal({
        links: decided.links.filter((l) => supplierInfo.data.has(l.link_id)),
        preferredLinkIds: new Set([...supplierInfo.data].filter(([, v]) => v.preferred).map(([k]) => k)),
        deselectedLinkIds: extra?.deselectedLinks ?? [],
        assignedLinkIds: suppliers.map((s) => s.linkId),
        currentCode: decidedCode,
        productUnitCode: unit,
      })
    : null;
  const [proposalDeclined, setProposalDeclined] = useState(false);
  const savedQuantity = row.decided_quantity === null ? null : Number(row.decided_quantity);
  // Prima quantità: la card parte nell'U.M. predefinita del fornitore se quella attuale non è sua.
  const proposeUnit = Boolean(proposal && !proposal.compatible && !otherUnit && savedQuantity === null && !proposalDeclined);
  const ownDefault = productPurchaseDefault(ownUnits, row.product_id);
  const firstUnit = savedQuantity === null && !otherUnit && !proposalDeclined
    ? ownDefault ?? (proposeUnit && proposal ? { unitId: proposal.defaultUnit.unit_id, code: proposal.defaultUnit.code } : null)
    : null;
  const proposedKey = firstUnit ? (normUnit(firstUnit.code) === normUnit(unit) ? PRODUCT_UNIT : firstUnit.unitId) : null;
  const unitLabel = (firstUnit?.code ?? decidedCode).trim().toLowerCase();
  useEffect(() => {
    onProposeUnit?.(firstUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUnit?.unitId, firstUnit?.code]);
  // Quantità già salvata in U.M. che il fornitore non vende: si segnala e si corregge solo con conferma.
  const unitMismatch = Boolean(proposal && !proposal.compatible && savedQuantity !== null && savedQuantity > 0 && onFixUnit);
  const supplierName = proposal ? (supplierInfo.data?.get(proposal.linkId)?.name ?? "Il fornitore") : "";
  const [fix, setFix] = useState<{ unitId: string; code: string; value: string } | null>(null);
  // Note libere del prodotto: solo testo di presentazione, mai quantità, quote o ordini.
  const itemNotes = extra?.itemNotes ?? null;
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const noteLine = itemNotes ? (
    <p className="flex items-start gap-1 text-[11px] leading-tight text-muted-foreground">
      <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{itemNotes}</span>
    </p>
  ) : null;
  const suggested = row.current_suggested ?? row.suggested_quantity;
  const isFavorite = Boolean(extra?.isFavorite);
  const isRow = layout === "row";
  // Quantità confermata: bloccata finché non si sblocca (fornitori restano modificabili).
  const locked = quantityLocked ?? Boolean(extra?.lockedAt);
  // Inventario modificato dopo la conferma: card da ricontrollare (mai se la riga è già in un ordine).
  const recheck = Boolean(extra?.inventoryChangedAt) && extra?.orderState !== "ordinato";

  // Senza conversione l'equivalente non esiste: non si somma e non si inventa.
  const assigned = suppliers.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const target = row.decided_quantity === null ? null : Number(row.decided_quantity);
  // Quantità in altra U.M.: nessun confronto in U.M. prodotto (mai 3 casse → 3 kg).
  const gap = target === null || otherUnit ? null : Math.round((target - assigned) * 1000) / 1000;
  const equivalent = otherUnit && target !== null && decidedOption?.factor ? target * decidedOption.factor : null;

  const image = (cls: string) =>
    extra?.imageUrl ? (
      <img src={extra.imageUrl} alt="" loading="lazy" className={cn("shrink-0 rounded-sm border border-border object-cover", cls)} />
    ) : (
      <span className={cn("flex shrink-0 items-center justify-center rounded-sm border border-border bg-muted", cls)}>
        <Package className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    );

  const statusBadge = excluded ? <span className="text-xs font-semibold text-muted-foreground">Non acquistare</span> : !show.status && !show.assignStatus ? null : pending ? (
    show.status ? (
      <span
        className={cn(
          "rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none",
          evaluation?.status === "da_acquistare"
            ? "bg-success/15 text-success"
            : evaluation?.status === "non_acquistare"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/20 text-foreground",
        )}
      >
        {evaluationBadge(evaluation, unit)}
      </span>
    ) : null
  ) : (
    <span className="flex items-center gap-1">
      {show.status ? (
        <span className="rounded-sm border border-border px-1.5 py-1 text-[9px] font-bold uppercase leading-none">In lista</span>
      ) : null}
      {show.assignStatus ? (
        <span
          className={cn(
            "rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase leading-none",
            row.status === "assegnata" && locked ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {rowLabel(factsFromRow(row, locked))}
        </span>
      ) : null}
    </span>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-7 w-7 px-0", isFavorite && "text-primary")}
        aria-label={isFavorite ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
        title={isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
        disabled={favoritePending}
        onClick={onToggleFavorite}
      >
        <Star className={cn("size-3.5", isFavorite && "fill-current")} />
      </Button>
      {pending ? null : (
      <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 px-0" aria-label={`Altre azioni ${row.code}`}>
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpenSuppliers}>
            <Truck aria-hidden="true" />
            Fornitori e ripartizione
          </DropdownMenuItem>
          {onSaveNotes ? (
            <DropdownMenuItem onClick={() => { setNoteDraft(itemNotes ?? ""); setNoteOpen(true); }}>
              <StickyNote aria-hidden="true" />
              {itemNotes ? "Modifica nota" : "Aggiungi nota"}
            </DropdownMenuItem>
          ) : null}
          {editable && (row.suppliers_available > 0 || suppliers.length) ? (
            <DropdownMenuItem onClick={onOpenSuppliers}>
              <Plus aria-hidden="true" />
              Aggiungi fornitore
            </DropdownMenuItem>
          ) : null}
          {onCopyToOwnProducts ? (
            <DropdownMenuItem onClick={onCopyToOwnProducts}>
              <Copy aria-hidden="true" />
              Copia nei miei prodotti
            </DropdownMenuItem>
          ) : null}
          {editable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                <Trash2 aria-hidden="true" />
                Rimuovi dalla Lista
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onSaveNotes ? (
        <Dialog open={noteOpen} onOpenChange={(o) => { if (!o) setNoteOpen(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Note di {name}</DialogTitle>
              <DialogDescription>Nota libera su questa Lista: non cambia quantità, fornitori o ordini.</DialogDescription>
            </DialogHeader>
            <Textarea
              value={noteDraft}
              rows={3}
              maxLength={1000}
              aria-label={`Note di ${name}`}
              placeholder="Es. consegna al mattino, grappolo grosso…"
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={noteSaving} onClick={() => setNoteOpen(false)}>Annulla</Button>
              <Button
                type="button"
                disabled={noteSaving}
                onClick={async () => {
                  setNoteSaving(true);
                  try {
                    const ok = await onSaveNotes(noteDraft.trim() ? noteDraft.trim() : null);
                    if (ok) setNoteOpen(false);
                  } finally {
                    setNoteSaving(false);
                  }
                }}
              >
                {noteSaving ? "Salvataggio…" : "Salva nota"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      </>
      )}
    </>
  );

  const confirmTarget = pending ? (pendingQuantity ?? null) : draftQuantity !== undefined ? draftQuantity : target;
  const editLocked = (locked && !autoConfirm) || excluded;

  const fixValue = fix ? Number(fix.value.replace(",", ".")) : NaN;
  const unitFixBlock = unitMismatch && proposal ? (
    <div className="space-y-1 rounded-md border border-warning/60 bg-warning/15 p-2 text-xs" role="alert">
      <p className="font-semibold text-warning-foreground">{unitsSoldText(supplierName, proposal.units)}. Seleziona l&apos;U.M. corretta.</p>
      <div className="flex flex-wrap gap-1">
        {proposal.units.map((u) => (
          <Button key={u.unit_id} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs"
            disabled={lockPending} onClick={() => setFix({ unitId: u.unit_id, code: u.code, value: String(savedQuantity ?? "") })}>
            Usa {u.code}
          </Button>
        ))}
      </div>
      <AlertDialog open={fix !== null} onOpenChange={(o) => { if (!o) setFix(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Correggi l&apos;U.M. di {name}</AlertDialogTitle>
            <AlertDialogDescription>
              Stai cambiando {qty(savedQuantity ?? 0)} {decidedCode} in {fix && Number.isFinite(fixValue) ? qty(fixValue) : "—"} {fix?.code}. Non è una conversione automatica: confermi che vuoi acquistare {fix && Number.isFinite(fixValue) ? qty(fixValue) : "—"} {fix?.code}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input inputMode="decimal" aria-label={`Quantità in ${fix?.code ?? ""}`} value={fix?.value ?? ""}
            onChange={(e) => setFix((f) => (f ? { ...f, value: e.target.value } : f))} />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={!fix || !Number.isFinite(fixValue) || fixValue <= 0}
              onClick={() => { if (fix && fixValue > 0) onFixUnit?.(fix.unitId, fix.code, fixValue); setFix(null); }}>
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  ) : proposeUnit && proposal ? (
    <p className="text-[11px] text-muted-foreground">U.M. di {supplierName}: {proposal.units.map((u) => u.code).join(" / ")}</p>
  ) : null;

  const quantityBlock = (
    <div className="flex min-w-0 items-center gap-1.5">
      {editable ? quantityInput : <span className="text-sm font-semibold">{target === null ? "—" : qty(target)}</span>}
      {editable && onClearQuantity && target !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 max-md:h-8 w-7 shrink-0 px-0 text-muted-foreground"
          aria-label={`Cancella la quantità da acquistare di ${name}`}
          title="Cancella la quantità"
          disabled={editLocked || lockPending}
          onClick={onClearQuantity}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
      {editable && !pending && onUnitChange ? (
        <Select
          value={proposedKey ?? decidedKey}
          disabled={editLocked || lockPending}
          onValueChange={(key) => {
            if (key === proposedKey) return;
            setProposalDeclined(true);
            if (key === PRODUCT_UNIT) return onUnitChange(null, null);
            const option = unitOptions.find((o) => o.key === key);
            if (option) onUnitChange(option.unitId, option.code);
          }}
        >
          <SelectTrigger className="h-9 max-md:h-8 w-auto min-w-16 max-w-28 shrink-0 px-2 text-xs font-semibold" aria-label={`U.M. da acquistare ${name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value={PRODUCT_UNIT}>{unit || "U.M. prodotto"}</SelectItem>
            {unitOptions.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.code}
              </SelectItem>
            ))}
            {otherUnit && !decidedOption && extra?.decidedUnitCode ? (
              <SelectItem value={decidedKey}>{extra.decidedUnitCode}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      ) : (
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{decidedCode || "—"}</span>
      )}
      {saving ? <span className="shrink-0 text-[10px] font-semibold text-muted-foreground" role="status">Salvataggio in corso…</span> : null}
      {unitNotOffered && !unitMismatch ? (
        <span
          className="shrink-0 whitespace-nowrap rounded-md border border-warning/60 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground"
          title="Nessun fornitore attivo offre più questa U.M.: verificala o cambiala a mano"
        >
          U.M. non più offerta
        </span>
      ) : null}
    </div>
  );
  const equivalentNote =
    otherUnit && target !== null ? (
      <p className="text-[11px] leading-tight text-muted-foreground">
        {equivalent !== null ? `≈ ${qty(equivalent)} ${unit}` : "Non convertibile"}
      </p>
    ) : null;

  const quickButtons = (cls: string) =>
    editable ? (
      <div className="grid grid-cols-4 gap-1">
        {QUICK_STEPS.map((step) => (
          <Button
            key={step}
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-w-0 gap-0.5 overflow-hidden px-0 text-xs font-bold", cls)}
            aria-label={`Aggiungi ${step} ${unitLabel} alla quantità da acquistare di ${name}`}
            disabled={editLocked || lockPending}
            onClick={() => onQuickAdd(step)}
          >
            +{step}
            {unitLabel ? <span className="font-semibold">{unitLabel}</span> : null}
          </Button>
        ))}
      </div>
    ) : null;

  const lockNote = locked && extra?.lockedAt ? (
    <p className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
      <Lock className="size-3" aria-hidden="true" /> Confermata {dateTimeShort(extra.lockedAt)}
    </p>
  ) : null;
  const memoryLine = memoryNote ? (
    <p className="text-[10px] italic leading-tight text-muted-foreground">{memoryNote}</p>
  ) : null;

  const recheckNote = recheck ? (
    <p className="flex items-center gap-1 text-[10px] font-semibold text-warning-foreground">
      <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
      Inventario cambiato: prima {extra?.inventoryPreviousQuantity !== null && extra?.inventoryPreviousQuantity !== undefined ? qty(extra.inventoryPreviousQuantity) : "—"}
      {stock?.lastQuantity !== null && stock?.lastQuantity !== undefined ? `, ora ${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}` : ""}
    </p>
  ) : null;

  const totals =
    suppliers.length && target !== null ? (
      <p
        className={cn(
          "text-[11px] font-semibold leading-tight",
          gap !== null && gap < 0 && "text-destructive",
          gap === 0 && "text-success",
        )}
      >
        {otherUnit
          ? `Da acquistare ${qty(target)} ${decidedCode}`
          : `Assegnato ${qty(assigned)} / ${qty(target)} ${unit}`}
        {otherUnit ? "" : gap === null || gap === 0 ? " · completo" : gap > 0 ? "" : ` · Eccedenza +${qty(-gap)} ${unit}`}
      </p>
    ) : suppliers.length ? (
      <p className="text-[11px] leading-tight text-muted-foreground">Assegnato {qty(assigned)} {unit} · obiettivo non indicato</p>
    ) : null;

  const splitSummary = (
    <CardSuppliers
      companyId={companyId}
      row={row}
      pending={pending}
      editable={editable}
      assignments={suppliers}
      show={show}
      target={locked ? target : null}
      decidedUnitId={otherUnit ? (extra?.decidedUnitId ?? null) : null}
      decidedCode={decidedCode}
      lockedAt={extra?.lockedAt ?? null}
      listConfirmed={listConfirmed}
      deselectedLinks={extra?.deselectedLinks ?? []}
      memory={memory}
    />
  );

  const orderState =
    extra?.orderState === "ordinato" ? (
      <p className="text-[11px] font-semibold text-success">In ordine</p>
    ) : extra?.orderState === "in_parte" ? (
      <p className="text-[11px] font-semibold text-muted-foreground">In parte in ordine</p>
    ) : null;

  const excludedBlock = <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-muted-foreground">Non acquistare</span>{editable && onRestore ? <Button size="sm" variant="outline" disabled={lockPending} onClick={onRestore}>Ripristina</Button> : null}</div>;
  if (quantityOnly) return excluded ? excludedBlock : <div className="space-y-1.5">
    <ShoppingQuantityEditor input={quantityBlock} details={unitFixBlock} editable={editable} locked={false} busy={lockPending || saving}
      ready={confirmTarget !== null && confirmTarget >= 0} name={name} onConfirm={onToggleLock} />
    {onNonPurchase ? <Button size="sm" variant="ghost" className="h-7 px-1 text-xs" disabled={lockPending || saving} onClick={onNonPurchase}>Non acquistare</Button> : null}
  </div>;

  if (isMobile && !isRow && onToggleMobile) {
    const displayedQuantity = pending ? (pendingQuantity ?? evaluation?.decided_quantity ?? null) : confirmTarget;
    const warning = unitMismatch && proposal ? unitsSoldText(supplierName, proposal.units)
      : unitNotOffered ? "U.M. non più offerta: da verificare"
      : row.status === "da_verificare" ? "Assegnazione da verificare"
      : row.untranslatable > 0 ? "Ripartizioni senza conversione: da verificare"
      : row.under_minimum > 0 ? "Quantità sotto il minimo del fornitore"
      : gap !== null && gap < 0 ? `Ripartizioni: +${qty(-gap)} ${unit} in eccesso` : null;
    return <ShoppingMobileCard id={row.item_id} name={name} open={mobileOpen} onToggle={onToggleMobile}
      locked={locked} recheck={recheck} busy={lockPending || saving}
      header={<div className="flex min-w-0 items-start gap-2">
        {show.photo ? image("size-11") : null}
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold uppercase leading-tight break-words">{name}</p>
          <div className="mt-0.5">{statusBadge}</div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>}
      warnings={<>
        {warning ? <p role="alert" className="mt-1.5 flex items-start gap-1 rounded-sm bg-warning/15 px-2 py-1 text-xs text-warning-foreground"><TriangleAlert className="mt-0.5 size-3 shrink-0" />{warning}</p> : null}
        {recheck ? <div className="mt-1">{recheckNote}</div> : null}
      </>}
      summary={<span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {show.lastCount ? <span className="w-full text-xs font-normal text-muted-foreground">Ult. conteggio {stock?.lastQuantity != null ? `${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}` : "—"}</span> : null}
        {show.stock ? <span className="text-xs font-normal text-muted-foreground">Giacenza {stock?.stock != null ? `${qty(stock.stock)} ${stock.stockUnit ?? unit}` : "—"}{show.toBuy ? " ·" : ""}</span> : null}
        {show.toBuy ? <span className="text-base font-bold text-foreground">{excluded ? "Non acquistare" : `Da acquistare ${displayedQuantity === null ? "—" : `${qty(displayedQuantity)} ${decidedCode}`}`}</span> : null}
      </span>}
      supplier={show.suppliers && !excluded ? <span className="min-w-0 break-words">Fornitore: <span className="font-medium text-foreground">{suppliers[0]?.name ?? "—"}{suppliers.length > 1 ? ` + ${suppliers.length - 1}` : ""}</span></span> : null}
      suggested={show.suggested && suggested != null && suggested > 0 ? <span>Suggerita {qty(suggested)} {unit}</span> : null}>
      {show.code || show.category ? <p className="max-md:text-[10px] text-xs text-muted-foreground">{[show.code ? row.code : null, show.category ? extra?.category : null].filter(Boolean).join(" · ")}</p> : null}
      {excluded ? excludedBlock : show.toBuy ? <ShoppingQuantityEditor input={quantityBlock} details={<>{unitFixBlock}{equivalentNote}</>}
        editable={editable} locked={locked} busy={lockPending || saving} ready={confirmTarget !== null && confirmTarget >= 0}
        name={name} onConfirm={onToggleLock} quick={show.quick ? quickButtons("h-8 max-md:h-7") : null} /> : null}
      {show.lockDate ? lockNote : null}
      {memoryLine}
      {noteLine}
      {show.suppliers && !excluded ? <div className="space-y-1 border-t border-border pt-1.5 max-md:pt-1">{splitSummary}{show.splits ? totals : null}{orderState}</div> : null}
    </ShoppingMobileCard>;
  }

  if (isRow) {
    const rowMeta = [
      show.category ? extra?.category ?? "—" : null,
      show.suggested ? `Suggerita ${suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}` : null,
      show.stock && stock?.stock !== null && stock?.stock !== undefined ? `Giacenza ${qty(stock.stock)} ${stock.stockUnit ?? unit}` : null,
      show.lastCount && stock?.lastQuantity !== null && stock?.lastQuantity !== undefined
        ? `Ult. conteggio ${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}`
        : null,
    ].filter(Boolean);
    return (
      <article id={`item-${row.item_id}`} className={cn("@container min-w-0 rounded-md border-2 border-border bg-card px-2 py-1.5", locked && "border-primary/60 bg-primary/15", recheck && "border-warning bg-warning/10")}>
        <div
          className={cn(
            "grid items-center gap-x-2 gap-y-1.5",
            show.photo
              ? "grid-cols-[36px_minmax(0,1fr)_auto] @min-[860px]:grid-cols-[36px_minmax(0,1.2fr)_minmax(250px,1fr)_minmax(0,1.2fr)_auto]"
              : "grid-cols-[minmax(0,1fr)_auto] @min-[860px]:grid-cols-[minmax(0,1.2fr)_minmax(250px,1fr)_minmax(0,1.2fr)_auto]",
          )}
        >
          {show.photo ? image("size-9") : null}
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold uppercase leading-tight" title={name}>
              {show.code ? <span className="text-muted-foreground">{row.code} · </span> : null}
              {name}
            </p>
            {rowMeta.length ? <p className="truncate text-[11px] leading-tight text-muted-foreground">{rowMeta.join(" · ")}</p> : null}
          </div>
          <div className="flex items-center justify-end gap-0.5 @min-[860px]:order-2">
            {statusBadge}
            {actions}
          </div>
          <div className={cn("grid min-w-0 gap-1 @min-[860px]:col-span-1", show.photo ? "col-span-3" : "col-span-2")}>
            {excluded ? excludedBlock : show.toBuy ? <ShoppingQuantityEditor input={quantityBlock} details={<>{unitFixBlock}{equivalentNote}</>} editable={editable} locked={locked} busy={lockPending || saving} ready={confirmTarget !== null && confirmTarget >= 0} name={name} onConfirm={onToggleLock} quick={show.quick ? quickButtons("h-8") : null} /> : null}
          {show.lockDate ? lockNote : null}
            {memoryLine}
            {noteLine}
          {recheckNote}
          </div>
          <div className={cn("min-w-0 space-y-0.5 @min-[860px]:order-1 @min-[860px]:col-span-1", show.photo ? "col-span-3" : "col-span-2")}>
            {show.suppliers && !excluded ? (
              <>
                {splitSummary}
                {show.splits ? totals : null}
                {orderState}
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  const anyStat = show.lastCount || show.stock || show.suggested;
  return (
    <article id={`item-${row.item_id}`} className={cn("@container flex h-full min-w-0 flex-col gap-1.5 rounded-md border-2 border-border bg-card p-2 @max-[260px]:p-1.5", locked && "border-primary/60 bg-primary/15", recheck && "border-warning bg-warning/10")}>
      <div className={cn("grid items-start gap-2 @max-[260px]:gap-1.5", show.photo ? "grid-cols-[44px_minmax(0,1fr)] @max-[260px]:grid-cols-[32px_minmax(0,1fr)]" : "grid-cols-1")}>
        {show.photo ? image("size-11 @max-[260px]:size-8") : null}
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight @max-[260px]:text-xs" title={name}>
            {name}
          </p>
          {show.code || (show.category && extra?.category) ? (
            <p className="truncate text-[11px] leading-tight text-muted-foreground @max-[260px]:text-[10px]">
              {[show.code ? `Cod. ${row.code}` : null, show.category ? extra?.category : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1">
        {statusBadge ?? <span />}
        <div className="flex items-center">{actions}</div>
      </div>

      {anyStat ? (
        <dl className="grid grid-flow-col auto-cols-fr gap-1 rounded-sm bg-muted/40 px-1.5 py-1 text-[10px] leading-tight">
          {show.lastCount ? (
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">Ult. conteggio</dt>
              <dd className="truncate font-semibold">
                {stock?.lastQuantity !== null && stock?.lastQuantity !== undefined ? `${qty(stock.lastQuantity)} ${stock.lastUnit ?? unit}` : "—"}
              </dd>
            </div>
          ) : null}
          {show.stock ? (
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">Giacenza</dt>
              <dd className="truncate font-semibold">{stock?.stock !== null && stock?.stock !== undefined ? `${qty(stock.stock)} ${stock.stockUnit ?? unit}` : "—"}</dd>
            </div>
          ) : null}
          {show.suggested ? (
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">Suggerita</dt>
              <dd className="truncate font-semibold">{suggested !== null && suggested !== undefined ? `${qty(suggested)} ${unit}` : "—"}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {show.toBuy || show.quick || (show.lockDate && lockNote) ? (
        <div className="space-y-1">
          {excluded ? excludedBlock : show.toBuy ? <ShoppingQuantityEditor input={quantityBlock} details={<>{unitFixBlock}{equivalentNote}</>}
            editable={editable} locked={locked} busy={lockPending || saving}
            ready={confirmTarget !== null && confirmTarget >= 0} name={name} onConfirm={onToggleLock}
            quick={show.quick ? quickButtons("h-8 @max-[260px]:h-7 @max-[260px]:text-[11px]") : null} /> : null}
            {show.lockDate ? lockNote : null}
            {memoryLine}
            {noteLine}
            {recheckNote}
        </div>
      ) : null}

      {show.suppliers && !excluded ? (
        <div className="mt-auto space-y-1 border-t border-border pt-1.5">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Fornitori</p>
          {splitSummary}
          {show.splits ? totals : null}
          {orderState}
        </div>
      ) : null}
    </article>
  );
}
