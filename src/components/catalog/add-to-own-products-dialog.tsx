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

  const add = useMutation({
    mutationFn: async () => {
      if (!buyerCompanyId) throw new Error("Azienda non disponibile");
      if (mode === "esistente" && !ownProductId) throw new Error("Scegli un tuo prodotto");
      const { data, error } = await supabase.rpc("add_catalog_product_to_own_products", {
        _buyer_company_id: buyerCompanyId,
        _seller_company_id: sellerCompanyId,
        _seller_product_id: sellerProduct.id,
        _own_product_id: mode === "esistente" ? (ownProductId ?? undefined) : undefined,
        _supplier_product_code: supplierCode.trim() || undefined,
        _actor_user_id: userId ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as { created_product?: boolean; created_link?: boolean };
    },
    onSuccess: (result) => {
      toast.success(
        result?.created_product
          ? "Prodotto creato fra i tuoi prodotti, con il fornitore collegato"
          : result?.created_link
            ? "Referenza del fornitore collegata al tuo prodotto"
            : "Collegamento già presente: nessun duplicato creato",
      );
      void queryClient.invalidateQueries({ queryKey: ["prodotti", buyerCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["miei-prodotti-ricerca", buyerCompanyId] });
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button disabled={add.isPending} onClick={() => add.mutate()}>
            Aggiungi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
