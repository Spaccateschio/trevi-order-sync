# Prodotti interni, fornitori multipli, Preferiti, Inventario e raggruppamento — proposta finale

Nessuna modifica eseguita, nessuna migrazione. Di seguito cosa cambia rispetto al piano precedente e la proposta sul raggruppamento.

## A. Cosa cambia rispetto al piano precedente

1. **Il prodotto interno non dipende più dal fornitore che l'ha originato.** Via `source_seller_company_id` come vincolo funzionale: la provenienza iniziale resta solo come informazione storica (prodotto e azienda di origine, senza alcun effetto sul funzionamento).
2. **Un prodotto interno, molti fornitori.** Struttura già esistente e sufficiente: `product_supplier_links` collega il nostro prodotto a N schede fornitore, ognuna con il proprio codice fornitore, unità e conversione, costo, minimo d'ordine, tempi di consegna, fornitore preferito. Nessuna nuova tabella.
3. **La stella non crea più automaticamente un prodotto.** Mettendo la stella su un articolo di catalogo l'utente scegle esplicitamente: *Crea nuovo prodotto* oppure *Collega a un mio prodotto esistente*. Nessun abbinamento automatico per nome o codice simile.
4. **Preferito e prodotto gestito sono separati.** Togliere la stella riguarda solo l'interesse verso quell'articolo di quel fornitore: non disattiva il nostro prodotto, non rimuove il collegamento fornitore, non tocca lo storico. Disattivare un nostro prodotto è un'azione separata ed esplicita.
5. **Fornitori non B2B pienamente supportati.** Già oggi il collegamento punta alla scheda fornitore della nostra anagrafica: il rapporto B2B è opzionale e aggiunge solo dati e automazione.
6. Resta confermato: prodotti manuali senza Danea, archivio interno "Prodotti propri", codici `00-001` progressivi e alfanumerici ammessi, inventario disponibile anche alle aziende che vendono, fotografia dell'inventario immutabile all'apertura.

## B. Raggruppamento di denominazioni equivalenti

**Esiste già qualcosa?** No. Nel prodotto ci sono solo categoria, sottocategoria e livelli di sottocategoria: nessun concetto di prodotto principale, variante o equivalenza. Le funzioni esistenti non ne hanno traccia.

**Modello minimo proposto (da implementare solo dopo la tua approvazione, in una fase successiva):**
- una tabella `product_groups` per azienda: denominazione commerciale principale, note, stato;
- un riferimento facoltativo al gruppo sul prodotto (`product_group_id`), più un flag "denominazione principale del gruppo";
- nessuna fusione: codici, prezzi, U.M., fornitori, immagini, provenienza e storico dei prodotti restano distinti e separati;
- il raggruppamento è **sempre deciso dall'azienda**: nessun abbinamento automatico per somiglianza.

**Convivenza con il resto:**
- **Inventario e Fabbisogno** continuano a lavorare sul singolo prodotto interno: il gruppo non somma e non unifica giacenze;
- **Lista della Spesa e ordini** restano sul prodotto e scelgono il fornitore fra i collegamenti di quel prodotto;
- **pagina Prodotti** può mostrare i prodotti raggruppati sotto la denominazione principale, per ridurre il rumore visivo;
- **catalogo cliente** può esporre la denominazione principale con le varianti sotto, senza toccare prezzi e listini.

Nota: nella maggior parte dei casi l'esigenza "decine di articoli quasi identici" è già risolta dal punto A3 — collegando più articoli di fornitori diversi allo stesso prodotto interno. Il raggruppamento serve invece quando vogliamo mantenere prodotti interni distinti (pezzature, qualità, provenienze diverse) ma presentarli sotto un'unica denominazione. Suggerisco quindi di trattarlo come fase separata, dopo prodotti manuali + fornitori multipli + inventario.

## C. Piano operativo (fase 1, senza raggruppamento)

**1. Prodotti propri e archivio interno**
- Origine del prodotto: `danea` oppure `interno` (creato da noi, a mano o partendo da un catalogo). L'origine descrive solo **come è nato** il prodotto.
- Archivio interno "Prodotti propri" per azienda, creato al bisogno, non utilizzabile dalle postazioni Danea.
- L'importazione Danea opera esclusivamente sui prodotti di origine `danea`: non modifica e non depubblica mai i prodotti interni, anche a parità di codice.
- Codice interno proposto automaticamente (`00-001`, `00-002`, …), modificabile, anche alfanumerico, con controllo di unicità.

