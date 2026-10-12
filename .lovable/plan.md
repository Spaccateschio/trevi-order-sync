# Lista della Spesa: fornitore già pronto, contatori Preferiti e U.M. del fornitore B2B

## Cosa vedrai
1. **Stella del fornitore già messa.** Se un prodotto ha un solo fornitore collegato, quel fornitore ha subito la ★ e non devi impostare niente. La stella vale per tutte le Liste: se la sposti su un altro fornitore o su «Acquisto diretto», la Lista successiva parte da lì.
2. **Spunta già messa.** In ogni card in Lista il fornitore con la ★ (o l'unico fornitore) compare subito spuntato, anche senza quantità. Scrivendo la quantità, la quota va a lui. Se togli la spunta, la scelta resta salvata e non torna da sola.
3. **Contatori sempre visibili**, anche con «Tutti i prodotti»: «Prodotti 120 · Preferiti 20 · In Lista 19 · Con quantità 5 · Da inserire 14». Così capisci quante quantità mancano.
4. **U.M. del fornitore B2B nelle card «Non in lista».** Per ANANAS ORSERO compariranno le U.M. pubblicate da trevi (kg predefinita, pz, cs) al posto di solo «kg / Altra U.M.».

## Cosa non cambia
Inventario, semaforo, Genera ordini, Ordini, Consegne, Carico Merce, quantità già inserite e quote esistenti. Nessuna quantità viene copiata dalle Liste precedenti.

## Punto da confermare
La stella su «noi stessi» (Acquisto diretto) oggi non esiste come fornitore preferito. Propongo che resti la memoria dell'acquisto diretto abituale, già attiva dalle Liste chiuse, senza aggiungere una stella nuova. Se invece vuoi una stella anche lì, va aggiunta al database.

## Dettagli tecnici
1. **Database (1 migrazione)**
   - Funzione `_ensure_sole_supplier_preferred(product_id)`, SECURITY DEFINER, search_path = public: se il prodotto ha un solo collegamento attivo e nessun preferito, mette `is_preferred = true`. Viene chiamata da un trigger dopo l'inserimento o la riattivazione di un collegamento in `product_supplier_links`.
   - Allineamento una tantum dei prodotti esistenti con un solo fornitore e nessun preferito, per entrambe le aziende. Non tocca i prodotti con più fornitori o con una stella già messa.
   - Spunta senza quantità: `set_shopping_list_supplier_selection` accetta una riga selezionata ma vuota. `assert_assignment_purchase_data` e gli stati la considerano «Fornitore scelto, quantità mancante»: niente ordini, conta come non assegnata. Le funzioni di stato, anteprima, ordini e semaforo ignorano le quote vuote.
   - Alla creazione della riga in Lista (`add_shopping_list_items`), la spunta va al fornitore con la ★ o all'unico fornitore, salvo fornitore tolto o non acquistabile.
2. **Schermate**
   - `card-suppliers.tsx`: la spunta legge la riga selezionata anche senza quota.
   - `shopping-auto-assign.ts`: la quantità confermata riempie la riga già spuntata invece di crearne un'altra.
   - `shopping-list-panel.tsx`: barra dei contatori indipendente dal filtro Preferiti.
   - `catalog-entries.tsx`: per i prodotti propri con collegamento B2B, le U.M. vengono da quelle pubblicate dal venditore (`product_supplier_b2b_options`), con la predefinita preselezionata e senza «Altra U.M.».
3. **Prove e test**
   - Prove annullabili sul database: stella automatica, spunta senza quantità, riga vuota che non genera ordini, semaforo invariato, isolamento tra aziende.
   - Test automatici: contatori e scelta delle U.M. B2B.
   - Typecheck, build e schermate a 1280 e 390 px. Nessuna pubblicazione senza il tuo via.
