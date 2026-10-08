# Fotocamera per l'immagine prodotto

## Cosa esiste già (nessuna modifica necessaria)
- `src/components/products/product-image-manager.tsx` contiene già `optimize()`: ogni immagine caricata viene **rimpicciolita automaticamente nel browser** a max 1600×1600 px WEBP (qualità 0,82) + miniatura 160 px, prima del salvataggio. Una foto da 4-5 MB diventa ~200-400 KB.
- Il salvataggio passa da `saveProductImage` (`src/lib/product-images.functions.ts`), che verifica i limiti anche lato server.

## Cosa aggiungiamo
Un solo file modificato: `src/components/products/product-image-manager.tsx`.

1. **Pulsante «Scatta foto»** accanto a «Carica immagine» / «Sostituisci».
2. **Telefono/tablet**: un secondo input nascosto con `capture="environment"` apre direttamente la fotocamera posteriore; la foto scattata entra nello stesso flusso `optimize()` → riduzione automatica → salvataggio. Zero passaggi extra.
3. **Computer**: riquadro con anteprima webcam dal vivo (getUserMedia), pulsanti «Scatta» e «Annulla»; il fotogramma catturato diventa un File e passa dallo stesso `optimize()`. Se la webcam non c'è o il permesso è negato, messaggio chiaro e resta solo il caricamento da file.
4. La foto scattata **sostituisce** l'immagine esistente (stessa logica di «Sostituisci», con controllo `expectedImageId` già presente).

## Cosa NON tocchiamo
- Nessuna modifica al database, a `product-images.functions.ts`, a bucket/storage, né ad altri flussi (Lista, Inventario, Ordini…).
- Dimensioni e qualità restano quelle attuali (1600 px / miniatura 160 px), già approvate e in uso.

## Verifica
- Typecheck + build.
- Test browser: presenza del pulsante, apertura input con capture, e flusso di salvataggio simulato.
