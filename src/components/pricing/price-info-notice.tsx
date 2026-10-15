import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";

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
