# Prodotti propri, prodotti manuali, Preferiti e Inventario — analisi e proposta rivista

Nessuna modifica eseguita. Hai ragione sull'obiezione: l'inventario non deve contenere righe di prodotti appartenenti al fornitore. Sotto le risposte verificate e la proposta corretta.

## A. Risposta alle quattro domande di verifica

**1. Esiste già una struttura per "prodotto del fornitore gestito dall'acquirente"? Sì.**
L'architettura attuale la ha già e non serve inventarne una nuova:
- il prodotto è sempre di proprietà dell'azienda (azienda + archivio + codice);
- `product_supplier_links` collega un **prodotto dell'acquirente** a una **scheda fornitore dell'acquirente** e contiene già: codice prodotto del fornitore, unità di acquisto, fattore di conversione e U.M. di riferimento, costo manuale, quantità minima, tempi di consegna, fornitore preferito, attivo/non attivo, origine (manuale o Danea);
- la scheda fornitore può già essere agganciata al rapporto B2B con il fornitore reale (funzione di collegamento scheda↔rapporto già presente);
- `shopping_list_item_suppliers` punta già a `product_supplier_links`: il percorso Fabbisogno → Lista della Spesa → Ordine fornitore passa da lì, oggi.

Quindi il Preferito di catalogo non deve entrare nell'inventario: deve **generare l'articolo gestito dell'acquirente** (prodotto proprio) più il collegamento al fornitore.

**2. Chi è il proprietario di stock e conteggi**
Sempre l'azienda che conta. Giacenze, conteggi, rettifiche, movimenti e lotti restano legati a un prodotto dell'azienda acquirente. Il prodotto del fornitore resta il riferimento di provenienza (catalogo, codice fornitore, prezzo), non l'oggetto inventariato.

**3. Come arriva a Fabbisogno → Lista della Spesa → Ordine**
Attraverso la catena che esiste già: prodotto dell'acquirente → collegamento fornitore (codice + conversione + costo) → riga di lista con fornitore scelto → ordine al fornitore corretto. Poiché il collegamento porta il rapporto B2B, l'ordine arriverà al fornitore giusto senza logiche nuove.

**4. Cosa succede allo storico se togli il Preferito**
Niente si perde, per costruzione: il prodotto dell'acquirente e i suoi conteggi/movimenti sono suoi e restano. Togliere il Preferito significa solo "non lo tratto più abitualmente": l'articolo viene marcato non più gestito e non entrerà nelle **prossime** fotografie di inventario. L'inventario già aperto non cambia mai: la fotografia viene scritta una sola volta all'apertura.

## B. Proposta rivista

**1. Origine del prodotto e archivio interno (confermato)**
- Nuova origine sul prodotto: `danea`, `manuale`, `catalogo` (derivato da un preferito di catalogo).
- Archivio interno "Prodotti propri" per azienda, creato al bisogno, non utilizzabile dalle postazioni Danea: i prodotti manuali e quelli derivati da catalogo vivono lì, separati dagli archivi Danea.
- L'importazione Danea lavora solo sui prodotti di origine `danea`: non modifica e non depubblica mai gli altri.
- Codici manuali: proposta automatica `00-001`, `00-002`, … modificabili, anche alfanumerici, con controllo di unicità.

**2. Nuovo prodotto nella pagina Prodotti (confermato)**
Pulsante "Nuovo prodotto" con codice precompilato, descrizione, categoria, sottocategoria, U.M., produttore, barcode, note. Immagini e unità di vendita con le schermate esistenti. Danea diventa una fonte di importazione, non un requisito.

