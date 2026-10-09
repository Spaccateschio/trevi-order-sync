import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InternalProductDialog, type InternalProductDraft } from "@/components/products/internal-product-dialog";
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
import { supabase } from "@/integrations/supabase/client";

export type B2BOrigin = { sellerProductId: string; sellerCompanyId: string };

/**
 * «Copia nei miei prodotti»: crea un prodotto interno indipendente partendo dai dati di un articolo B2B.
 * Usa solo la finestra «Nuovo prodotto» e manage_internal_product: nessun collegamento al fornitore,
 * nessun prezzo, nessuna immagine, nessun preferito; articolo del venditore e card della Lista non vengono toccati.
 */
export function CopyToOwnProductsFlow({
  companyId,
  userId,
  origin,
  onClose,
}: {
  companyId: string;
  userId: string | null;
  origin: B2BOrigin;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"loading" | "existing" | "form">("loading");

  const dataQuery = useQuery({
    queryKey: ["copia-b2b", companyId, origin.sellerProductId],
    staleTime: 0,
    queryFn: async () => {
      const [seller, sellerCompany, copies, units] = await Promise.all([
        supabase
          .from("products")
          .select("code, description, category, subcategory, barcode, producer_name, danea_um")
          .eq("id", origin.sellerProductId)
          .maybeSingle(),
        supabase.from("companies").select("legal_name").eq("id", origin.sellerCompanyId).maybeSingle(),
        supabase
          .from("products")
          .select("id, code, description")
          .eq("company_id", companyId)
          .eq("created_from_product_id", origin.sellerProductId)
          .order("code"),
        supabase.from("units_of_measure").select("code").eq("company_id", companyId).eq("status", "attivo"),
      ]);
      if (copies.error) throw new Error(copies.error.message);
      if (seller.error) throw new Error(seller.error.message);
      if (!seller.data) throw new Error("Articolo B2B originale non disponibile");
      return {
        seller: seller.data,
        sellerName: sellerCompany.data?.legal_name ?? null,
        copies: copies.data ?? [],
        unitCodes: new Map((units.data ?? []).map((u) => [u.code.trim().toUpperCase(), u.code] as const)),
      };
    },
  });

  useEffect(() => {
    if (dataQuery.error) {
      toast.error((dataQuery.error as Error).message);
      onClose();
    } else if (dataQuery.data && step === "loading") {
      setStep(dataQuery.data.copies.length > 0 ? "existing" : "form");
    }
  }, [dataQuery.data, dataQuery.error, onClose, step]);

  const data = dataQuery.data;
  let draft: InternalProductDraft | null = null;
  if (data) {
    const s = data.seller;
    const um = s.danea_um?.trim() ?? "";
    // Solo U.M. della nostra azienda, scelte per codice: mai identificativi del fornitore.
    const ourUm = um ? (data.unitCodes.get(um.toUpperCase()) ?? null) : null;
    const notes = [
      "Copiato da articolo B2B",
      data.sellerName ? `Fornitore: ${data.sellerName}` : null,
      s.code ? `Codice fornitore: ${s.code}` : null,
    ].filter(Boolean).join(" · ");
    draft = {
      description: s.description ?? s.code,
      category: s.category,
      subcategory: s.subcategory,
      barcode: s.barcode,
      producer_name: s.producer_name,
      danea_um: ourUm,
      notes,
    };
  }

  const first = data?.copies[0];

  return (
    <>
      <AlertDialog open={step === "existing"} onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esiste già un tuo prodotto collegato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                {(data?.copies ?? []).map((c) => (
                  <p key={c.id}>
                    <span className="font-mono">{c.code}</span> · {c.description ?? c.code}
                  </p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button variant="outline" onClick={() => setStep("form")}>
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

      {step === "form" && draft ? (
        <InternalProductDialog
          open
          onOpenChange={(open) => (!open ? onClose() : undefined)}
          companyId={companyId}
          userId={userId}
          product={draft}
        />
      ) : null}
    </>
  );
}
