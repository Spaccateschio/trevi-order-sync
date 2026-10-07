import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyUnit } from "./sales-unit-manager";

/**
 * Passo 2 U.M.: configurazione della U.M. di magazzino, delle confezioni e delle
 * conversioni fornitore → U.M. di magazzino. Tutte le scritture passano dalle RPC
 * (autorizzazione nel database). Nessuna funzione operativa legge ancora questi dati.
 */

export type UnitConfigIssue = { product_id: string; reason_code: string; reason: string };

export function useUnitConfigIssues(companyId: string | null, productId?: string) {
  return useQuery({
    queryKey: ["um-config-issues", companyId, productId ?? "tutti"],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<UnitConfigIssue[]> => {
      const { data, error } = await supabase.rpc("product_unit_config_issues", {
        _company_id: companyId as string,
        ...(productId ? { _product_ids: [productId] } : {}),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as UnitConfigIssue[];
    },
  });
}

type StockPackage = {
  id: string;
  name: string;
  unit_id: string;
  stock_quantity: number;
  status: string;
  package_version: number;
  verified_stock_unit_id: string | null;
};

function useInvalidateUnitConfig(productId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["um-config-issues"] });
    void queryClient.invalidateQueries({ queryKey: ["product-stock-unit", productId] });
    void queryClient.invalidateQueries({ queryKey: ["stock-packages", productId] });
    void queryClient.invalidateQueries({ queryKey: ["supplier-conversions", productId] });
  };
}

function useProductStockUnit(productId: string) {
  return useQuery({
    queryKey: ["product-stock-unit", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("stock_unit_id, stock_base_at").eq("id", productId).single();
      if (error) throw new Error(error.message);
      return data as { stock_unit_id: string | null; stock_base_at: string | null };
    },
  });
}

function useStockPackages(productId: string) {
  return useQuery({
    queryKey: ["stock-packages", productId],
    queryFn: async (): Promise<StockPackage[]> => {
      const { data, error } = await supabase
        .from("product_stock_packages")
        .select("id, name, unit_id, stock_quantity, status, package_version, verified_stock_unit_id")
        .eq("product_id", productId)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as StockPackage[];
    },
  });
}

