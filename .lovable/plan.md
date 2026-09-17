# Revisione completa Vendite → Prodotti

## 1. Cosa c'è oggi

La pagina attuale è una tabella semplice: intestazione alta, tre filtri, 7 colonne fisse, 50 righe per pagina, dettaglio in finestra centrale. Nessuna scelta colonne, nessun ridimensionamento, nessun ordinamento, nessuna selezione, nessuna stampa né esportazione. Nessun dato operativo di Trevi Fruit sul prodotto (le U.M. di vendita non esistono ancora).

## 2. Cosa Danea ci sta realmente inviando (verificato sui tuoi file)

Presenti nei file reali: Codice, Descrizione, Descrizione HTML, Categoria, Sottocategoria, U.M., IVA (percentuale, classe, descrizione), Produttore, Note, Listini 1–3 (netti e ivati), Fornitore/Codice fornitore/costo, Nome file immagine, Identificativo interno, più due campi che oggi **non stiamo salvando**: unità della taglia e unità del peso.

Previsti dal formato ma assenti nei tuoi file: Barcode, Tipo prodotto, Link, Codice prodotto fornitore, Note fornitore, Campi personalizzati 1–4, Sottocategorie di livello 2–9, Listini 4–9, Cartella immagini (arriva solo da una delle due postazioni).

**Giacenze: assenti.** Nessun campo di magazzino/disponibilità viene trasmesso da questa pubblicazione di Danea. Non inventerò valori: la colonna Giacenza non comparirà finché il file non conterrà il dato. Per riceverlo servirà verificare in Danea l'opzione di pubblicazione delle quantità disponibili; il piano prepara solo il posto dove salvarlo.

**Immagini: abbiamo solo il nome del file e una cartella del tuo PC.** Il file immagine non viene trasferito. Quindi in griglia non mostrerò immagini finte: mostrerò una miniatura solo se esiste un'immagine caricata su Trevi Fruit, con caricamento manuale nel dettaglio prodotto, senza toccare il riferimento originale Danea.

## 3. Archivi Danea (da fare per primo)

Oggi il prodotto è identificato da azienda + identificativo interno, ed è la causa dell'errore che hai visto: due archivi Danea diversi riusano gli stessi identificativi e codici.

Nuovo modello: **Azienda → Archivio Danea → Postazioni**. Ogni prodotto appartiene a un archivio; l'identità diventa azienda + archivio + identificativo interno (e azienda + archivio + codice come ripiego). Due archivi possono avere entrambi il codice 001 senza confondersi.

Conseguenze:
- Un invio completo allinea e depubblica **solo** i prodotti del proprio archivio.
- "Invia solo voci modificate" resta incrementale sul proprio archivio.
- La pagina Prodotti ottiene colonna opzionale Archivio, filtro Archivio e vista "tutti gli archivi insieme": un solo catalogo, provenienza sempre riconoscibile.
- In futuro un ordine con prodotti di due archivi potrà essere separato per archivio: la riga d'ordine porterà l'archivio, quindi ogni Danea scaricherà solo le proprie righe. Non implemento ora il ritorno ordini.

Migrazione senza perdite: creo l'archivio "Archivio principale", vi assegno i 4 prodotti già ricevuti, i listini, lo storico invii e **entrambe** le postazioni esistenti (Pc Ufficio Andrea e pc casa andrea restano identiche: nome, utente, password, indirizzo).

Nella pagina Gestionale la relazione diventa esplicita e visibile: prima l'**Archivio Danea** con il suo nome, e dentro di esso le **postazioni che gli appartengono** — non più un elenco piatto di PC. Potrai creare e rinominare un archivio e assegnare o spostare una postazione da un archivio all'altro, con richiesta di conferma quando lo spostamento può cambiare l'esito dei successivi invii completi.

Importante per te: **prima di usare il secondo Danea, crea il relativo archivio e assegnagli pc casa andrea**, altrimenti i due cataloghi tornerebbero a sovrapporsi.

## 4. Pagina compatta e griglia gestionale

