import type { QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type FavoriteToggleResult =
  | { action: "added"; createdProduct: boolean; createdLink: boolean }
  | { action: "removed" };

type ToggleInput = {
  buyerCompanyId: string;
  sellerCompanyId: string;
  productId: string;
  userId?: string | null;
  isFavorite: boolean;
};

/**
 * La stella del catalogo significa "questo articolo lo acquisto":
 * quando viene aggiunta, l'articolo entra anche fra i prodotti gestiti
 * dall'azienda cliente (RPC esistente, idempotente).
 * Togliendo la stella il prodotto proprio NON viene toccato.
 */
export async function toggleCatalogFavorite(
  input: ToggleInput,
): Promise<FavoriteToggleResult> {
  const { buyerCompanyId, sellerCompanyId, productId, userId, isFavorite } = input;

  if (isFavorite) {
    const { error } = await supabase
      .from("buyer_product_favorites")
      .delete()
      .eq("buyer_company_id", buyerCompanyId)
      .eq("product_id", productId);
    if (error) throw new Error(error.message);
    return { action: "removed" };
  }

  const { error } = await supabase.from("buyer_product_favorites").insert({
    buyer_company_id: buyerCompanyId,
    seller_company_id: sellerCompanyId,
    product_id: productId,
    created_by: userId ?? null,
  });
  if (error) throw new Error(error.message);

  const args: Record<string, string> = {
    _buyer_company_id: buyerCompanyId,
    _seller_company_id: sellerCompanyId,
    _seller_product_id: productId,
  };
  if (userId) args["_actor_user_id"] = userId;

  const { data, error: rpcError } = await supabase.rpc(
    "add_catalog_product_to_own_products",
    args as unknown as {
      _buyer_company_id: string;
      _seller_company_id: string;
      _seller_product_id: string;
    },
  );
  if (rpcError) throw new Error(rpcError.message);

  const result = (data ?? {}) as { created_product?: boolean; created_link?: boolean };
  return {
    action: "added",
    createdProduct: Boolean(result.created_product),
    createdLink: Boolean(result.created_link),
  };
}

export function favoriteToggleMessage(result: FavoriteToggleResult): string {
  if (result.action === "removed") {
    return "Rimosso dai preferiti: il prodotto resta fra i tuoi prodotti";
  }
  if (result.createdProduct) {
    return "Aggiunto ai preferiti e fra i tuoi prodotti, con il fornitore collegato";
  }
  if (result.createdLink) {
    return "Aggiunto ai preferiti: referenza del fornitore collegata al tuo prodotto";
  }
  return "Aggiunto ai preferiti: già presente fra i tuoi prodotti";
}

export function invalidateAfterFavoriteChange(
  queryClient: QueryClient,
  buyerCompanyId: string | null,
): void {
  const keys: unknown[][] = [
    ["catalogo-preferiti-tutti", buyerCompanyId],
    ["catalogo-preferiti", buyerCompanyId],
    ["catalogo-preferito", buyerCompanyId],
    ["prodotti", buyerCompanyId],
    ["miei-prodotti-ricerca", buyerCompanyId],
    ["inventario-fabbisogno", buyerCompanyId],
    ["inventario-prodotti", buyerCompanyId],
  ];
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}
