import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "product-images";
const MAX_MAIN_BYTES = 2 * 1024 * 1024;
const MAX_THUMB_BYTES = 150 * 1024;

const uploadSchema = z.object({
  productId: z.string().uuid(),
  expectedImageId: z.string().uuid().nullable(),
  imageBase64: z.string().min(1),
  thumbnailBase64: z.string().min(1),
});

const productSchema = z.object({ productId: z.string().uuid() });
const urlsSchema = z.object({ productIds: z.array(z.string().uuid()).min(1).max(50), thumbnail: z.boolean() });

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function byteAt(bytes: Uint8Array, offset: number) {
  const value = bytes[offset];
  if (value === undefined) throw new Error("Immagine WEBP incompleta");
  return value;
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return byteAt(bytes, offset) + (byteAt(bytes, offset + 1) << 8) + (byteAt(bytes, offset + 2) << 16);
}

function parseWebp(bytes: Uint8Array): { width: number; height: number } {
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") {
    throw new Error("Il file elaborato non è un’immagine WEBP valida");
  }
  const kind = text(12, 4);
  if (kind === "VP8X") {
    return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27) };
  }
  if (kind === "VP8 " && bytes.length >= 30 && byteAt(bytes, 23) === 0x9d && byteAt(bytes, 24) === 0x01 && byteAt(bytes, 25) === 0x2a) {
    return {
      width: (byteAt(bytes, 26) | (byteAt(bytes, 27) << 8)) & 0x3fff,
      height: (byteAt(bytes, 28) | (byteAt(bytes, 29) << 8)) & 0x3fff,
    };
  }
  if (kind === "VP8L" && bytes.length >= 25 && byteAt(bytes, 20) === 0x2f) {
    const bits = byteAt(bytes, 21) | (byteAt(bytes, 22) << 8) | (byteAt(bytes, 23) << 16) | (byteAt(bytes, 24) << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error("Formato WEBP non riconosciuto");
}

async function sha256(bytes: Uint8Array) {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getAuthorizedProduct(
  context: { supabase: any; userId: string },
  productId: string,
  requireAdmin: boolean,
) {
  const { data: product, error } = await context.supabase
    .from("products")
    .select("id, company_id, archive_id")
    .eq("id", productId)
    .maybeSingle();
  if (error || !product) throw new Error("Prodotto non trovato o non accessibile");
  if (requireAdmin) {
    const { data: isAdmin } = await context.supabase.rpc("is_company_admin", { _company_id: product.company_id });
    if (isAdmin !== true) throw new Error("Operazione riservata agli amministratori dell’azienda");
  }
  return product as { id: string; company_id: string; archive_id: string };
}

async function logCleanupFailure(
  supabaseAdmin: any,
  companyId: string,
  userId: string,
  productId: string,
  paths: string[],
  message: string,
) {
  await supabaseAdmin.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: userId,
    action: "product_image.file_cleanup_failed",
    entity_type: "product",
    entity_id: productId,
    detail: { paths, error: message },
  });
}

export const getProductImageUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => urlsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowedProducts, error: productError } = await context.supabase
      .from("products")
      .select("id")
      .in("id", data.productIds);
    if (productError) throw new Error(productError.message);
    const allowedIds = (allowedProducts ?? []).map((row: { id: string }) => row.id);
    if (!allowedIds.length) return [];

    const { data: images, error } = await context.supabase
      .from("product_images")
      .select("id, product_id, image_path, thumbnail_path")
      .in("product_id", allowedIds);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    type ImageRow = { id: string; product_id: string; image_path: string; thumbnail_path: string };
    const rows: ImageRow[] = [...((images ?? []) as ImageRow[])];

    // Fallback: per i prodotti senza foto propria, mostra la foto dell'articolo del fornitore collegato.
    const withImage = new Set(rows.map((row) => row.product_id));
    const missing = allowedIds.filter((id) => !withImage.has(id));
    if (missing.length) {
      const { data: links } = await context.supabase
        .from("product_supplier_links")
        .select("product_id, supplier_record_id, supplier_product_code")
        .in("product_id", missing)
        .eq("is_active", true);

      const supplierRecordIds = [...new Set((links ?? []).map((link) => link.supplier_record_id))];
      if (supplierRecordIds.length) {
        const { data: relations } = await context.supabase
          .from("supplier_customer_relations")
          .select("supplier_record_id, seller_company_id, status")
          .in("supplier_record_id", supplierRecordIds)
          .eq("status", "attivo");

        const sellerByRecord = new Map<string, string>();
        for (const relation of relations ?? []) {
          if (relation.supplier_record_id) sellerByRecord.set(relation.supplier_record_id, relation.seller_company_id);
        }

        const wanted = (links ?? [])
          .map((link) => ({
            productId: link.product_id,
            code: link.supplier_product_code,
            sellerId: sellerByRecord.get(link.supplier_record_id) ?? null,
          }))
          .filter((entry): entry is { productId: string; code: string; sellerId: string } => Boolean(entry.code && entry.sellerId));

        const sellerIds = [...new Set(wanted.map((entry) => entry.sellerId))];
        const codes = [...new Set(wanted.map((entry) => entry.code))];
        if (sellerIds.length && codes.length) {
          const { data: sellerProducts } = await supabaseAdmin
            .from("products")
            .select("id, company_id, code")
            .in("company_id", sellerIds)
            .in("code", codes);

          const sellerProductByKey = new Map<string, string>();
          for (const product of sellerProducts ?? []) {
            if (product.code) sellerProductByKey.set(`${product.company_id}|${product.code}`, product.id);
          }

          const sellerProductIds = [...new Set([...sellerProductByKey.values()])];
          if (sellerProductIds.length) {
            const { data: sellerImages } = await supabaseAdmin
              .from("product_images")
              .select("id, product_id, image_path, thumbnail_path")
              .in("product_id", sellerProductIds);

            const imageBySellerProduct = new Map<string, ImageRow>();
            for (const image of (sellerImages ?? []) as ImageRow[]) imageBySellerProduct.set(image.product_id, image);

            const used = new Set<string>();
            for (const entry of wanted) {
              if (used.has(entry.productId) || withImage.has(entry.productId)) continue;
              const sellerProductId = sellerProductByKey.get(`${entry.sellerId}|${entry.code}`);
              const image = sellerProductId ? imageBySellerProduct.get(sellerProductId) : undefined;
              if (!image) continue;
              used.add(entry.productId);
              rows.push({ ...image, product_id: entry.productId });
            }
          }
        }
      }
    }

    return Promise.all(rows.map(async (image) => {
      const path = data.thumbnail ? image.thumbnail_path : image.image_path;
      const { data: signed, error: signError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
      if (signError) throw new Error("Impossibile visualizzare l’immagine");
      return { id: image.id, productId: image.product_id, url: signed.signedUrl };
    }));
  });

