import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { qty } from "@/lib/inventory";
import { confirmAssignmentCoverage, type GenerationLine } from "@/lib/order-generation.functions";
import { planLineEdit, type EditUnit } from "@/lib/order-line-edit";
import { readCardBundle } from "@/lib/shopping-card-reads";
import { commitShoppingListItemQuantity } from "@/lib/shopping-list.functions";

/**
 * Matita di una riga di «Genera ordini»: quantità + U.M. del fornitore, salvate col salvataggio atomico
 * esistente della Lista. Solo quote singole e non ancora in un ordine; nessuna conversione inventata.
 */
export function OrderLineEdit({
  companyId,
  line,
  splitAcrossSuppliers,
  onSaved,
  onGoToItem,
}: {
  companyId: string;
  line: GenerationLine;
  splitAcrossSuppliers: boolean;
  onSaved: (quantity: number) => Promise<void> | void;
  onGoToItem: () => void;
}) {
  const runCommit = useServerFn(commitShoppingListItemQuantity);
  const runCoverage = useServerFn(confirmAssignmentCoverage);
  const [editing, setEditing] = useState(false);
  const [qtyText, setQtyText] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [warning, setWarning] = useState<null | { from: string; to: string }>(null);

  const units = useQuery({
    queryKey: ["order-line-units", line.item_id, line.link_id],
    enabled: editing,
    queryFn: async () => {
      const bundle = await readCardBundle(`${companyId}:${line.item_id}`);
      const link = (bundle?.supplier_units as { link_id: string; units: EditUnit[] | null }[] | undefined)?.find((l) => l.link_id === line.link_id);
      return link?.units ?? [];
    },
  });

  const current = Number(line.saved_quantity ?? line.quantity);
  const plan = () =>
    planLineEdit({
      currentQuantity: current,
      currentUnitId: line.purchase_unit_id ?? null,
      currentCode: line.unit_code ?? "",
      nextQuantityText: qtyText,
      nextUnitId: unitId,
      units: units.data ?? [],
      coverageConfirmed: Boolean(line.coverage_confirmed),
      inOrder: Boolean(line.in_order),
    });

  const save = useMutation({
    mutationFn: async () => {
      const p = plan();
      if (p.kind !== "save") return null;
      const q = Number(qtyText.replace(",", "."));
      const unit = (units.data ?? []).find((u) => u.unit_id === unitId)!;
      // La conferma data per la vecchia quantità/U.M. non vale per la nuova: va tolta prima, poi riconfermata.
      let expectedAssignAt = line.assign_at ?? null;
      if (p.revokeFirst) {
        await runCoverage({ data: { assignmentId: line.assignment_id, confirm: false } });
        // La revoca aggiorna la ripartizione: si rilegge il suo nuovo istante (stessa regola dell'anteprima).
        const { data: latest, error } = await supabase
          .from("shopping_list_item_suppliers")
          .select("updated_at")
          .eq("item_id", line.item_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        expectedAssignAt = latest?.updated_at ?? null;
      }
      await runCommit({
        data: {
          companyId,
          itemId: line.item_id,
          quantity: q,
          unitId: unit.unit_id,
          unitCode: unit.code,
          expectedQuantity: line.item_quantity ?? null,
          expectedAssignCount: line.assign_count ?? 0,
          expectedAssignAt,
          quotas: [{ link_id: line.link_id!, assignment_id: line.assignment_id, purchase_quantity: q, purchase_unit_id: unit.unit_id, manual_unit_code: null }],
          direct: null,
        },
      });
      return q;
    },
    onSuccess: async (q) => {
      setWarning(null);
      setEditing(false);
      if (q !== null) {
        toast.success("Quantità aggiornata");
        await onSaved(q);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!line.link_id || line.in_order) return null;

  if (!editing) {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-label="Modifica quantità e U.M."
        onClick={() => {
          setQtyText(String(current));
          setUnitId(line.purchase_unit_id ?? null);
          setEditing(true);
        }}
      >
        <Pencil className="size-4" />
      </Button>
    );
  }

  if (splitAcrossSuppliers) {
    return (
      <div className="col-span-full flex flex-wrap items-center gap-2 text-xs">
        <span>Prodotto ripartito tra più fornitori: modificalo dalla card per non alterare la ripartizione.</span>
        <Button size="sm" variant="outline" onClick={onGoToItem}>Vai alla card</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annulla</Button>
      </div>
    );
  }

  const onSaveClick = () => {
    const p = plan();
    if (p.kind === "invalid") return toast.error(p.reason);
    if (p.kind === "unchanged") return setEditing(false);
    if (p.needsUnitWarning) return setWarning({ from: p.fromCode, to: p.toCode });
    save.mutate();
  };

  return (
    <div className="col-span-full flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
      <Input inputMode="decimal" className="h-8 w-24 text-right" value={qtyText} onChange={(e) => setQtyText(e.target.value)} aria-label="Quantità" />
      {units.isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Select value={unitId ?? ""} onValueChange={setUnitId}>
          <SelectTrigger className="h-8 w-24" aria-label="U.M."><SelectValue placeholder="U.M." /></SelectTrigger>
          <SelectContent>
            {(units.data ?? []).map((u) => <SelectItem key={u.unit_id} value={u.unit_id}>{u.code}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Button size="sm" disabled={save.isPending || units.isLoading} onClick={onSaveClick}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Salva
      </Button>
      <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => setEditing(false)}>Annulla</Button>
      {line.coverage_confirmed ? <span className="w-full text-xs text-muted-foreground">Salvando, la quantità andrà confermata di nuovo.</span> : null}

      <AlertDialog open={warning !== null} onOpenChange={(o) => { if (!o) setWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambio di U.M.</AlertDialogTitle>
            <AlertDialogDescription>
              Stai cambiando {qty(current)} {warning?.from} in {qtyText} {warning?.to}. Non è una conversione automatica: confermi che vuoi acquistare {qtyText} {warning?.to}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate()}>Conferma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
