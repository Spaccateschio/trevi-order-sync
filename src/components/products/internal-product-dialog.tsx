import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export type InternalProductDraft = {
  id?: string;
  code?: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  danea_um?: string | null;
  barcode?: string | null;
  producer_name?: string | null;
  notes?: string | null;
  price_unit_id?: string | null;
};

/**
 * Prodotto proprio creato a mano: non richiede Danea.
 * Il codice viene proposto dal database (00-001, 00-002, …) ed è modificabile,
 * anche alfanumerico. L'origine "interno" resta separata dai prodotti Danea.
 */
export function InternalProductDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  userId: string | null;
  product?: InternalProductDraft | null;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(product?.id);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [um, setUm] = useState("");
  const [barcode, setBarcode] = useState("");
  const [producer, setProducer] = useState("");
  const [notes, setNotes] = useState("");
  // U.M. a cui è riferito il prezzo: tutti i listini del prodotto si leggono su questa U.M.
  const [priceUnitId, setPriceUnitId] = useState("");

  const nextCodeQuery = useQuery({
    queryKey: ["prossimo-codice-interno", companyId],
    enabled: open && !editing && Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("next_internal_product_code", {
        _company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return (data as string) ?? "";
    },
  });

  // Le U.M. provengono dall'anagrafica aziendale: qui si scelgono, non si scrivono.
  const unitsQuery = useQuery({
    queryKey: ["company-units", companyId],
    enabled: open && Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units_of_measure")
        .select("id, code, status, usage")
        .eq("company_id", companyId!)
        .eq("status", "attivo")
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; code: string; status: string; usage: "acquisto" | "vendita" | "entrambi" }[];
    },
  });

  const unitOptions = useMemo(() => {
    const codes = (unitsQuery.data ?? []).map((unit) => unit.code);
    if (um && !codes.includes(um)) codes.unshift(um);
    return codes;
  }, [um, unitsQuery.data]);



  useEffect(() => {
    if (!open) return;
    setCode(product?.code ?? "");
    setDescription(product?.description ?? "");
    setCategory(product?.category ?? "");
    setSubcategory(product?.subcategory ?? "");
    setUm(product?.danea_um ?? "");
    setBarcode(product?.barcode ?? "");
    setProducer(product?.producer_name ?? "");
    setNotes(product?.notes ?? "");
    setPriceUnitId(product?.price_unit_id ?? "");
  }, [open, product]);

  useEffect(() => {
    if (open && !editing && !code && nextCodeQuery.data) setCode(nextCodeQuery.data);
  }, [code, editing, nextCodeQuery.data, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!description.trim()) throw new Error("La descrizione è obbligatoria");
      const args: Record<string, string> = {
        _company_id: companyId,
        _action: editing ? "update" : "create",
        _description: description.trim(),
      };
      if (product?.id) args["_product_id"] = product.id;
      if (code.trim()) args["_code"] = code.trim();
      if (category.trim()) args["_category"] = category.trim();
      if (subcategory.trim()) args["_subcategory"] = subcategory.trim();
      if (um.trim()) args["_danea_um"] = um.trim();
      if (barcode.trim()) args["_barcode"] = barcode.trim();
      if (producer.trim()) args["_producer_name"] = producer.trim();
      if (notes.trim()) args["_notes"] = notes.trim();
      if (priceUnitId) args["_price_unit_id"] = priceUnitId;
      if (userId) args["_actor_user_id"] = userId;
      const { data, error } = await supabase.rpc(
        "manage_internal_product",
        args as unknown as { _company_id: string; _action: string },
      );
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      toast.success(editing ? "Prodotto aggiornato" : "Prodotto creato");
      void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["danea-archivi", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["prossimo-codice-interno", companyId] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica prodotto" : "Nuovo prodotto"}</DialogTitle>
          <DialogDescription>
            Prodotto dell'azienda gestito a mano. Non richiede Danea e può avere zero, uno o più
            fornitori.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="ip-code">Codice</Label>
            <Input
              id="ip-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="00-001"
              className="mt-1 font-mono"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="ip-um">Unità di misura</Label>
            <div className="mt-1 flex items-center gap-2">
              <Select value={um} onValueChange={setUm}>
                <SelectTrigger id="ip-um" className="flex-1" aria-label="Unità di misura">
                  <SelectValue placeholder="Scegli U.M." />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                asChild
                size="icon"
                variant="outline"
                title="Gestisci le unità di misura nelle impostazioni"
              >
                <Link to="/amministrazione" onClick={() => onOpenChange(false)}>
                  <Settings2 className="size-4" />
                </Link>
              </Button>
            </div>
            {unitOptions.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Nessuna unità di misura in anagrafica: creala nelle impostazioni dell'azienda.
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ip-description">Descrizione</Label>
            <Input
              id="ip-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="PATATE BIANCHE"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ip-category">Categoria</Label>
            <Input
              id="ip-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ip-subcategory">Sottocategoria</Label>
            <Input
              id="ip-subcategory"
              value={subcategory}
              onChange={(event) => setSubcategory(event.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ip-barcode">Barcode</Label>
            <Input
              id="ip-barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ip-producer">Produttore</Label>
            <Input
              id="ip-producer"
              value={producer}
              onChange={(event) => setProducer(event.target.value)}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ip-notes">Note</Label>
            <Textarea
              id="ip-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {editing ? "Salva" : "Crea prodotto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