function parseNumber(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function IssuesList({ issues }: { issues: UnitConfigIssue[] }) {
  if (!issues.length) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertDescription>
        <p className="font-medium">Configurazione U.M. da completare</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
          {issues.map((issue, index) => <li key={`${issue.reason_code}-${index}`}>{issue.reason}</li>)}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Tab Inventario: U.M. Danea (informativa), U.M. di magazzino, confezioni e motivi da completare. */
export function StockUnitSection({ companyId, productId, daneaUm, units, editable }: {
  companyId: string;
  productId: string;
  daneaUm: string | null;
  units: CompanyUnit[];
  editable: boolean;
}) {
  const invalidate = useInvalidateUnitConfig(productId);
  const stockQuery = useProductStockUnit(productId);
  const packagesQuery = useStockPackages(productId);
  const issuesQuery = useUnitConfigIssues(companyId, productId);
  const [pendingUnit, setPendingUnit] = useState<string | null>(null);
  const [packageDraft, setPackageDraft] = useState<{ id: string | null; name: string; unitId: string; quantity: string; active: boolean } | null>(null);

  const stockUnitId = stockQuery.data?.stock_unit_id ?? null;
  const unitCode = (id: string | null | undefined) => units.find((unit) => unit.id === id)?.code ?? "—";
  const stockCode = stockUnitId ? unitCode(stockUnitId) : null;
  const differsFromDanea = Boolean(stockCode && daneaUm && stockCode.toLowerCase() !== daneaUm.trim().toLowerCase());

  const unitMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const { error } = await supabase.rpc("set_product_stock_unit", { _product_id: productId, _unit_id: unitId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("U.M. di magazzino aggiornata"); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setPendingUnit(null),
  });

  const packageMutation = useMutation({
    mutationFn: async (draft: NonNullable<typeof packageDraft>) => {
      const quantity = parseNumber(draft.quantity);
      if (quantity === null || Number.isNaN(quantity)) throw new Error("Indica la quantità equivalente");
      const { error } = await supabase.rpc("manage_product_stock_package", {
        _product_id: productId,
        _package_id: draft.id as string,
        _name: draft.name,
        _unit_id: draft.unitId,
        _stock_quantity: quantity,
        _active: draft.active,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Confezione salvata"); setPackageDraft(null); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeUnits = units.filter((unit) => unit.status === "attivo");

  return (
    <section aria-labelledby="stock-unit-title" className="space-y-3 rounded-lg border border-border p-3">
      <h3 id="stock-unit-title" className="text-sm font-semibold">U.M. di magazzino</h3>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">U.M. Danea</dt>
          <dd className="mt-1 flex items-center gap-2 text-sm"><Badge variant="outline" className="font-mono">{daneaUm?.trim() || "—"}</Badge><span className="text-xs text-muted-foreground">solo informativa</span></dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">U.M. di magazzino</dt>
          <dd className="mt-1 space-y-1">
            <Select value={stockUnitId ?? ""} disabled={!editable || unitMutation.isPending || stockQuery.isLoading} onValueChange={(value) => { if (value !== stockUnitId) setPendingUnit(value); }}>
              <SelectTrigger aria-label="U.M. di magazzino" className="w-full sm:w-48"><SelectValue placeholder="Da impostare" /></SelectTrigger>
              <SelectContent>
                {activeUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code} — {unit.description}</SelectItem>)}
              </SelectContent>
            </Select>
            {!stockUnitId && !stockQuery.isLoading ? <p className="text-xs font-medium text-destructive">U.M. magazzino da impostare{daneaUm ? ` (Danea: ${daneaUm})` : ""}</p> : null}
            {differsFromDanea ? <p className="text-xs text-muted-foreground">Diversa da Danea</p> : null}
            {stockQuery.data?.stock_base_at ? <p className="text-xs text-muted-foreground">Base dal {new Date(stockQuery.data.stock_base_at).toLocaleDateString("it-IT")}</p> : null}
          </dd>
        </div>
      </dl>

      <Alert>
        <Info />
        <AlertDescription className="text-xs">La nuova U.M. di magazzino è configurata ma non è ancora utilizzata dall'Inventario. Diventerà operativa con il Passo 3.</AlertDescription>
      </Alert>

      <IssuesList issues={issuesQuery.data ?? []} />

      <div className="space-y-2 border-t border-border pt-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Confezioni</h4>
          {editable ? <Button type="button" size="sm" variant="outline" disabled={!stockUnitId} onClick={() => setPackageDraft({ id: null, name: "", unitId: "", quantity: "", active: true })}><Plus />Confezione</Button> : null}
        </div>
        {!stockUnitId ? <p className="text-xs text-muted-foreground">Imposta prima la U.M. di magazzino.</p> : null}
        {packagesQuery.data?.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {packagesQuery.data.map((pack) => {
              const review = pack.status === "attivo" && pack.verified_stock_unit_id !== stockUnitId;
              return (
                <li key={pack.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pack.name}</p>
                    <p className="text-xs text-muted-foreground">1 {unitCode(pack.unit_id)} = {Number(pack.stock_quantity).toLocaleString("it-IT")} {unitCode(pack.verified_stock_unit_id)} · versione {pack.package_version}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={review ? "destructive" : pack.status === "attivo" ? "secondary" : "outline"}>{review ? "da rivedere" : pack.status === "attivo" ? "attiva" : "disattivata"}</Badge>
                    {editable ? <Button type="button" size="icon" variant="ghost" aria-label={`${review ? "Riconferma" : "Modifica"} ${pack.name}`} onClick={() => setPackageDraft({ id: pack.id, name: pack.name, unitId: pack.unit_id, quantity: String(pack.stock_quantity), active: pack.status === "attivo" })}><Pencil /></Button> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : stockUnitId ? <p className="text-xs text-muted-foreground">Nessuna confezione dichiarata.</p> : null}
      </div>

      <AlertDialog open={pendingUnit !== null} onOpenChange={(open) => { if (!open) setPendingUnit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiare la U.M. di magazzino{stockCode ? ` da ${stockCode}` : ""} a {unitCode(pendingUnit)}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Stai cambiando la U.M. di magazzino. La giacenza attuale non verrà convertita e resterà "Da verificare" finché non verrà effettuato un nuovo conteggio. Continuare?</p>
                <ul className="list-disc pl-4 text-xs">
                  <li>I vecchi conteggi non vengono convertiti.</li>
                  <li>Servirà un nuovo conteggio fisico.</li>
                  <li>La data di base viene aggiornata a oggi.</li>
                  <li>Confezioni e conversioni dei fornitori andranno riconfermate.</li>
                  <li>Non è possibile con un inventario in corso.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingUnit) unitMutation.mutate(pendingUnit); }}>Continua</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={packageDraft !== null} onOpenChange={(open) => { if (!open) setPackageDraft(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{packageDraft?.id ? "Modifica confezione" : "Nuova confezione"}</DialogTitle></DialogHeader>
          {packageDraft ? (
            <div className="grid gap-3">
              <div className="grid gap-1"><Label htmlFor="pack-name">Nome</Label><Input id="pack-name" value={packageDraft.name} placeholder="Cassa 6 bt" onChange={(event) => setPackageDraft({ ...packageDraft, name: event.target.value })} /></div>
              <div className="grid gap-1">
                <Label>U.M. della confezione</Label>
                <Select value={packageDraft.unitId} onValueChange={(value) => setPackageDraft({ ...packageDraft, unitId: value })}>
                  <SelectTrigger aria-label="U.M. della confezione"><SelectValue placeholder="Scegli" /></SelectTrigger>
                  <SelectContent>{activeUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code} — {unit.description}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1"><Label htmlFor="pack-qty">Equivale a ({stockCode})</Label><Input id="pack-qty" inputMode="decimal" value={packageDraft.quantity} onChange={(event) => setPackageDraft({ ...packageDraft, quantity: event.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={packageDraft.active} onCheckedChange={(checked) => setPackageDraft({ ...packageDraft, active: checked })} />Attiva</label>
              {packageDraft.id ? <p className="text-xs text-muted-foreground">Se cambi quantità o U.M., le conversioni dei fornitori collegate andranno riconfermate.</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPackageDraft(null)}>Annulla</Button>
            <Button type="button" disabled={packageMutation.isPending || !packageDraft?.name.trim() || !packageDraft?.unitId} onClick={() => { if (packageDraft) packageMutation.mutate(packageDraft); }}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type SupplierConversionRow = {
  id: string;
  unit_id: string;
  conversion_factor: number | null;
  conversion_mode: "stessa" | "fissa" | "variabile" | null;
  stock_conversion_factor: number | null;
  indicative_factor: number | null;
  package_id: string | null;
  supplier_name: string;
  effective: { is_valid: boolean; reason: string | null } | null;
};

const MODE_LABELS: Record<string, string> = { stessa: "Stessa U.M.", fissa: "Fissa", variabile: "Variabile", nessuna: "Da configurare" };

/** Tab Acquisto: conversione U.M. acquisto fornitore → U.M. di magazzino (campo dedicato stock_conversion_factor). */
export function SupplierConversionsSection({ productId, units, editable }: {
  productId: string;
  units: CompanyUnit[];
  editable: boolean;
}) {
  const invalidate = useInvalidateUnitConfig(productId);
  const stockQuery = useProductStockUnit(productId);
  const packagesQuery = useStockPackages(productId);
  const [draft, setDraft] = useState<{ row: SupplierConversionRow; mode: string; packageId: string; factor: string; indicative: string } | null>(null);
  const stockUnitId = stockQuery.data?.stock_unit_id ?? null;
  const unitCode = (id: string | null | undefined) => units.find((unit) => unit.id === id)?.code ?? "—";

  const rowsQuery = useQuery({
    queryKey: ["supplier-conversions", productId],
    queryFn: async (): Promise<SupplierConversionRow[]> => {
      const { data, error } = await supabase
        .from("product_supplier_link_units")
        .select("id, unit_id, conversion_factor, conversion_mode, stock_conversion_factor, indicative_factor, package_id, product_supplier_links!inner(product_id, is_active, supplier_records(legal_name))")
        .eq("product_supplier_links.product_id", productId)
        .eq("product_supplier_links.is_active", true)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<Omit<SupplierConversionRow, "supplier_name" | "effective"> & { product_supplier_links: { supplier_records: { legal_name: string | null } | null } }>;
      return Promise.all(rows.map(async (row) => {
        const { data: eff } = await supabase.rpc("effective_supplier_conversion", { _link_unit_id: row.id });
        const first = (eff ?? [])[0] as { is_valid: boolean; reason: string | null } | undefined;
        return { ...row, supplier_name: row.product_supplier_links.supplier_records?.legal_name ?? "Fornitore", effective: first ?? null };
      }));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (value: NonNullable<typeof draft>) => {
      const factor = parseNumber(value.factor);
      const indicative = parseNumber(value.indicative);
      if (Number.isNaN(factor) || Number.isNaN(indicative)) throw new Error("Numero non valido");
      const mode = value.mode === "nessuna" ? null : value.mode;
      const args: Record<string, unknown> = { _link_unit_id: value.row.id, _mode: mode };
      if (mode === "fissa" && value.packageId !== "diretto") args._package_id = value.packageId;
      if (mode === "fissa" && value.packageId === "diretto" && factor !== null) args._factor = factor;
      if (mode === "variabile" && indicative !== null) args._indicative = indicative;
      const { error } = await supabase.rpc("set_supplier_unit_conversion", args as { _link_unit_id: string; _mode: string });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Conversione salvata"); setDraft(null); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const usablePackages = (packagesQuery.data ?? []).filter((pack) => pack.status === "attivo" && pack.verified_stock_unit_id === stockUnitId);
  const describe = (row: SupplierConversionRow) => {
    const purchase = unitCode(row.unit_id);
    const stock = unitCode(stockUnitId);
    if (row.conversion_mode === "stessa") return `1 ${purchase} = 1 ${stock}`;
    if (row.conversion_mode === "fissa") {
      const pack = packagesQuery.data?.find((item) => item.id === row.package_id);
      return `1 ${purchase} = ${Number(row.stock_conversion_factor).toLocaleString("it-IT")} ${stock}${pack ? ` · confezione ${pack.name}` : " · fattore diretto"}`;
    }
    if (row.conversion_mode === "variabile") return row.indicative_factor ? `1 ${purchase} ≈ ${Number(row.indicative_factor).toLocaleString("it-IT")} ${stock} (indicativo, quantità reale al carico)` : "Quantità reale al carico";
    return "Da configurare";
  };

  return (
    <section aria-labelledby="supplier-conv-title" className="space-y-2 rounded-lg border border-border p-3">
      <h3 id="supplier-conv-title" className="text-sm font-semibold">Conversioni verso la U.M. di magazzino{stockUnitId ? ` (${unitCode(stockUnitId)})` : ""}</h3>
      <p className="text-xs text-muted-foreground">Non ancora usate da Lista, Ordini, Carico o Inventario: il fattore attuale del fornitore resta invariato.</p>
      {!stockUnitId ? <p className="text-xs font-medium text-destructive">U.M. magazzino da impostare nel tab Inventario.</p> : null}
      {rowsQuery.data?.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rowsQuery.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.supplier_name} · {unitCode(row.unit_id)}</p>
                <p className="text-xs text-muted-foreground">{MODE_LABELS[row.conversion_mode ?? "nessuna"]}: {describe(row)}</p>
                {row.conversion_factor !== null ? <p className="text-xs text-muted-foreground">Fattore del sistema attuale: {Number(row.conversion_factor).toLocaleString("it-IT")} (non modificato)</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant={row.effective?.is_valid ? "secondary" : "destructive"}>{row.effective?.is_valid ? "valida" : row.effective?.reason ?? "da configurare"}</Badge>
                {editable ? <Button type="button" size="icon" variant="ghost" aria-label={`Configura ${row.supplier_name} ${unitCode(row.unit_id)}`} disabled={!stockUnitId} onClick={() => setDraft({ row, mode: row.conversion_mode ?? "nessuna", packageId: row.package_id ?? "diretto", factor: row.package_id ? "" : row.stock_conversion_factor?.toString() ?? "", indicative: row.indicative_factor?.toString() ?? "" })}><Pencil /></Button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : rowsQuery.isLoading ? null : <p className="text-xs text-muted-foreground">Nessuna U.M. d'acquisto dei fornitori.</p>}

      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft ? `${draft.row.supplier_name} · ${unitCode(draft.row.unit_id)} → ${unitCode(stockUnitId)}` : ""}</DialogTitle></DialogHeader>
          {draft ? (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label>Modalità</Label>
                <Select value={draft.mode} onValueChange={(value) => setDraft({ ...draft, mode: value })}>
                  <SelectTrigger aria-label="Modalità di conversione"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuna">Da configurare</SelectItem>
                    <SelectItem value="stessa" disabled={draft.row.unit_id !== stockUnitId}>Stessa U.M.</SelectItem>
                    <SelectItem value="fissa">Fissa</SelectItem>
                    <SelectItem value="variabile">Variabile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.mode === "fissa" ? <>
                <div className="grid gap-1">
                  <Label>Confezione</Label>
                  <Select value={draft.packageId} onValueChange={(value) => setDraft({ ...draft, packageId: value })}>
                    <SelectTrigger aria-label="Confezione collegata"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diretto">Nessuna: fattore diretto</SelectItem>
                      {usablePackages.map((pack) => <SelectItem key={pack.id} value={pack.id}>{pack.name} = {Number(pack.stock_quantity).toLocaleString("it-IT")} {unitCode(stockUnitId)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {draft.packageId === "diretto" ? <div className="grid gap-1"><Label htmlFor="conv-factor">1 {unitCode(draft.row.unit_id)} = ? {unitCode(stockUnitId)}</Label><Input id="conv-factor" inputMode="decimal" value={draft.factor} onChange={(event) => setDraft({ ...draft, factor: event.target.value })} /><p className="text-xs text-muted-foreground">Il fattore diretto serve solo all'acquisto: non crea una confezione.</p></div> : <p className="text-xs text-muted-foreground">Il fattore è la quantità della confezione.</p>}
              </> : null}
              {draft.mode === "variabile" ? <div className="grid gap-1"><Label htmlFor="conv-ind">Valore indicativo (facoltativo, {unitCode(stockUnitId)})</Label><Input id="conv-ind" inputMode="decimal" value={draft.indicative} onChange={(event) => setDraft({ ...draft, indicative: event.target.value })} /><p className="text-xs text-muted-foreground">Mai usato per la giacenza: la quantità reale si scrive al carico.</p></div> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Annulla</Button>
            <Button type="button" disabled={saveMutation.isPending} onClick={() => { if (draft) saveMutation.mutate(draft); }}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
