# Card «Non in lista»: scollega fornitore, quantità divise, B2B che resta mio

Solo analisi e proposta. Non modifico nulla finché non approvi.

## 1) Da dove arrivano oggi i dati

- **Card «Non in lista»** (`catalog-entries.tsx`, `useCatalogEntries`):
  - **I miei prodotti** (`own:`) vengono da `products` della mia azienda e del mio archivio. I nomi dei fornitori vengono da `product_supplier_links`, solo quelli attivi (`is_active`), con il nome preso dall'anagrafica fornitore.
  - **Articoli B2B non ancora miei** (`cat:`) vengono dal catalogo del venditore (`fetchSellerCatalogue`). Non esiste ancora una riga in `products` né un collegamento. Il fornitore è il venditore stesso.
  - Un articolo B2B diventa «mio» solo così:
    - `add_catalog_product_to_own_products`, con l'aggiunta dal catalogo, anche al Conferma del Carrello;
    - `copy_b2b_item_to_own_product`, con la copia esplicita.
  - Tutte e due creano il prodotto in `products`, con l'origine in `created_from_product_id`, e il collegamento in `product_supplier_links` con `b2b_item_id`.
  - Da quel momento la card `cat:` sparisce e resta la card `own:`.
- **Spunte attuali** (`catalog-destination-picker.tsx`): leggono `product_supplier_overview` e `product_supplier_b2b_options`, più le stelle (`readCardPreference`). La scelta resta nella bozza e al Conferma passa ad `autoAssignItem`.

## 2) Cosa succede oggi allo scollegamento nelle card in Lista

Il menu ⋮ → «Scollega dal prodotto» apre la finestra di conferma (`unlink-supplier-dialog.tsx`):
- **Prima** controlla con `unlink_supplier_preview` se il fornitore è usato in una Lista aperta o confermata (`_link_active_list_usage`) e mostra gli avvisi.
- **Poi** scollega:
  - per i fornitori B2B usa `unlink_b2b_catalog_item`;
  - per gli altri usa `unlink_product_supplier`.
- Tutte e due:
  - controllano che tu sia amministratore;
  - **bloccano** lo scollegamento se il fornitore ha quote in una Lista aperta («Togli prima il fornitore da questa Lista») o confermata;
  - altrimenti mettono solo `is_active = false` e tolgono la stella sul collegamento;
  - scrivono una riga in `audit_events`.
- Non cancellano nulla: righe, quantità, U.M., ordini e storico restano come sono.

## 3) Cosa succede al prodotto B2B se lo scollego

- **Prodotto già mio con collegamento B2B** (card `own:`): lo scollegamento disattiva solo il collegamento. La riga in `products` **resta**, con codice, descrizione e `created_from_product_id`. Il prodotto rimane nei tuoi Prodotti come articolo tuo, senza quel fornitore. Non ricompare il doppione `cat:`, perché l'origine resta registrata. Oggi quindi il punto 3 è già vero per i prodotti tuoi.
- **Articolo B2B non ancora mio** (card `cat:`): non c'è niente da scollegare. Per farlo «restare mio» bisogna prima crearlo con `add_catalog_product_to_own_products` (oppure `copy_b2b_item_to_own_product`) e poi scollegarlo. Sono due scritture fatte apposta: le propongo solo con il tuo via esplicito (vedi la domanda qui sotto).

## Proposta

### A. X per scollegare (solo prodotti miei)
- Accanto a ogni fornitore nelle spunte metto una **X** che apre **la stessa finestra di oggi** (`unlink-supplier-dialog.tsx`), con l'anteprima e la conferma.
- Nessuna funzione nuova: blocchi e controlli restano quelli del database.
- Dopo lo scollegamento la card ricarica i fornitori. Se il fornitore era spuntato nella bozza, la sua quota viene tolta e il Carrello lo segnala («ripartizione da rivedere»).
- Questa è una **scrittura immediata**, come oggi nelle card in Lista: non aspetta il Conferma, perché cambia il prodotto e non la Lista.
- Sulle card `cat:` la X non compare.

