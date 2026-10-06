# Lista della Spesa: scegliere i prodotti da tutto ciò che si può comprare

## Obiettivo
Da «Aggiungi prodotti» si vedono, senza uscire dalla Lista:
- i propri prodotti (come oggi);
- i prodotti pubblicati dai fornitori collegati in B2B (es. i 115 di Trevi), anche se non sono ancora tra i propri prodotti.

Si possono filtrare, selezionare uno o più prodotti, scrivere la quantità e aggiungerli alla Lista in un solo passaggio.

## Cosa cambia nella finestra «Aggiungi prodotti»
- **Filtri**: Cerca (codice/descrizione), **Fornitore** (tutti / uno specifico, compresi i fornitori B2B), **Categoria**, **Sottocategoria** (dipende dalla categoria scelta). Etichette ✕ per togliere i filtri attivi.
- **Elenco**: per ogni riga foto, descrizione, codice, categoria/sottocategoria, U.M., fornitore e, per i prodotti B2B, il prezzo del listino a me riservato.
- **Niente limite di 100 righe**: si scorre tutto l'elenco filtrato.
- **Prodotto del catalogo fornitore non ancora mio**: selezionandolo e confermando, il programma lo aggiunge prima ai miei prodotti, già collegato a quel fornitore, e poi lo inserisce nella Lista. Il passaggio usa la funzione già esistente per aggiungere un prodotto dal catalogo ai propri prodotti, quindi nessun duplicato: se è già mio, uso quello.
- **Stella ★** resta disponibile su ogni riga: diventa preferito per i prossimi Inventari e per l'apertura della Lista.
- Quantità obbligatoria per ogni prodotto scelto (regola attuale invariata).

## Cosa non cambia
Card della Lista, conferma/chiusura, ordini, inventario, semaforo, database.

## Dettagli tecnici
- File: `src/components/shopping/add-products-dialog.tsx` (unico file toccato, più eventuale piccola funzione di lettura in `src/lib/shopping-list.functions.ts` per il catalogo B2B dei fornitori attivi, letto con i permessi dell'utente).
- Prodotti propri: `products` + fornitori da `product_supplier_links` per il filtro Fornitore; sottocategoria dal campo già importato da Danea.
- Catalogo B2B: prodotti pubblicati dei venditori con rapporto attivo (stessa fonte del catalogo B2B), prezzi da `buyer_catalog_prices`.
- Aggiunta: per le righe B2B non ancora proprie, `add_catalog_product_to_own_products` poi `addShoppingListItems` con l'id del prodotto proprio.
