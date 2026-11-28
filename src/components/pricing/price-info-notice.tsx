import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { priceInfoMessage } from "@/lib/price-info";

/** Lettura per cliente collegato o venditore: solo dati informativi. */
export function useSellerPriceInfo(sellerCompanyId: string | null | undefined) {
  return useQuery({
    queryKey: ["seller-price-info", sellerCompanyId],
    enabled: Boolean(sellerCompanyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("seller_price_info_for", {
        _seller_company_id: sellerCompanyId!,
      });
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },
  });
}

/**
 * Messaggio prezzi del fornitore: ultimo aggiornamento reale, orario abituale
 * se impostato, testo del fornitore. Nessuna percentuale o promessa.
 */
export function PriceInfoNotice({ sellerCompanyId, className }: { sellerCompanyId: string | null | undefined; className?: string }) {
  const query = useSellerPriceInfo(sellerCompanyId);
  if (!sellerCompanyId || query.isLoading) return null;
  const message = priceInfoMessage(
    query.data ?? { last_price_update_at: null, usual_update_time: null, info_text: null },
  );
  return (
    <p
      className={`flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground print:border-0 print:bg-transparent ${className ?? ""}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/**
 * Stesso messaggio dei prezzi, ma nascosto dentro un'icona: la pagina resta
 * pulita e il testo si legge solo quando lo si chiede.
 */
export function PriceInfoIconButton({ sellerCompanyId }: { sellerCompanyId: string | null | undefined }) {
  const query = useSellerPriceInfo(sellerCompanyId);
  const [open, setOpen] = useState(false);
  if (!sellerCompanyId) return null;
  const message = priceInfoMessage(
    query.data ?? { last_price_update_at: null, usual_update_time: null, info_text: null },
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Informazioni sui prezzi"
        >
          <Info className="h-4 w-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Informazioni sui prezzi</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {query.isLoading ? "Caricamento delle informazioni…" : message}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