**2. Pagina Prodotti**
- "Nuovo prodotto": codice precompilato, descrizione, categoria, sottocategoria, U.M., produttore, barcode, note. Immagini e unità di vendita con le schermate esistenti.
- I prodotti interni sono riconoscibili nell'elenco; disattivazione del prodotto come azione esplicita.
- Nella scheda prodotto, l'elenco dei fornitori collegati (gestione già esistente) con possibilità di aggiungerne altri, B2B o non B2B.

**3. Stella nel catalogo fornitori**
- La stella registra l'interesse verso quell'articolo di quel fornitore (struttura esistente, invariata).
- Accanto alla stella, azione "Aggiungi ai miei prodotti" con due strade: *Crea nuovo prodotto* (dati precompilati dal catalogo) oppure *Collega a un mio prodotto esistente* (ricerca fra i miei prodotti). In entrambi i casi viene creato il collegamento fornitore con il codice del fornitore; se il collegamento esiste già viene riusato, mai duplicato.
- Togliere la stella non tocca prodotto, collegamenti, giacenze, storico.

**4. Inventario**
- Solo prodotti dell'azienda che conta, attivi e gestiti; nessun prodotto di altre aziende.
- Disponibile anche a chi solo vende; archivio Danea non più necessario per aprire.
- Righe con i fornitori collegati come informazione; giacenza, conteggi, differenze, note, chiusura invariati.
- Fotografia scritta una sola volta all'apertura: 50 restano 50.

**5. Non viene toccato**
Formule di giacenza, Fabbisogno, Lista della Spesa, Ordini fornitore, ricevute, lotti, provenienza, listini, immagini, permessi, route, layout approvati.

## D. Dettagli tecnici

- `products`: `origin` (enum `product_origin`: `danea`, `interno`) default `danea` + backfill; `is_managed boolean not null default true` (anagrafica operativa, indipendente dai preferiti); provenienza storica `created_from_product_id`, `created_from_company_id` nullable e **senza** uso funzionale; nessun vincolo di unicità che leghi il prodotto a un fornitore.
- `danea_archives`: `is_internal`; `ensure_internal_archive(company_id)`; guard postazioni esteso.
- `danea-import.server.ts`: filtro `origin = 'danea'` su lettura esistenti, upsert, depubblicazione per assenza e DeletedProducts.
- Nuove RPC (SECURITY DEFINER, `search_path = public`, controllo ruolo/appartenenza): `next_internal_product_code`, `manage_internal_product` (crea/modifica/disattiva), `link_catalog_product_to_own_product(buyer, seller, seller_product_id, own_product_id | null)` che crea al massimo un prodotto e un `product_supplier_links` verso la scheda fornitore del rapporto (creata/risolta con le funzioni esistenti), idempotente.
- `buyer_product_favorites`: invariata; nessuna cancellazione a cascata verso prodotti o collegamenti.
- `product_supplier_links`: nessuna modifica strutturale; si aggiunge solo un vincolo di unicità su (product_id, supplier_record_id) se non presente, per evitare doppioni.
- `start_general_inventory`: archivio opzionale (interno come ripiego); insieme = prodotti dell'azienda pubblicati e `is_managed = true`; scrittura della fotografia una sola volta, invariata; nessuna colonna nuova su `inventory_session_products`.
- `inventory_session_rows` / `inventory_session_progress`: aggiungono i fornitori collegati come informazione; aggregazioni sulle stesse righe.
- `record_inventory_count`, `close_general_inventory`, formule giacenza/fabbisogno: invariati.
- Test: prodotto manuale senza Danea; importazione completa che non tocca i prodotti interni nemmeno a codice uguale; stessa patata collegata a tre fornitori con una sola riga di inventario; stella su secondo fornitore che collega senza creare un secondo prodotto; rimozione stella che lascia prodotto, collegamenti e storico intatti; fornitore non B2B utilizzabile in Lista della Spesa; inventario di azienda solo-vendita; fotografia aperta che non cambia con stelle aggiunte o rimosse; nessuna regressione su Fabbisogno, Lista della Spesa, Ordini, Danea, listini.
