import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cancelDirectPurchase, confirmDirectPurchase, updateDirectPurchaseDraft } from "@/lib/direct-purchase.functions";
import { directLineTotal, directTotals, parseDecimal, quotaChanged } from "@/lib/direct-purchase";
import { qty } from "@/lib/inventory";

const NONE = "__none__";
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

type LineState = { id: string; quantity: string; unitId: string | null; unitPrice: string; priceUnitId: string | null; notes: string };
type HeaderState = { where: string; date: string; total: string; notes: string; buyer: string };

export const STATUS_LABEL: Record<string, string> = { bozza: "Bozza", confermato: "Confermato", annullato: "Annullato" };

/**
 * Bozza di acquisto diretto (AD): modificabile solo in bozza; conferma e annullamento decisi dal database.
 * currentQuotas: quota diretta attuale della Lista per riga (item_id → quantità e codice U.M.), per segnalare differenze.
 */
export function DirectPurchaseDraftDialog({
  docId,
  companyId,
  currentQuotas,
  onOpenChange,
  onChanged,
}: {
  docId: string | null;
  companyId: string;
  currentQuotas: Record<string, { quantity: number | null; unit_code: string | null; done: boolean }>;
  onOpenChange: (open: boolean) => void;
  onChanged: (res?: { list_closed?: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const runUpdate = useServerFn(updateDirectPurchaseDraft);
  const runConfirm = useServerFn(confirmDirectPurchase);
  const runCancel = useServerFn(cancelDirectPurchase);

  const doc = useQuery({
    queryKey: ["direct-purchase", docId],
    enabled: !!docId,
    queryFn: async () => {
      const { data: head, error } = await supabase.from("direct_purchases").select("*").eq("id", docId as string).single();
      if (error) throw new Error(error.message);
      const { data: items, error: e2 } = await supabase
        .from("direct_purchase_items")
        .select("*")
        .eq("direct_purchase_id", docId as string)
        .order("sort_order");
      if (e2) throw new Error(e2.message);
      return { head, items: items ?? [] };
    },
  });
  const units = useQuery({
    queryKey: ["company-active-units", companyId],
    enabled: !!docId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units_of_measure")
        .select("id, code, description")
        .eq("company_id", companyId)
        .eq("status", "attivo")
        .order("code");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [header, setHeader] = useState<HeaderState>({ where: "", date: "", total: "", notes: "", buyer: "" });
  const [lines, setLines] = useState<LineState[]>([]);
  const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<null | "confirm" | "cancel">(null);

  useEffect(() => {
    if (!doc.data || dirty) return;
    const h = doc.data.head;
    setHeader({
      where: h.purchased_where ?? "",
      date: h.purchase_date ?? "",
      total: h.total_paid == null ? "" : String(h.total_paid).replace(".", ","),
      notes: h.notes ?? "",
      buyer: h.buyer_label ?? "",
    });
    setLines(
      doc.data.items.map((i) => ({
        id: i.id,
        quantity: i.quantity == null ? "" : String(i.quantity).replace(".", ","),
        unitId: i.unit_id,
        unitPrice: i.unit_price == null ? "" : String(i.unit_price).replace(".", ","),
        priceUnitId: i.price_unit_id,
        notes: i.notes ?? "",
      })),
    );
  }, [doc.data, dirty]);

  useEffect(() => {
    if (!docId) setDirty(false);
  }, [docId]);

  const editable = doc.data?.head.status === "bozza";
  const unitCode = (id: string | null) => units.data?.find((u) => u.id === id)?.code ?? null;
  const calc = lines.map((l) => ({
    quantity: parseDecimal(l.quantity),
    unitId: l.unitId,
    unitPrice: parseDecimal(l.unitPrice),
    priceUnitId: l.priceUnitId,
  }));
  const totalPaid = parseDecimal(header.total);
  const totals = directTotals(
    calc.map((c) => ({ ...c, quantity: Number.isNaN(c.quantity) ? null : c.quantity, unitPrice: Number.isNaN(c.unitPrice) ? null : c.unitPrice })),
    totalPaid == null || Number.isNaN(totalPaid) ? null : totalPaid,
  );

  const changedRows = (doc.data?.items ?? []).filter((i) => {
    if (!i.source_item_id || doc.data?.head.status !== "bozza") return false;
    const cur = currentQuotas[i.source_item_id];
    return quotaChanged(
      { quantity: i.planned_quantity, unitId: i.planned_unit_code },
      cur && !cur.done ? { quantity: cur.quantity, unitId: cur.unit_code } : null,
    );
  });

  const payload = () => {
    const bad = (v: string, n: number | null) => v.trim() !== "" && (n === null || Number.isNaN(n));
    if (bad(header.total, totalPaid)) throw new Error("Totale pagato non valido");
    return {
      id: docId as string,
      header: {
        purchased_where: header.where.trim() || null,
        purchase_date: header.date || null,
        total_paid: totalPaid == null || Number.isNaN(totalPaid) ? null : totalPaid,
        notes: header.notes.trim() || null,
        buyer_label: header.buyer.trim() || null,
      },
      lines: lines.map((l, idx) => {
        const q = calc[idx]?.quantity ?? null;
        const p = calc[idx]?.unitPrice ?? null;
        if (bad(l.quantity, q) || (q !== null && q <= 0)) throw new Error("Quantità non valida: deve essere maggiore di zero");
        if (bad(l.unitPrice, p)) throw new Error("Prezzo non valido");
        if (p !== null && !l.priceUnitId) throw new Error("Indica l'U.M. del prezzo");
        return { line_id: l.id, quantity: q, unit_id: l.unitId, unit_price: p, price_unit_id: l.priceUnitId, notes: l.notes.trim() || null };
      }),
    };
  };

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["direct-purchase", docId] }),
      queryClient.invalidateQueries({ queryKey: ["direct-purchases-list"] }),
    ]);

  const save = useMutation({
    mutationFn: async () => runUpdate({ data: payload() }),
    onSuccess: async () => {
      setDirty(false);
      await invalidate();
      toast.success("Bozza salvata");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: async () => {
      if (dirty) await runUpdate({ data: payload() });
      return runConfirm({ data: { id: docId as string } });
    },
    onSuccess: async (res) => {
      setDirty(false);
      await invalidate();
      toast.success("Acquisto diretto confermato");
      onChanged(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: async () => runCancel({ data: { id: docId as string } }),
    onSuccess: async () => {
      setDirty(false);
      await invalidate();
      toast.success("Bozza annullata: le quote tornano da gestire");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchLine = (id: string, p: Partial<LineState>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...p } : l)));
  };
  const patchHeader = (p: Partial<HeaderState>) => {
    setDirty(true);
    setHeader((h) => ({ ...h, ...p }));
  };
  const busy = save.isPending || confirm.isPending || cancel.isPending;

  const unitSelect = (value: string | null, onChange: (v: string | null) => void, label: string) => (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={!editable}>
      <SelectTrigger aria-label={label} className="h-9">
        <SelectValue placeholder="U.M." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {(units.data ?? []).map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={!!docId} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Acquisto diretto {doc.data?.head.number ?? ""}
            {doc.data ? <Badge variant={editable ? "outline" : "secondary"}>{STATUS_LABEL[doc.data.head.status]}</Badge> : null}
          </DialogTitle>
          <DialogDescription>
            Nessun fornitore e nessun invio: inserisci tu dove hai comprato e quanto hai pagato. La quota della Lista diventa gestita solo alla conferma.
          </DialogDescription>
        </DialogHeader>

        {doc.isLoading || !doc.data ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            {changedRows.length ? (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  La quota diretta nella Lista è cambiata dopo la bozza per: {changedRows.map((r) => r.product_name).join(", ")}.
                  La bozza conserva i valori di allora; per confermare annulla questa bozza e generane una nuova.
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="dp-buyer">Chi acquista</Label>
                <Input id="dp-buyer" value={header.buyer} disabled={!editable} placeholder="Collaboratore o fornitore nuovo…" onChange={(e) => patchHeader({ buyer: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dp-where">Dove ho comprato</Label>
                <Input id="dp-where" value={header.where} disabled={!editable} placeholder="Negozio, mercato, supermercato…" onChange={(e) => patchHeader({ where: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dp-date">Data dell'acquisto</Label>
                <Input id="dp-date" type="date" value={header.date} disabled={!editable} onChange={(e) => patchHeader({ date: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              {doc.data.items.map((it) => {
                const l = lines.find((x) => x.id === it.id);
                if (!l) return null;
                const t = directLineTotal({
                  quantity: parseDecimal(l.quantity),
                  unitId: l.unitId,
                  unitPrice: parseDecimal(l.unitPrice),
                  priceUnitId: l.priceUnitId,
                });
                const hasPrice = l.unitPrice.trim() !== "";
                return (
                  <div key={it.id} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{it.product_code ? `${it.product_code} · ` : ""}{it.product_name}</span>
                      <span className="text-muted-foreground">Quota della Lista: {qty(Number(it.planned_quantity))} {it.planned_unit_code ?? ""}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Quantità effettiva</Label>
                        <Input inputMode="decimal" value={l.quantity} disabled={!editable} onChange={(e) => patchLine(it.id, { quantity: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">U.M.</Label>
                        {unitSelect(l.unitId, (v) => patchLine(it.id, { unitId: v }), "U.M. della quantità")}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Prezzo unitario €</Label>
                        <Input inputMode="decimal" value={l.unitPrice} disabled={!editable} onChange={(e) => patchLine(it.id, { unitPrice: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">U.M. del prezzo</Label>
                        {unitSelect(l.priceUnitId, (v) => patchLine(it.id, { priceUnitId: v }), "U.M. del prezzo")}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {t !== null
                          ? `Totale riga: ${eur(t)}`
                          : hasPrice && l.unitId && l.priceUnitId && l.unitId !== l.priceUnitId
                            ? `Totale non calcolabile: quantità in ${unitCode(l.unitId)} e prezzo in ${unitCode(l.priceUnitId)}, nessuna conversione verificata`
                            : "Totale riga non calcolato"}
                      </span>
                    </div>
                    <Input placeholder="Note per questo prodotto" value={l.notes} disabled={!editable} onChange={(e) => patchLine(it.id, { notes: e.target.value })} />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Le U.M. sono solo quelle attive della tua azienda. Se ne manca una, aggiungila in Impostazioni → Azienda → Unità di misura.
              </p>
            </div>

            <div className="grid gap-3 rounded-md border border-border p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Somma delle righe calcolabili</div>
                <div className="font-semibold">{eur(totals.sum)}</div>
                {totals.notComputable ? <div className="text-xs text-muted-foreground">{totals.notComputable} righe non calcolabili</div> : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="dp-total" className="text-xs text-muted-foreground">Totale pagato €</Label>
                <Input id="dp-total" inputMode="decimal" value={header.total} disabled={!editable} onChange={(e) => patchHeader({ total: e.target.value })} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Differenza</div>
                <div className="font-semibold">{totals.difference === null ? "—" : eur(totals.difference)}</div>
                {totals.difference ? <div className="text-xs text-muted-foreground">Sconti o arrotondamenti: il salvataggio non è bloccato</div> : null}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="dp-notes">Note</Label>
              <Textarea id="dp-notes" value={header.notes} disabled={!editable} onChange={(e) => patchHeader({ notes: e.target.value })} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {editable ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setAsk("cancel")}>Annulla bozza</Button>
              <Button variant="outline" disabled={busy || !dirty} onClick={() => save.mutate()}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Salva bozza
              </Button>
              <Button disabled={busy || changedRows.length > 0} onClick={() => setAsk("confirm")}>
                {confirm.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Conferma acquisto
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          )}
        </DialogFooter>

        <AlertDialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{ask === "confirm" ? "Confermi l'acquisto?" : "Annulli la bozza?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {ask === "confirm"
                  ? "Le quote dirette diventano gestite nella Lista e il documento non sarà più modificabile. La giacenza non cambia."
                  : "Il documento resta nello storico come annullato e le quote tornano da gestire."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Indietro</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const a = ask;
                  setAsk(null);
                  if (a === "confirm") confirm.mutate();
                  else cancel.mutate();
                }}
              >
                {ask === "confirm" ? "Conferma" : "Annulla bozza"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
