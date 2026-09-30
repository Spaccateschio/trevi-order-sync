import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity } from "@/lib/inventory";

/**
 * «+ Aggiungi fornitore» nella card della Lista: crea il vero collegamento Prodotto ↔ Fornitore
 * con le stesse RPC della scheda Prodotto (manage_product_supplier_link / _unit). Nessuna gestione
 * parallela di prezzi o U.M.; per i B2B nessun abbinamento automatico alla referenza del venditore.
 */

const OTHER = "__altra__";
const NONE = "__nessuna__";

export function useCompanyUnits(companyId: string) {
  return useQuery({
    queryKey: ["shopping-card-company-units", companyId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units_of_measure")
        .select("id, code, description, usage")
        .eq("company_id", companyId)
        .eq("status", "attivo")
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; code: string; description: string; usage: string }[];
    },
  });
}

export function refreshProductSuppliers(queryClient: ReturnType<typeof useQueryClient>, productId: string, itemId: string | null) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["product-supplier-overview", productId] }),
    queryClient.invalidateQueries({ queryKey: ["shopping-card-link-prices", productId] }),
    queryClient.invalidateQueries({ queryKey: ["product-supplier-links", productId] }),
    queryClient.invalidateQueries({ queryKey: ["shopping-filter-links"] }),
    ...(itemId ? [queryClient.invalidateQueries({ queryKey: ["shopping-item-supplier-units", itemId] })] : []),
  ]);
}

export function AddSupplierInline({
  companyId,
  productId,
  itemId,
  linkedSupplierIds,
  daneaUm,
}: {
  companyId: string;
  productId: string;
  itemId: string | null;
  linkedSupplierIds: Set<string>;
  daneaUm: string | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState(NONE);
  const [purchaseUnit, setPurchaseUnit] = useState("");

  const suppliers = useQuery({
    queryKey: ["shopping-card-active-suppliers", companyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_records").select("id, legal_name").eq("buyer_company_id", companyId).eq("status", "attivo").order("legal_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; legal_name: string }[];
    },
  });
  const b2b = useQuery({
    queryKey: ["shopping-card-relations", companyId],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_customer_relations")
        .select("supplier_record_id, seller_company_id")
        .eq("buyer_company_id", companyId)
        .eq("status", "attivo")
        .not("supplier_record_id", "is", null);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((r) => [r.supplier_record_id as string, r.seller_company_id as string]));
    },
  });
  const units = useCompanyUnits(companyId);

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (suppliers.data ?? []).filter((s) => !linkedSupplierIds.has(s.id) && (!term || s.legal_name.toLowerCase().includes(term)));
  }, [suppliers.data, linkedSupplierIds, search]);
  const chosen = (suppliers.data ?? []).find((s) => s.id === chosenId) ?? null;
  const isB2B = chosen ? Boolean(b2b.data?.has(chosen.id)) : false;
  const purchaseUnits = (units.data ?? []).filter((u) => u.usage !== "vendita");

  const reset = () => {
    setOpen(false);
    setSearch("");
    setChosenId(null);
    setPrice("");
    setPriceUnit(NONE);
    setPurchaseUnit("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new Error("Scegli un fornitore");
      const cost = price.trim() ? parseQuantity(price) : null;
      if (price.trim() && (cost === null || cost < 0)) throw new Error("Prezzo non valido");
      const unitId = !isB2B && purchaseUnit && purchaseUnit !== OTHER ? purchaseUnit : null;
      const { data: linkId, error } = await supabase.rpc("manage_product_supplier_link", {
        _company_id: companyId,
        _action: "create",
        _product_id: productId,
        _supplier_record_id: chosen.id,
        ...(daneaUm ? { _conversion_reference_um: daneaUm } : {}),
        ...(!isB2B && cost !== null ? { _manual_cost: cost } : {}),
        ...(!isB2B && priceUnit !== NONE ? { _price_unit_id: priceUnit } : {}),
        ...(unitId ? { _purchase_unit_id: unitId } : {}),
      });
      if (error) throw new Error(error.message);
      if (linkId && unitId) {
        const args = { _company_id: companyId, _link_id: linkId as string, _unit_id: unitId };
        const { error: addError } = await supabase.rpc("manage_product_supplier_link_unit", { ...args, _action: "add" });
        if (addError) throw new Error(addError.message);
        const { error: defError } = await supabase.rpc("manage_product_supplier_link_unit", { ...args, _action: "set_default" });
        if (defError) throw new Error(defError.message);
      }
    },
    onSuccess: async () => {
      const name = chosen?.legal_name ?? "Fornitore";
      reset();
      await refreshProductSuppliers(queryClient, productId, itemId);
      toast.success(`${name} collegato al prodotto`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="h-8 w-full px-2 text-xs" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" /> Aggiungi fornitore
      </Button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed border-primary/60 p-1.5">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide">Collega fornitore al prodotto</p>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 px-0" aria-label="Chiudi" onClick={reset}>
          <X aria-hidden="true" />
        </Button>
      </div>
      {!chosen ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" aria-hidden="true" />
            <Input className="h-8 pl-7 text-xs" autoFocus placeholder="Cerca fornitore" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cerca fornitore" />
          </div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {suppliers.isLoading ? <li className="text-[11px] text-muted-foreground">Caricamento…</li> : null}
            {!suppliers.isLoading && !candidates.length ? <li className="text-[11px] text-muted-foreground">Nessun altro fornitore in anagrafica</li> : null}
            {candidates.map((s) => (
              <li key={s.id}>
                <button type="button" className="flex w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-xs hover:bg-muted" onClick={() => setChosenId(s.id)}>
                  <span className="min-w-0 flex-1 truncate">{s.legal_name}</span>
                  {b2b.data?.has(s.id) ? <span className="rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold">B2B</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs font-semibold">
            <span className="min-w-0 flex-1 truncate">{chosen.legal_name}</span>
            {isB2B ? <span className="rounded border border-primary/50 bg-primary/10 px-1 text-[9px] font-semibold">B2B</span> : null}
            <button type="button" className="text-[11px] font-normal underline" onClick={() => setChosenId(null)}>Cambia</button>
          </p>
          {isB2B ? (
            <p className="text-[11px] text-muted-foreground">Prezzo, U.M. e conversioni li decide il venditore nel suo catalogo.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <Input className="h-8 text-xs" inputMode="decimal" placeholder="Prezzo €" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Prezzo" />
              <Select value={priceUnit} onValueChange={setPriceUnit}>
                <SelectTrigger className="h-8 text-xs" aria-label="U.M. prezzo"><SelectValue placeholder="U.M. prezzo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>U.M. prezzo: non indicata</SelectItem>
                  {(units.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>/ {u.code}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={purchaseUnit} onValueChange={setPurchaseUnit}>
                <SelectTrigger className="col-span-2 h-8 text-xs" aria-label="U.M. acquisto"><SelectValue placeholder="U.M. acquisto" /></SelectTrigger>
                <SelectContent>
                  {purchaseUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.description && u.description.toLowerCase() !== u.code.toLowerCase() ? `${u.description} (${u.code})` : u.code}</SelectItem>)}
                  <SelectItem value={OTHER}>Altra U.M. (la scrivi nella ripartizione)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="button" size="sm" className="h-8 w-full text-xs" disabled={create.isPending || (!isB2B && !purchaseUnit)} onClick={() => create.mutate()}>
            Collega al prodotto
          </Button>
        </div>
      )}
    </div>
  );
}