Intestazione ridotta a una sola barra: **Prodotti | Cerca | Categoria | Archivio | Stato | Colonne | Stampa | Esporta | Importa da Danea**. Subito sotto parte la griglia, righe compatte, intestazione fissa allo scorrimento.

Colonne predefinite (5): **Codice, Descrizione, Categoria, U.M. Danea, Listino 1**. Tutte le altre si attivano dal pulsante Colonne con elenco a caselle di spunta, comprese le colonne dei dati Trevi Fruit (U.M. di vendita, U.M. predefinita) e Archivio. Le colonne che dipendono da dati non ancora inviati (giacenza) restano fuori dall'elenco fino a quando il dato arriva davvero.

Comportamento tipo Excel: trascinamento del bordo per la larghezza, trascinamento dell'intestazione per l'ordine, clic per ordinare crescente/decrescente con ordinamento coerente al tipo (testo, numero, prezzo, data), casella di selezione per riga e "seleziona tutti".

Preferenze salvate **per utente e per tipo di dispositivo** (desktop / tablet / smartphone separati, così un layout largo non rovina il telefono): colonne visibili, ordine, larghezze, ordinamento. Pulsante "Ripristina impostazioni predefinite".

Su smartphone niente griglia Excel: elenco compatto a schede con i dati principali e apertura rapida del dettaglio. Tablet: griglia ridotta ma configurabile.

Dettaglio prodotto in pannello laterale su desktop (non perdi la posizione) e a tutto schermo su telefono, diviso visivamente in **DATI DANEA — sola lettura** e **IMPOSTAZIONI TREVI FRUIT — modificabili**.

## 5. Selezione, stampa, esportazione

Selezionando prodotti compare una barra azioni compatta: **Stampa**, **Esporta**, **Gestisci U.M. vendita**. Nessuna modifica in blocco dei dati Danea.

Stampa: i prodotti selezionati con le colonne attualmente visibili nello stesso ordine, layout A4 leggibile, orientamento orizzontale automatico oltre 6 colonne, intestazione ripetuta.

Esportazione: **CSV per Excel** (separatore punto e virgola, accenti corretti, si apre con doppio clic) sui selezionati o, senza selezione, su tutto il risultato filtrato; rispetta colonne visibili e ordine. Nessuna libreria aggiuntiva.

## 6. Unità di misura Trevi Fruit

La U.M. Danea non si tocca mai. Sopra di essa aggiungiamo uno strato Trevi Fruit.

**Anagrafica U.M. aziendale**: elenco delle unità utilizzabili (kg, pz, cs, lt, ml, nr, vaschetta, mazzo…) con sigla, descrizione e stato attivo. L'amministratore aggiunge, modifica e **disattiva**; l'eliminazione è permessa solo per unità mai usate, altrimenti si disattiva e resta nello storico, così ordini e documenti passati non si rompono. UX proposta: dialogo "Gestione U.M." richiamabile dalla pagina Prodotti (è lì che serve) e anche da Amministrazione.

**U.M. per prodotto**: nel dettaglio, sotto "Dati Danea → U.M. originale: kg (sola lettura)", le U.M. di vendita con per ognuna attiva/non attiva, visibile ai clienti, predefinita, conversione verso la U.M. Danea. Applicabile anche a più prodotti selezionati insieme.

**Conversione facoltativa e sempre stimata**: 1 cs ≈ 15 kg. Se non la indichi, l'unità esiste comunque. La conversione è etichettata "stimata" e non diventa mai la quantità definitiva: il peso realmente preparato (14,4 o 15,8 kg) resterà un dato distinto della fase di preparazione.

**Prezzi**: dal listino del cliente (Danea invia 1–9), non da un prezzo globale. Arance a 1,50/kg con cassa ≈15 kg mostrano "circa 22,50 €/cassa" sempre marcato come stima. Di conseguenza il totale ordine, quando contiene prodotti a peso variabile, sarà mostrato come stimato; il definitivo arriverà dal documento generato in Danea. Questa regola entra ora nel modello, senza costruire il motore ordini.