### B. Più fornitori + acquisto diretto con quantità divise (bozza)
- «Acquisto diretto» non spegne più gli altri: puoi spuntare insieme più fornitori e l'acquisto diretto.
- Con **una sola** destinazione spuntata funziona come oggi: tutta la quantità va lì.
- Con **due o più** destinazioni compare, per ognuna, un campo **quantità + U.M.**:
  - per i fornitori B2B, solo le U.M. pubblicate dal venditore;
  - per gli altri fornitori, le U.M. della referenza o del prodotto;
  - per l'acquisto diretto, la U.M. della riga.
  
  Come proposta iniziale la quantità è divisa in parti uguali (`equalSplit`), sempre modificabile.
- **Controllo della somma**: la somma viene controllata solo tra quote nella **stessa U.M.** del totale, oppure con una conversione fissa valida (`effective_supplier_conversion`). Con U.M. diverse e senza conversione: avviso «da verificare», mai somme inventate (regola «mai sommare kg e casse»).
- Se la somma non corrisponde, la riga del Carrello mostra un errore e il Conferma salta solo quel prodotto. Gli altri prodotti si salvano normalmente.
- Al Conferma le quote vanno nella **stessa** `commit_shopping_list_item_quantity` della quantità, cioè quote fornitore più quota diretta, già supportata. Il database ricontrolla tutto.
- Se tocchi solo le spunte senza scrivere le quote, vale la scelta automatica di oggi.

### C. B2B che resta mio
- Prodotti già miei: nessun intervento, è già così (vedi il punto 3).
- Articoli `cat:` (da decidere tu):
  - **C1**: non mostrare la X, consigliato;
  - **C2**: X che prima rende l'articolo tuo e poi lo scollega, con una conferma che spiega le due operazioni.

## Rischi

- **Ordini aperti**:
  - lo scollegamento non tocca ordini già generati o inviati. Le righe d'ordine restano con le loro fotografie;
  - con quote in una Lista aperta o confermata il database blocca;
  - un ordine fornitore in bozza o già inviato su quel collegamento resta valido, ma le Liste future non lo proporranno più.
- **Carrello**:
  - bozza con un fornitore scollegato nel frattempo: al Conferma il database rifiuta la quota e salva solo la quantità, con avviso (comportamento di oggi). La X invece aggiorna subito la bozza;
  - le quote divise vanno conservate nella bozza locale: una bozza vecchia senza quote resta valida.
- **Storico**: nulla cancellato. `audit_events` registra lo scollegamento. La memoria delle Liste chiuse con quel fornitore non verrà più proposta, perché `chooseListDestinations` scarta i collegamenti non attivi.
- **Mancanti e ciclo della Lista**: invariati, perché nessuna riga viene creata prima del Conferma.

## Cosa non tocco

- Database e funzioni SQL, comprese `unlink_*`, `add_catalog_product_to_own_products` e `copy_b2b_item_to_own_product`.
- Le card già in Lista e il loro menu ⋮.
- Gli ordini, l'esportazione verso Danea e lo storico.
- I prodotti in `products`.

## Dettagli tecnici

- `catalog-destination.ts`: la bozza diventa `{ deselectedLinks, preferLinkId, direct, labels, quotas?: { linkId | "direct", quantity, unitId, unitCode }[] }`. Nuovo controllo puro della somma (stessa U.M. o conversione fissa), con test.
- `catalog-destination-picker.tsx`:
  - X con `UnlinkSupplierDialog`, solo per `own:`;
  - diretto non esclusivo;
  - campi quota con almeno 2 destinazioni.
- `shopping-auto-assign.ts`: nuova opzione `explicitQuotas`, che con `collect` produce le scritture fornitore e diretto indicate, ricontrollate da `quotaFor`. Al posto di `forceDirect` esclusivo.
- `shopping-list-panel.tsx`: errore di somma nella riga del Carrello e passaggio delle quote al Conferma.
- Test sulle regole: somma, stessa U.M., niente somme tra U.M. diverse, diretto insieme ai fornitori.

## Domanda

Per gli articoli `cat:` preferisci **C1** (nessuna X) o **C2** (prima diventa tuo, poi lo scollego)?
