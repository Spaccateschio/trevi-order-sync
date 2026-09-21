# Scheda prodotto: U.M. del prezzo da Danea, panoramica acquisto/vendita, immagine in alto

Solo interfaccia. Nessuna modifica al database, alle RPC, ai permessi o alla logica commerciale.

## 1. U.M. del prezzo: letta da Danea

- Per i prodotti che arrivano da Danea la riga "U.M. del prezzo" non è più un menu a tendina:
  mostra l'unità di Danea come dato di sola lettura (es. `mz`), con l'icona ⓘ che spiega
  "Arriva da Danea insieme ad articoli e listini".
- Per i prodotti creati a mano (senza Danea) resta il selettore attuale, perché non c'è
  nessuna unità da cui ereditare.
- Il valore già salvato non viene toccato: se un prodotto Danea ha oggi una U.M. prezzo scelta
  a mano, viene mostrata accanto all'unità Danea con nota "impostata manualmente" e un
  pulsante "Usa quella di Danea" (chiama la stessa RPC già esistente, nessuna nuova funzione).

## 2. Panoramica U.M.: acquisto e vendita separati

La sezione oggi chiamata "Impostazioni Trevi Fruit" diventa **U.M. del prodotto**, con due
blocchi affiancati su desktop e uno sotto l'altro su smartphone:

- **Acquisto** — elenco in sola lettura delle U.M. acquistabili raccolte dalle referenze
  fornitore (★ = predefinita della referenza), con il nome del fornitore. Se non ci sono
  referenze: "Nessuna U.M. di acquisto". La gestione resta dove è già: sezione Fornitori.
- **Vendita** — i pulsanti U.M. attuali con +, la selezione e il pannello di dettaglio
  (attiva, visibile cliente, predefinita, conversione, Rimuovi) esattamente come adesso.

Così in una sola schermata si vede con quali unità si compra e con quali si vende.

## 3. Immagine in alto

`ProductImageManager` passa subito sotto il titolo, in una riga compatta: miniatura a
sinistra e comandi a destra. Le altre sezioni scorrono sotto nell'ordine attuale
(U.M. del prodotto → Fornitori → Inventario → Provenienze → Dati Danea).

## Note tecniche

- File toccati: `product-detail-sheet.tsx`, `sales-unit-manager.tsx`,
  `product-image-manager.tsx` e una lettura delle U.M. acquisto già disponibili in
  `product_supplier_overview` (stessa query usata da `ProductSuppliersManager`).
- Nessuna nuova tabella, colonna, RPC o policy; nessun campo Danea scritto.

## Rischio da confermare

Bloccando la scelta manuale della U.M. prezzo sui prodotti Danea, chi oggi la cambia a mano
non potrà più farlo (resta il pulsante per allinearla a Danea). Se preferisci mantenere la
possibilità di sovrascrivere, dimmelo e lascio il menu attivo con Danea come valore proposto.