**3. Preferito di catalogo → articolo gestito dall'acquirente (punto corretto)**
Quando l'acquirente mette la stella su un prodotto del fornitore:
- se non esiste già, viene creato **un prodotto dell'azienda acquirente** nell'archivio interno, con descrizione, categoria, U.M. e immagine di riferimento copiate dal prodotto di catalogo, codice proprio proposto automaticamente, origine `catalogo` e provenienza registrata (prodotto originale del fornitore + azienda fornitrice);
- viene creato/riattivato il **collegamento fornitore** sull'articolo, con codice prodotto del fornitore, unità e conversione se disponibili, agganciato alla scheda fornitore del rapporto B2B;
- l'articolo risulta "gestito/inventariabile";
- togliendo la stella l'articolo viene solo marcato non gestito: prodotto, collegamento fornitore e storico restano. Rimettendo la stella si riattiva lo stesso articolo, senza duplicati.
Un prodotto solo visibile nel catalogo, senza stella, non diventa articolo e non è inventariabile.

**4. Inventario**
- Nessun prodotto di altre aziende nella fotografia: solo prodotti dell'azienda che conta (Danea + manuali + derivati da catalogo e ancora gestiti).
- Via il blocco sul profilo d'acquisto: anche un'azienda che vende (Trevi) fa inventario sui propri prodotti.
- L'apertura non richiede più un archivio Danea: in mancanza, si usa l'archivio interno.
- Le righe mostrano il fornitore di riferimento quando esiste. Giacenza, conteggi, differenze, note e chiusura restano identici.
- Fotografia immutabile confermata: 50 all'apertura restano 50; stelle aggiunte o togliate dopo valgono dal prossimo inventario.

**5. Non viene toccato**
Formule di giacenza, Fabbisogno, Lista della Spesa, Ordini fornitore, ricevute, lotti, provenienza, listini, immagini, permessi, route, layout approvati.

## C. Dettagli tecnici

- `products`: colonna `origin` (enum `product_origin`: `danea`, `manuale`, `catalogo`), default `danea` e backfill; colonne di provenienza `source_product_id` + `source_seller_company_id` (nullable, valorizzate per l'origine `catalogo`); `is_managed boolean not null default true` per "articolo gestito"; indice unico parziale su (company_id, source_seller_company_id, source_product_id) per impedire doppioni da catalogo; nessun cambio a `products_archive_code_unique`.
- `danea_archives`: flag `is_internal`; `ensure_internal_archive(company_id)`; guard postazioni esteso per vietare archivi interni.
- `danea-import.server.ts`: filtro `origin = 'danea'` su lettura esistenti, upsert, depubblicazione per assenza e DeletedProducts. Nessun'altra modifica alla sincronizzazione.
- Nuove RPC: `manage_manual_product`, `next_manual_product_code`, `ensure_managed_catalog_product(buyer, seller, product_id)` chiamata dal toggle Preferito (crea prodotto + `product_supplier_links` verso la scheda fornitore del rapporto, riusa la riga esistente se c'è, riattiva `is_managed`), e disattivazione di `is_managed` alla rimozione della stella. Tutte SECURITY DEFINER con `search_path = public` e controllo rapporto B2B operativo.
- `buyer_product_favorites` resta la sorgente della scelta; nessuna duplicazione con `company_product_favorites` (che resta la stella aziendale sui prodotti propri).
- `start_general_inventory`: archivio opzionale; insieme prodotti = prodotti dell'azienda pubblicati con `is_managed = true`; scrittura della fotografia una sola volta (invariata). Nessuna colonna nuova su `inventory_session_products`.
- `inventory_session_rows`/`inventory_session_progress`: aggiungono il fornitore di riferimento letto dal collegamento fornitore; aggregazioni sempre sulle stesse righe della fotografia.
- `record_inventory_count`, `close_general_inventory`, formule di giacenza: invariati.
- Test finali: prodotto manuale senza Danea; importazione completa che non tocca manuali/catalogo; codice manuale uguale a uno Danea senza collisione; inventario di azienda solo-vendita; stella su prodotto di catalogo che crea un solo articolo gestito con fornitore corretto; seconda stella/rimozione/ristella senza duplicati e con storico intatto; preferiti di più fornitori distinti; fotografia aperta che non cambia; Fabbisogno/Lista della Spesa che propongono il fornitore corretto per l'articolo derivato; nessuna regressione su Ordini, Danea, listini.
