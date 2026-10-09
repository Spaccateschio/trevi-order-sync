import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * "Aggiungi ai miei prodotti": azione indipendente dalla stella dei preferiti.
 * Crea un prodotto proprio dell'acquirente collegato a quella referenza del
 * fornitore, oppure collega la referenza a un prodotto già esistente.
 */
export function AddToOwnProductsDialog({
  open,
  onOpenChange,
  buyerCompanyId,
  sellerCompanyId,
  sellerProduct,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerCompanyId: string | null;
  sellerCompanyId: string;
  sellerProduct: { id: string; code: string; description: string | null };
  userId: string | null;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"nuovo" | "esistente">("nuovo");
  const [term, setTerm] = useState("");
  const [ownProductId, setOwnProductId] = useState<string | null>(null);
  const [supplierCode, setSupplierCode] = useState(sellerProduct.code);

  const ownProductsQuery = useQuery({
    queryKey: ["miei-prodotti-ricerca", buyerCompanyId, term],
    enabled: open && mode === "esistente" && Boolean(buyerCompanyId),
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, code, description")
        .eq("company_id", buyerCompanyId!)
        .order("code")
        .limit(20);
      const value = term.trim();
      if (value) query = query.or(`code.ilike.%${value}%,description.ilike.%${value}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [candidates, setCandidates] = useState<Array<{ id: string; code: string; description: string | null }> | null>(null);
  const [uncertain, setUncertain] = useState<{
    message: string;
    links: Array<{ link_id: string; product_code: string; product_description: string | null; supplier_reference_label: string | null; supplier_product_code: string | null; is_active: boolean }>;
  } | null>(null);

  type AddResult = {
    status?: string;
    message?: string;
    created_product?: boolean;
    created_link?: boolean;
    candidates?: Array<{ id: string; code: string; description: string | null }>;
    uncertain_links?: Array<{ link_id: string; product_code: string; product_description: string | null; supplier_reference_label: string | null; supplier_product_code: string | null; is_active: boolean }>;
  };

  const add = useMutation({
    mutationFn: async (chosenProductId?: string) => {
      if (!buyerCompanyId) throw new Error("Azienda non disponibile");
      if (!chosenProductId && mode === "esistente" && !ownProductId) throw new Error("Scegli un tuo prodotto");
      const args: Record<string, string> = {
        _buyer_company_id: buyerCompanyId,
        _seller_company_id: sellerCompanyId,
        _seller_product_id: sellerProduct.id,
      };
      const target = chosenProductId ?? (mode === "esistente" ? ownProductId : null);
      if (target) args["_own_product_id"] = target;
      if (supplierCode.trim()) args["_supplier_product_code"] = supplierCode.trim();
      if (userId) args["_actor_user_id"] = userId;
      const { data, error } = await supabase.rpc(
        "add_catalog_product_to_own_products",
        args as unknown as {
          _buyer_company_id: string;
          _seller_company_id: string;
          _seller_product_id: string;
        },
      );
      if (error) throw new Error(error.message);
      return (data ?? {}) as AddResult;
    },
    onSuccess: (result) => {
      if (result.status === "choose_candidate") {
        setUncertain(null);
        setCandidates(result.candidates ?? []);
        return;
      }
      if (result.status === "link_identity_uncertain") {
        // Nessuna nuova chiamata automatica: l'utente deve verificare il collegamento.
        setCandidates(null);
        setUncertain({
          message: result.message ?? "Collegamento esistente senza codice articolo: verifica il collegamento prima di procedere",
          links: result.uncertain_links ?? [],
        });
        return;
      }
      toast.success(
        result.created_product
          ? "Prodotto creato fra i tuoi prodotti, con il fornitore collegato"
          : result.created_link
            ? "Referenza del fornitore collegata al tuo prodotto"
            : "Collegamento già presente: nessun duplicato creato",
      );
      void queryClient.invalidateQueries({ queryKey: ["prodotti", buyerCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["miei-prodotti-ricerca", buyerCompanyId] });
      setCandidates(null);
      setUncertain(null);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi ai miei prodotti</DialogTitle>
          <DialogDescription>
            {sellerProduct.description ?? sellerProduct.code} · questa referenza del fornitore viene
            collegata a un tuo prodotto. La stella dei preferiti resta indipendente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={mode === "nuovo" ? "default" : "outline"}
              onClick={() => setMode("nuovo")}
            >
              Crea nuovo prodotto
            </Button>
            <Button
              type="button"
              variant={mode === "esistente" ? "default" : "outline"}
              onClick={() => setMode("esistente")}
            >
              Collega a prodotto esistente
            </Button>
          </div>

          {mode === "esistente" ? (
            <div>
              <Label htmlFor="own-search">Cerca fra i miei prodotti</Label>
              <Input
                id="own-search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Codice o descrizione"
                className="mt-1"
              />
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {(ownProductsQuery.data ?? []).map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setOwnProductId(row.id)}
                      className={cn(
                        "w-full rounded-lg border border-border px-3 py-2 text-left",
                        ownProductId === row.id ? "bg-secondary" : "bg-card hover:bg-muted/50",
                      )}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                      <span className="block">{row.description ?? row.code}</span>
                    </button>
                  </li>
                ))}
                {ownProductsQuery.data?.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    Nessun prodotto trovato: usa “Crea nuovo prodotto”.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Verrà creato un tuo prodotto con codice proposto automaticamente, descrizione,
              categoria e unità di misura ripresi dal catalogo. Nessun abbinamento automatico.
            </p>
          )}

          <div>
            <Label htmlFor="supplier-code">Codice articolo del fornitore</Label>
            <Input
              id="supplier-code"
              value={supplierCode}
              onChange={(event) => setSupplierCode(event.target.value)}
              className="mt-1 font-mono"
              placeholder="facoltativo"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Puoi lasciarlo vuoto e inserirlo in seguito.
            </p>
          </div>

          {candidates ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium">Esistono più copie di questo articolo: scegli quale usare.</p>
              <ul className="space-y-1">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start py-2 text-left"
                      disabled={add.isPending}
                      onClick={() => add.mutate(c.id)}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                      <span className="ml-2">{c.description ?? c.code}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {uncertain ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <p className="font-medium">{uncertain.message}</p>
              <ul className="space-y-1">
                {uncertain.links.map((l) => (
                  <li key={l.link_id}>
                    <span className="font-mono">{l.product_code}</span> · {l.product_description ?? l.product_code}
                    {l.supplier_reference_label ? ` · rif. ${l.supplier_reference_label}` : ""}
                    {l.supplier_product_code ? ` · cod. ${l.supplier_product_code}` : ""}
                    {" · "}{l.is_active ? "attivo" : "disattivato"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button disabled={add.isPending} onClick={() => add.mutate(undefined)}>
            Aggiungi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
