# Fase 1 — Prodotti interni, prodotti manuali, N fornitori, Inventario

Raggruppamento (`product_groups`) escluso da questa fase.

## A. Verifica richiesta sul punto 1 (collegamenti fornitore)

Verificato sul database: **oggi non esiste alcun vincolo di unicità** su `product_supplier_links`, e la funzione di gestione esistente inserisce liberamente. Quindi **più referenze dello stesso fornitore sullo stesso nostro prodotto sono già possibili**: `0255 PATATE BN IT` e `0832 PATATE BIANCHE SACCO 10 KG` possono convivere sotto `00-001`, ognuna con codice, unità d'acquisto, conversione, costo, minimo e tempi propri. Un solo collegamento per prodotto può essere "preferito", e questo resta.

**Decisione: non introduco `UNIQUE (product_id, supplier_record_id)`.** L'unico duplicato da evitare è la stessa referenza aggiunta due volte: l'azione "Aggiungi ai miei prodotti" riusa il collegamento se esistono già stesso prodotto + stesso fornitore + stesso codice fornitore, altrimenti ne crea uno nuovo. Nessun vincolo nuovo sul database, così la gestione manuale resta libera.

Nessun altro conflitto strutturale: si può procedere con la Fase 1.

## B. Cosa faremo

**1. Prodotti interni e archivio separato**
- Origine prodotto: `danea` oppure `interno` (descrive solo come è nato).
- Archivio interno "Prodotti propri" per azienda, creato al bisogno, non utilizzabile dalle postazioni Danea.
- Importazione Danea (completa e incrementale) limitata ai prodotti `danea`: un codice interno uguale a un codice Danea non causa aggiornamenti, fusioni o depubblicazioni. Nessun'altra modifica alle regole Danea.
- Codice interno proposto `00-001`, `00-002`, … modificabile, anche alfanumerico, con controllo di unicità.

**2. Pagina Prodotti**
- "Nuovo prodotto" disponibile anche senza Danea: codice precompilato, descrizione, categoria, sottocategoria, U.M., produttore, barcode, note. Immagini e unità di vendita con le schermate esistenti.
- Un prodotto può avere zero, uno o più fornitori; senza fornitore partecipa comunque a Inventario e Fabbisogno, e il fornitore si assegna poi in Lista della Spesa.
- Disattivazione del prodotto come azione esplicita e separata.

**3. Stella e "Aggiungi ai miei prodotti": azioni indipendenti**
- La stella resta solo un segnalibro nel catalogo del fornitore. Non è richiesta per aggiungere un articolo ai propri prodotti e togliendola non cambia nulla su prodotti interni, collegamenti fornitore, inventario e storico.
- "Aggiungi ai miei prodotti" su una referenza di catalogo offre due strade:
  - **Crea nuovo prodotto**: prodotto nell'archivio interno, codice proposto, descrizione e dati compatibili precompilati dal catalogo, più il collegamento a quella specifica referenza del fornitore;
  - **Collega a prodotto esistente**: ricerca fra i miei prodotti, nessun prodotto creato, solo il collegamento a quella referenza.
- Nessun abbinamento automatico per descrizione o codice.

**4. Inventario**
- Solo prodotti dell'azienda che conta, attivi e gestiti; nessun prodotto appartenente ai fornitori.
- Un prodotto compare una sola volta, qualunque sia il numero di fornitori collegati; i fornitori sono solo informazione e non moltiplicano le righe.
- Funziona per profilo acquisto, vendita, entrambi, con e senza Danea.
- Fotografia invariata: una sessione aperta con 50 prodotti resta a 50.

**5. Fabbisogno e Lista della Spesa**
Nessuna modifica alle formule; solo verifica end-to-end del percorso prodotto → fabbisogno → lista → scelta fornitore (anche non B2B) → ordine.

**6. Fuori da questa fase**
Raggruppamento di denominazioni equivalenti: fase successiva, non influenza questa implementazione.

## C. Dettagli tecnici

- `products`: `origin` (enum `product_origin`: `danea`, `interno`) default `danea` + backfill; `is_managed boolean not null default true`, indipendente dai preferiti; provenienza storica `created_from_product_id` e `created_from_company_id` nullable, senza uso funzionale; nessun vincolo che leghi il prodotto a un fornitore.
- `danea_archives`: `is_internal`; `ensure_internal_archive(company_id)`; guard postazioni esteso per vietare archivi interni.
- `danea-import.server.ts`: filtro `origin = 'danea'` su lettura esistenti, upsert, depubblicazione per assenza e DeletedProducts.
- `product_supplier_links`: **nessun cambio strutturale, nessun vincolo di unicità nuovo**; deduplica applicativa su (product_id, supplier_record_id, supplier_product_code).
- Nuove RPC (SECURITY DEFINER, `search_path = public`, controllo appartenenza/ruolo): `next_internal_product_code`, `manage_internal_product` (crea/modifica/disattiva), `add_catalog_product_to_own_products(buyer, seller, seller_product_id, own_product_id | null, …)` che crea al massimo un prodotto e un collegamento, idempotente, con risoluzione della scheda fornitore tramite le funzioni esistenti.
- `buyer_product_favorites`: invariata; nessun effetto a cascata.
- `start_general_inventory`: archivio opzionale con ripiego sull'archivio interno; insieme = prodotti dell'azienda pubblicati e `is_managed = true`; fotografia scritta una sola volta; nessuna colonna nuova su `inventory_session_products`.
- `inventory_session_rows` / `inventory_session_progress`: fornitori collegati come informazione, aggregazioni sulle stesse righe.
- `record_inventory_count`, `close_general_inventory`, formule giacenza e fabbisogno: invariati.

## D. Test finali (report separato per area)

Database → Backend/RPC → Interfaccia → Danea → Inventario → Fabbisogno/Lista della Spesa → regressioni. Casi: prodotto manuale senza Danea; due referenze dello stesso fornitore sullo stesso prodotto; tre fornitori diversi su un solo prodotto con una sola riga di inventario; stella indipendente dall'aggiunta ai propri prodotti e rimozione stella senza effetti; importazione completa che non tocca i prodotti interni nemmeno a codice uguale; inventario per azienda solo-vendita e senza Danea; fotografia aperta che non cambia; percorso fabbisogno → lista → fornitore non B2B → ordine; nessuna regressione su Ordini, ricevute, lotti, listini, layout approvati.