export const saveProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const product = await getAuthorizedProduct(context, data.productId, true);
    const imageBytes = decodeBase64(data.imageBase64);
    const thumbnailBytes = decodeBase64(data.thumbnailBase64);
    if (imageBytes.byteLength > MAX_MAIN_BYTES || thumbnailBytes.byteLength > MAX_THUMB_BYTES) {
      throw new Error("L’immagine ottimizzata supera i limiti consentiti");
    }
    const imageSize = parseWebp(imageBytes);
    const thumbnailSize = parseWebp(thumbnailBytes);
    if (imageSize.width > 1600 || imageSize.height > 1600 || thumbnailSize.width > 160 || thumbnailSize.height > 160) {
      throw new Error("Le dimensioni dell’immagine non rispettano i limiti consentiti");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin.from("product_images").select("id").eq("product_id", product.id).maybeSingle();
    if ((current?.id ?? null) !== data.expectedImageId) throw new Error("L’immagine è cambiata: ricarica il prodotto e riprova");

    const versionId = crypto.randomUUID();
    const prefix = `${product.company_id}/${product.archive_id}/${product.id}/${versionId}`;
    const imagePath = `${prefix}/image.webp`;
    const thumbnailPath = `${prefix}/thumb.webp`;
    const uploaded: string[] = [];
    try {
      const mainUpload = await supabaseAdmin.storage.from(BUCKET).upload(imagePath, imageBytes, { contentType: "image/webp", upsert: false });
      if (mainUpload.error) throw new Error(mainUpload.error.message);
      uploaded.push(imagePath);
      const thumbUpload = await supabaseAdmin.storage.from(BUCKET).upload(thumbnailPath, thumbnailBytes, { contentType: "image/webp", upsert: false });
      if (thumbUpload.error) throw new Error(thumbUpload.error.message);
      uploaded.push(thumbnailPath);

      const checksum = await sha256(imageBytes);
      const { data: replaced, error: rpcError } = await supabaseAdmin.rpc("set_product_image", {
        _company_id: product.company_id,
        _archive_id: product.archive_id,
        _product_id: product.id,
        _image_path: imagePath,
        _thumbnail_path: thumbnailPath,
        _content_type: "image/webp",
        _width: imageSize.width,
        _height: imageSize.height,
        _byte_size: imageBytes.byteLength,
        _thumbnail_width: thumbnailSize.width,
        _thumbnail_height: thumbnailSize.height,
        _thumbnail_byte_size: thumbnailBytes.byteLength,
        _checksum_sha256: checksum,
        _actor_user_id: context.userId,
      });
      if (rpcError) throw new Error(rpcError.message);

      const old = replaced?.[0];
      const oldPaths = [old?.old_image_path, old?.old_thumbnail_path].filter((path): path is string => Boolean(path));
      if (oldPaths.length) {
        const removal = await supabaseAdmin.storage.from(BUCKET).remove(oldPaths);
        if (removal.error) await logCleanupFailure(supabaseAdmin, product.company_id, context.userId, product.id, oldPaths, removal.error.message);
      }
      return { id: current?.id ?? versionId };
    } catch (error) {
      if (uploaded.length) await supabaseAdmin.storage.from(BUCKET).remove(uploaded);
      throw error;
    }
  });

export const removeProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => productSchema.parse(input))
  .handler(async ({ data, context }) => {
    const product = await getAuthorizedProduct(context, data.productId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: removed, error } = await supabaseAdmin.rpc("remove_product_image", {
      _company_id: product.company_id,
      _product_id: product.id,
      _actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const row = removed?.[0];
    const paths = [row?.old_image_path, row?.old_thumbnail_path].filter((path): path is string => Boolean(path));
    if (paths.length) {
      const removal = await supabaseAdmin.storage.from(BUCKET).remove(paths);
      if (removal.error) await logCleanupFailure(supabaseAdmin, product.company_id, context.userId, product.id, paths, removal.error.message);
    }
    return { removed: true };
  });