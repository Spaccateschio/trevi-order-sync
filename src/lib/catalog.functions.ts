import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "product-images";

const schema = z.object({
  sellerCompanyId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(60),
  thumbnail: z.boolean(),
});

/**
 * Firma le immagini del catalogo di un fornitore.
 *
 * La firma avviene con privilegi elevati (bypassa le RLS), quindi la funzione
 * verifica da sé, prima di firmare:
 *  - l'utente appartiene a un'azienda con collegamento operativo verso il fornitore;
 *  - il prodotto è pubblicato ed è in vetrina B2B.
 */
export const getCatalogImageUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: relationError } = await context.supabase.rpc(
      "can_view_seller_catalogue",
      { _seller_company_id: data.sellerCompanyId },
    );
    if (relationError) throw new Error(relationError.message);
    if (allowed !== true) throw new Error("Catalogo non disponibile per questo fornitore");

    const { data: products, error: productError } = await context.supabase
      .from("products")
      .select("id")
      .eq("company_id", data.sellerCompanyId)
      .eq("publish_status", "pubblicato")
      .eq("b2b_visible", true)
      .in("id", data.productIds);
    if (productError) throw new Error(productError.message);

    const visibleIds = (products ?? []).map((row: { id: string }) => row.id);
    if (!visibleIds.length) return [];

    const { data: images, error } = await context.supabase
      .from("product_images")
      .select("id, product_id, image_path, thumbnail_path")
      .eq("company_id", data.sellerCompanyId)
      .in("product_id", visibleIds);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await Promise.all(
      (images ?? []).map(async (image: {
        id: string;
        product_id: string;
        image_path: string;
        thumbnail_path: string;
      }) => {
        const path = data.thumbnail ? image.thumbnail_path : image.image_path;
        const result = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
        if (result.error || !result.data) return null;
        return { productId: image.product_id, url: result.data.signedUrl };
      }),
    );
    return signed.filter((item): item is { productId: string; url: string } => item !== null);
  });