**Preferenza U.M. del cliente**: memorizzata per cliente+prodotto, non altera la configurazione generale; quando Rossi ritrova ARANCE vede "cs".

## 7. Inventario / Ordina: solo predisposizione

Nessuna tabella di magazzino, nessun movimento, nessuna giacenza inventata adesso. Predispongo soltanto: identità prodotto per archivio, U.M. con conversioni stimate, distinzione fra quantità ordinata e quantità effettiva, e il posto dove un domani entrerà la giacenza Danea. Il progetto della catena Danea → giacenze / Trevi Fruit → carichi e inventario / Ordina lo affronteremo come passaggio separato.

## 8. Dettagli tecnici

- Migrazione 1 — archivi: `danea_archives` (company_id, name, note, is_default, status); `danea_stations.archive_id`, `products.archive_id`, `danea_sync_runs.archive_id`, `danea_price_lists.archive_id` (backfill sull'archivio predefinito creato nella stessa migrazione); indici unici sostituiti con (company_id, archive_id, danea_internal_id) e (company_id, archive_id, code); GRANT + RLS per amministratori/membri dell'azienda tramite le funzioni esistenti.
- `danea-import.server.ts`: risoluzione archivio dalla postazione (o scelto dall'amministratore nell'importazione manuale); tutte le letture/upsert/riconciliazioni FULL e INCREMENTAL filtrate per `archive_id`. Parser invariato, più due campi nuovi (`size_um`, `weight_um`). **Nessun campo di giacenza**: `stock_quantity`/`stock_received_at` non vengono introdotti in questa fase.
- Migrazione 2 — U.M.: `units_of_measure` (company_id, code, description, is_active, is_system); `product_sale_units` (product_id, unit_id, is_active, visible_to_customer, is_default, `conversion_factor` facoltativo e **sempre trattato come stima**, senza campo tipo-conversione); `customer_unit_preferences` (buyer_company_id, product_id, unit_id); unico `is_default` per prodotto tramite indice parziale; nessuna cancellazione a cascata delle unità usate. Le conversioni realmente fisse (1 cartone = 12 pezzi) verranno valutate con carico merci/inventario.
- Migrazione 3 — preferenze griglia: `user_grid_preferences` (user_id, grid_key, device_class, columns jsonb, sort jsonb), RLS `user_id = auth.uid()`.
- Migrazione 4 — immagini Trevi Fruit: bucket privato `product-images` + `products.tf_image_path`, separato da `image_file_name`/`image_folder` di Danea.
- Griglia: `@tanstack/react-table` per colonne/ordinamento/selezione, ridimensionamento e riordino nativi della libreria; virtualizzazione con `@tanstack/react-virtual` attivata solo oltre ~300 righe; caricamento paginato dal server oltre ~2000 prodotti. Stampa via CSS `@page` dedicata, senza librerie.

## 9. Test e sicurezza della migrazione

Verifiche previste: i 4 prodotti esistenti restano visibili e assegnati all'archivio principale; Pc Ufficio Andrea e pc casa andrea invariate (nome, utente, indirizzo, password) e funzionanti; invio completo dall'archivio 1 non depubblica l'archivio 2; incrementale limitato al proprio archivio; due archivi con lo stesso codice convivono; colonne mostrate/nascoste/spostate/allargate e ordinamento ritrovati al rientro, separatamente su desktop e telefono; ripristino predefiniti; stampa ed esportazione coerenti con le colonne visibili; anagrafica U.M. con unità usata non eliminabile ma disattivabile; conversione stimata su più prodotti selezionati; nessuna immagine mostrata quando esiste solo il riferimento Danea.

## 10. Ordine di lavoro proposto

1. Archivi Danea + import per archivio (base indispensabile).
2. Nuova griglia compatta con colonne, preferenze, selezione, stampa, esportazione.
3. Anagrafica U.M. e U.M. di vendita per prodotto, con conversioni stimate.
4. Immagini Trevi Fruit.

Dimmi se approvi tutto o se preferisci partire da un punto diverso.
