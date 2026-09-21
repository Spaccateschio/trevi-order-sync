import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getProductImageUrls, removeProductImage, saveProductImage } from "@/lib/product-images.functions";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 8000;

type ImageMeta = { id: string } | null;

async function canvasBlob(bitmap: ImageBitmap, maxDimension: number, quality: number) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile elaborare l’immagine");
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") throw new Error("Il browser non riesce a creare un’immagine WEBP");
  return blob;
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function optimize(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Formato non valido. Usa JPG, PNG o WEBP");
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("Il file deve essere inferiore a 12 MB");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Il file non è un’immagine valida o è danneggiato");
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > MAX_SOURCE_DIMENSION || bitmap.height > MAX_SOURCE_DIMENSION) {
      throw new Error("L’immagine non può superare 8.000 × 8.000 pixel");
    }
    const image = await canvasBlob(bitmap, 1600, 0.82);
    const thumbnail = await canvasBlob(bitmap, 160, 0.75);
    if (image.size > 2 * 1024 * 1024 || thumbnail.size > 150 * 1024) {
      throw new Error("L’immagine resta troppo pesante dopo l’ottimizzazione");
    }
    return { imageBase64: await blobToBase64(image), thumbnailBase64: await blobToBase64(thumbnail) };
  } finally {
    bitmap.close();
  }
}

export function ProductImageManager({ productId, image, editable, top = false }: { productId: string; image: ImageMeta; editable: boolean; top?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const getUrls = useServerFn(getProductImageUrls);
  const save = useServerFn(saveProductImage);
  const remove = useServerFn(removeProductImage);
  const queryKey = ["product-image-url", productId, image?.id ?? null];
  const imageQuery = useQuery({
    queryKey,
    enabled: Boolean(image),
    queryFn: async () => (await getUrls({ data: { productIds: [productId], thumbnail: false } }))[0] ?? null,
    staleTime: 8 * 60 * 1000,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product-image-url", productId] });
    await queryClient.invalidateQueries({ queryKey: ["prodotti"] });
  };
  const saveMutation = useMutation({
    mutationFn: async (file: File) => {
      const optimized = await optimize(file);
      return save({ data: { productId, expectedImageId: image?.id ?? null, ...optimized } });
    },
    onSuccess: async () => { toast.success(image ? "Immagine sostituita" : "Immagine caricata"); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMutation = useMutation({
    mutationFn: async () => remove({ data: { productId } }),
    onSuccess: async () => { toast.success("Immagine rimossa"); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = saveMutation.isPending || removeMutation.isPending;

  return <section aria-labelledby="product-image-heading" className={top ? "" : "border-t border-border pt-3"}>
    <div className="flex items-center justify-between gap-3">
      <h3 id="product-image-heading" className="text-sm font-semibold">Immagine prodotto</h3>
      {busy ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Elaborazione…</span> : null}
    </div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";
      if (file) saveMutation.mutate(file);
    }} />
    <div className="mt-2 flex min-h-20 items-center gap-3 border border-border bg-muted/30 p-2">
      {image && imageQuery.data?.url ? <img src={imageQuery.data.url} alt="Immagine del prodotto" className="h-24 w-24 shrink-0 object-contain" /> : <div className="grid h-20 w-20 shrink-0 place-items-center border border-dashed border-border text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{image ? imageQuery.isLoading ? "Caricamento immagine…" : "Immagine Trevi Fruit" : "Nessuna immagine"}</p>
        {editable ? <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{image ? <Pencil /> : <Upload />}{image ? "Sostituisci" : "Carica immagine"}</Button>
          {image ? <AlertDialog><Button type="button" variant="destructive" size="sm" disabled={busy} asChild><AlertDialogTrigger><span><Trash2 />Rimuovi</span></AlertDialogTrigger></Button><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rimuovere l’immagine?</AlertDialogTitle><AlertDialogDescription>L’immagine Trevi Fruit verrà rimossa da questo prodotto. I riferimenti immagine Danea resteranno invariati.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removeMutation.mutate()}>Rimuovi immagine</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}
        </div> : null}
      </div>
    </div>
  </section>;
}