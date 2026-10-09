import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export type B2BOrigin = { sellerProductId: string; sellerCompanyId: string };

type ExistingCopy = { id: string; code: string; description: string | null; linked?: boolean };

type CopyResult = {
  status?: string;
  product_id?: string;
  code?: string;
  created_link?: boolean;
  existing?: ExistingCopy[];
  already_linked_to?: { product_id: string; code: string; description: string | null } | null;
};

/**
 * «Copia nei miei prodotti»: crea un prodotto interno partendo da un articolo B2B
 * tramite copy_b2b_item_to_own_product (il database decide collegamento e codice).
 * L'origine sta solo in created_from_product_id/created_from_company_id: le note restano libere.
 * La U.M. di magazzino si sceglie fra quelle della nostra azienda, mai dedotta dal fornitore;
 * la conversione resta sempre da verificare.
 */
export function CopyToOwnProductsFlow({
  companyId,
  origin,
  onClose,
}: {
  companyId: string;
  userId?: string | null;
  origin: B2BOrigin;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"loading" | "existing" | "form">("loading");
  const [forceNew, setForceNew] = useState(false);
  const [existing, setExisting] = useState<ExistingCopy[]>([]);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [producer, setProducer] = useState("");
  const [notes, setNotes] = useState("");
  const [stockUnitId, setStockUnitId] = useState("");

  const dataQuery = useQuery({
    queryKey: ["copia-b2b", companyId, origin.sellerProductId],
    staleTime: 0,
    queryFn: async () => {
      const [seller, copies, activeLink, units] = await Promise.all([
        supabase
          .from("products")
          .select("code, description, category, subcategory, barcode, producer_name")
          .eq("id", origin.sellerProductId)
          .maybeSingle(),
        supabase
          .from("products")
          .select("id, code, description")
          .eq("company_id", companyId)
          .eq("created_from_product_id", origin.sellerProductId)
          .order("created_at"),
        supabase
          .from("product_supplier_links")
          .select("product_id, products!inner(id, code, description)")
          .eq("company_id", companyId)
          .eq("b2b_item_id", origin.sellerProductId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("units_of_measure")
          .select("id, code")
          .eq("company_id", companyId)
          .eq("status", "attivo")
          .order("code"),
      ]);
      if (seller.error) throw new Error(seller.error.message);
      if (copies.error) throw new Error(copies.error.message);
      if (!seller.data) throw new Error("Articolo B2B originale non disponibile");
      const list: ExistingCopy[] = (copies.data ?? []).map((c) => ({ ...c }));
      const linked = activeLink.data?.products as unknown as ExistingCopy | undefined;
      if (linked && !list.some((c) => c.id === linked.id)) list.push({ ...linked, linked: true });
      for (const c of list) if (linked && c.id === linked.id) c.linked = true;
      return { seller: seller.data, existing: list, units: units.data ?? [] };
    },
  });

  useEffect(() => {
    if (dataQuery.error) {
      toast.error((dataQuery.error as Error).message);
      onClose();
    } else if (dataQuery.data && step === "loading") {
      const s = dataQuery.data.seller;
      setDescription(s.description ?? s.code ?? "");
      setCategory(s.category ?? "");
      setSubcategory(s.subcategory ?? "");
      setBarcode(s.barcode ?? "");
      setProducer(s.producer_name ?? "");
      setExisting(dataQuery.data.existing);
      setStep(dataQuery.data.existing.length > 0 ? "existing" : "form");
    }
  }, [dataQuery.data, dataQuery.error, onClose, step]);

  const save = useMutation({
    mutationFn: async () => {
      if (!description.trim()) throw new Error("La descrizione è obbligatoria");
      const args: Record<string, unknown> = {
        _buyer_company_id: companyId,
        _seller_company_id: origin.sellerCompanyId,
        _seller_product_id: origin.sellerProductId,
        _description: description.trim(),
        _force_new: forceNew,
      };
      if (code.trim()) args["_code"] = code.trim();
      if (category.trim()) args["_category"] = category.trim();
      if (subcategory.trim()) args["_subcategory"] = subcategory.trim();
      if (barcode.trim()) args["_barcode"] = barcode.trim();
      if (producer.trim()) args["_producer_name"] = producer.trim();
      if (notes.trim()) args["_notes"] = notes.trim();
      if (stockUnitId) args["_stock_unit_id"] = stockUnitId;
      const { data, error } = await supabase.rpc(
        "copy_b2b_item_to_own_product",
        args as unknown as {
          _buyer_company_id: string;
          _seller_company_id: string;
          _seller_product_id: string;
          _description: string;
        },
      );
      if (error) throw new Error(error.message);
      return (data ?? {}) as CopyResult;
    },
    onSuccess: (result) => {
      if (result.status === "needs_confirmation") {
        setExisting(result.existing ?? []);
        setStep("existing");
        return;
      }
      if (result.already_linked_to) {
        const l = result.already_linked_to;
        toast.warning(
          `Copia creata senza collegamento al fornitore: l'articolo è già collegato a ${l.code} · ${l.description ?? l.code}`,
        );
      } else {
        toast.success(`Prodotto ${result.code ?? ""} creato e collegato al fornitore: conversione U.M. da verificare`);
      }
      void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["prossimo-codice-interno", companyId] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const first = existing.find((c) => c.linked) ?? existing[0];

  return (
    <>
      <AlertDialog open={step === "existing"} onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esiste già un tuo prodotto per questo articolo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                {existing.map((c) => (
                  <p key={c.id}>
                    <span className="font-mono">{c.code}</span> · {c.description ?? c.code}
                    {c.linked ? " · collegato" : ""}
                  </p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setForceNew(true);
                setStep("form");
              }}
            >
              Crea comunque una nuova copia
            </Button>
            <Button
              onClick={() => {
                if (!first) return;
                onClose();
                void navigate({ to: "/acquisti/prodotti", search: { prodotto: first.id } });
              }}
            >
              Apri prodotto esistente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={step === "form"} onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copia nei miei prodotti</DialogTitle>
            <DialogDescription>
              Nuovo prodotto interno creato dall'articolo del fornitore. La conversione fra U.M. del
              fornitore e U.M. di magazzino resta da verificare.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label htmlFor="copy-code">Codice</Label>
              <Input id="copy-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="automatico (00-…)" className="mt-1 font-mono" />
            </div>
            <div>
              <Label htmlFor="copy-desc">Descrizione</Label>
              <Input id="copy-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="copy-cat">Categoria</Label>
                <Input id="copy-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="copy-sub">Sottocategoria</Label>
                <Input id="copy-sub" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="copy-um">U.M. di magazzino</Label>
              <select
                id="copy-um"
                value={stockUnitId}
                onChange={(e) => setStockUnitId(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Da impostare in seguito</option>
                {(dataQuery.data?.units ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.code}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="copy-bar">Codice a barre</Label>
                <Input id="copy-bar" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="copy-prod">Produttore</Label>
                <Input id="copy-prod" value={producer} onChange={(e) => setProducer(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="copy-notes">Note</Label>
              <Textarea id="copy-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>Crea prodotto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
