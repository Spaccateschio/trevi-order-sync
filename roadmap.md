# Roadmap

## Fatto
- [x] Prodotto ↔ Fornitori: `product_supplier_links`, coda riconciliazione Danea, funzioni protette, sezione Fornitori nella scheda prodotto (nessuna regola automatica di priorità tra costo Danea e costo manuale)
- [x] Vista inversa Fornitore → Prodotti forniti: tab nel dettaglio fornitore, ricerca/filtri, modifica condizioni, attiva/disattiva, preferito, associazione multipla, apertura scheda prodotto (unica fonte `product_supplier_links`, scritture solo via RPC esistenti)
- [x] Mockup Inventario solo frontend: impostazioni zone una tantum, vista operativa e conteggio rapido responsive con dati fittizi e stato locale

## Prossimi passi
- [x] Controllo andamento prezzi: registro append-only `supplier_price_observations` + stato corrente `supplier_price_series` (chiave azienda monitorante + fornitore + referenza, product_id solo sulla serie), scritture solo via `record_price_observation` agganciata agli eventi sorgente (import Danea, modifica listino, cambio listino assegnato, costo manuale, carico confermato) e mai alla lettura del catalogo; `equal` senza tolleranza; backfill solo prima osservazione per serie reale; UI icona € in Catalogo e Inventario — verificato in app (catalogo e inventario, propagazione ai preferiti, nessun duplicato a prezzo ripetuto)
- [ ] Riorganizzare la navigazione in Panoramica → Acquisti/Vendite/B2B/Impostazioni, aggiungere selettore azienda e preferenze persistenti per utente e azienda su visibilità e ordine di menu e dashboard; migrazione approvata con regole basate sull'appartenenza esistente, includere i test incrociati menu/dashboard, persistenza, cambio azienda, ripristino e divieto Danea ai non amministratori
- [x] Mockup KDS Inventario solo frontend: tabellone generale fisso indipendente dai filtri, avanzamenti locali, navigazione visuale touch e completamento simulato
- [x] Compattare il mockup KDS su desktop e smartphone e mostrare foto prodotto esclusivamente dimostrative, senza nuova logica immagini
- [ ] Test reale con 2-3 fornitori e prodotti in combinazioni diverse
- [x] Formula del fabbisogno approvata: `max(0, necessario + scorta minima − disponibile)`, multiplo applicato solo dopo
- [x] FASE A: parametri magazzino del prodotto (`product_stock_settings`: scorta minima, multiplo di riordino, U.M. di riferimento, giorni di copertura) — solo valori manuali
- [x] FASE B: Inventario (zone configurabili + zona predefinita automatica, sessioni generali o per zona, conteggio per prodotto+zona, chiusura immutabile, rettifiche append-only, giacenza = ultimo conteggio valido + rettifiche)
- [x] FASE A/B: test superati (mai contato, contato a zero, due zone, sessione parziale, chiusura immutabile, rettifiche + e −, giacenza complessiva, parzialmente contato, scorta minima, multiplo) senza dati di test residui
- [ ] Notifiche: badge, avvisi contestuali, notifiche vere (per ultime)
- [ ] Futuro (non ora): motore di previsione del fabbisogno e suggerimento acquisti con spiegazione del calcolo; FASE A/B devono solo non bloccarlo
- [x] FASE C — Lista della Spesa + assegnazione fornitori: riga manuale e da Fabbisogno, suggerito vs deciso con snapshot, ripartizione senza redistribuzione automatica, residuo e stati, avviso (non blocco) sotto minimo fornitore con accettazione registrata, nessuna riga doppia, nessun arrotondamento automatico alle confezioni del fornitore (proposta da confermare), conferma bloccata se un'assegnazione non è traducibile nell'U.M. d'acquisto
- [ ] Test reale della Lista della Spesa con 2-3 fornitori e confezioni differenti
- [x] FASE D (piano): ordine fornitore con destinazione di ricezione, dichiarazione di consegna, confronto ordinato/consegnato, contestazioni per riga, carico merce come unico evento che aumenta la giacenza, lotti/provenienza interni + lotto produttore opzionale, registro movimenti append-only compatibile con Inventario
- [ ] Rinviato alla fase Vendite: finestra di 30 minuti dopo la conferma di scarico del trasportatore (conferma o contestazione del cliente, conformità per decorrenza, collegamento al pagamento)
- [x] FASE D — tre modalità fornitore (registrato B2B, link esterno tokenizzato senza account, completamente esterno compilato dall'operatore) con unico modello dati; catena ordinato → dichiarato → verificato → caricato; solo il carico verificato crea lotto e movimento; pagina pubblica del link eventualmente successiva
- [x] FASE D — riconciliazione conteggio fisico ↔ lotti: differenza = giacenza fisica − somma disponibilità teoriche dei lotti, non attribuita e visibile come anomalia; nessuna assegnazione automatica (no FIFO, no fornitore inventato); schermata di riconciliazione eventualmente successiva
- [x] FASE D — implementata e verificata (19 test superati, dati di prova annullati): ordini fornitore, consegne dichiarate, confronto, contestazioni, carico merce, lotti, movimenti append-only, riconciliazione visibile + 19 test
- [ ] FASE D — pagina pubblica del link fornitore: prova reale su smartphone con un fornitore non registrato
- [x] Inventario reale: UI KDS collegata alla logica esistente (snapshot sessione, preferiti aziendali condivisi, apertura/chiusura solo amministratore, conteggio agli operatori, un solo inventario generale con avanzamento per zona) — verificato con 15+ test e prova su desktop e smartphone
- [ ] Modello prodotto commerciale ↔ referenze fornitore: separare prodotto venduto al cliente, referenze d'acquisto (anche più dello stesso fornitore), priorità di approvvigionamento ordinabile e facoltativa, disponibilità commerciale indipendente dai fornitori; piano tecnico prima di qualsiasi migrazione
- [ ] Disponibilità commerciale del prodotto (disponibile / su ordinazione / temporaneamente non disponibile) manuale e indipendente da giacenza e fornitori; semantica di ordinabilità fissata ora, applicata dal futuro modulo ordini clienti
- [ ] Priorità di approvvigionamento `sourcing_priority` ripetibile e facoltativa; migrazione del vecchio `is_preferred` a priorità 1 senza sincronizzazione automatica; verificare tutti i punti di lettura di `is_preferred` prima di rimuoverlo

- [ ] U.M. e prezzi: distinguere U.M. base prodotto, U.M. acquisto referenza fornitore, U.M. ordinabili dal cliente, U.M. di riferimento del prezzo, conversioni indicative e quantità/peso effettivo della preparazione. Il prezzo resta riferito a una sola U.M. (es. €/kg); le conversioni non determinano il totale definitivo. Il futuro modulo ordini/preparazione dovrà distinguere quantità richiesta → preparata/pesata → fatturabile → importo definitivo (totale solo come stima prima della preparazione).
- [ ] Vincolo documentato: tutti i listini di un prodotto sono interpretati rispetto alla stessa U.M. prezzo (products.price_unit_id); product_prices non modificato. Conversione prodotto/U.M. esplicitamente esatta o indicativa, mai dedotta dall'U.M.
- [x] Più U.M. d'acquisto per la stessa referenza fornitore (KG · CASSA · SACCO), U.M. predefinita facoltativa (purchase_unit_id può restare NULL), conversioni opzionali e mai obbligatorie
- [x] Nessuna falsa equivalenza fabbisogno ↔ acquisto: senza conversione certa non calcolare equivalente, copertura, residuo o eccedenza; fabbisogno e decisione d'acquisto restano due dati separati
- [x] Acquisti → Prodotti come vista operativa dello stesso catalogo (nessuna seconda anagrafica): griglia riusata con colonne d'approvvigionamento e scheda prodotto unica a tab Prodotto | Vendita | Acquisto | Inventario, con tab iniziale dipendente dal contesto (Vendite → Vendita, Acquisti → Acquisto)
- [ ] Colonne aggregate della griglia prodotti (U.M. acquistabili, priorità, giacenza, fabbisogno): intervento successivo dedicato
- [ ] Inventario come griglia configurabile (stesse preferenze user_grid_preferences): stati Mai contato/Da controllare/Confermato/Da ricontare, riconta append-only con storico, segnalazione Non conforme senza impatto sulla giacenza, Da proporre per acquisto, preferito dalla scheda, barra filtri principale + filtri avanzati, colonne acquisto/fabbisogno in sola lettura
- [ ] Non conforme storicizzato nelle inventory_count_entries append-only (quantità segnalata facoltativa, coerente con U.M., non superiore alla quantità fisica, nessun impatto sulla giacenza) e Da proporre per acquisto come segnalazione persistente del prodotto leggibile dalla Lista della Spesa senza creare righe o ordini automatici
- [ ] Proposte d'acquisto: una sola proposta aperta per prodotto/azienda con storico delle segnalazioni successive (prima e successive date/autori e note), risoluzione automatica solo alla conferma della Lista della Spesa, risoluzione manuale con motivazione, nuova proposta dopo una risolta
- [x] Inventario: workspace unico prima/dopo il conteggio; stella riferita al prodotto controllato e non alla preferenza fornitore; adozione catalogo senza doppioni; verificati desktop/smartphone e separazione tra preferito prodotto e priorità fornitore; test PATATE BIANCHE multi-fornitore rinviato perché nei dati attuali ha una sola referenza

- [ ] Inventario: definire popolazione unica "prodotti gestiti" usata da Conteggio, Fabbisogno e Lista della Spesa (verifica adozione catalogo prima di modificare le query)
- [ ] Inventario: prezzo in sola lettura + link "Apri prodotto → Acquisto"; chiarire quale U.M. usare per la giacenza

## Rifiniture future (flusso Acquisti, da non toccare ora)
- [ ] Link fornitore: la sola riapertura dopo l'invio crea automaticamente una seconda consegna in bozza per il residuo; valutare creazione solo su azione esplicita
- [ ] Contestazione consegna: la finestra "Risolvi" propone "Rettifica la quantità" come default; valutare "Accetta come dichiarato" o nessun default
- [ ] Lista della Spesa: riconfermare una lista già confermata non cambia nulla ma scrive comunque una voce "shopping_list.confirm" nel registro attività

## Inventario — Passo 2 (in attesa di via)
- [ ] Schede ultimo inventario: stato bloccato con sfondo ocra e tutti i comandi operativi disabilitati; dopo “Sblocca quantità” riattivare solo i comandi compatibili con lo storico chiuso
  - [ ] Prima dell’implementazione verificare funzione e dati della rettifica esistente, compatibilità dei pulsanti quantità e portata globale/singola dello sblocco
- [ ] Storico conteggi della sessione (tutte le conferme e correzioni, sola lettura)
- [ ] Dopo la conferma: finestra "Conteggio completato" → Vai al Fabbisogno / Resta nel Conteggio (nessuna aggiunta automatica alla Lista)

## Inventario come sessione persistente (analisi, in attesa del via)
- [x] "Conferma inventario" al posto di "Conferma visibili invariati"; popup "Inventario incompleto" con 2 azioni (Riprendi e inserisci / Conferma inventario e vai alla Lista della Spesa); vuoti restano non contati
- [x] Fabbisogno facoltativo (aiuto), non obbligatorio per arrivare alla Lista della Spesa

## Lista della Spesa (piano a passi)
- [x] Passo 1: barra operativa, filtri, ordinamento, foto/categoria/B2B, Aggiungi prodotti multiplo, riepilogo
- [ ] Passo 2: prezzo e totale (in attesa del via)
- [ ] Passo 3: stampe Lista e ordine (in attesa del via)
- [ ] Passo 4: modifica ordini in bozza (richiede modifiche DB, in attesa del via)
- [ ] Passo 5: integrazione ordine inviato + filtri Ordini fornitori (in attesa del via)
- [ ] Da decidere: prodotto in lista senza quantità decisa (oggi il DB richiede > 0)
- [x] Inventario → Lista della Spesa: prodotti da valutare + "Termina valutazione" persistente
- [x] Semaforo Inventario (verde/giallo/rosso)
- [x] Correggi conteggio con semaforo rosso, anche da “Visualizza inventario” (rettifica con riferimento al conteggio) + campi bloccati con rosso
- [ ] Analisi separata dei 113 avvisi di sicurezza preesistenti (dopo test del ciclo)

- [x] Ripristino barra fissa ricerca/filtri (soglia = altezza reale riquadro sticky)
- [ ] Ridurre spazio parte superiore Inventario (da rivedere insieme; «Sblocca quantità» resta dov'è)

- [ ] Lista della Spesa Step 1: card stile Inventario (in attesa decisione su quantità acquisto in U.M. fornitore)
- [x] Step 2 modello dati Lista/Ordini/Consegne (quantità + U.M. d'acquisto + fornitore)
- [ ] Step 2 aperto: righe senza equivalente non entrano nel Carico Merce (open_goods_receipt) — serve decisione dell'utente
- [ ] Step 2 aperto: stato ordine con equivalente valutato ancora in kg (2 cs su 3 con 30 pz caricati = consegnato) — da decidere
- [x] Lista della Spesa: apertura immediata su inventario (anteprima senza creare liste, creazione alla prima azione)
- [ ] Lista della Spesa: Step 1 card (in attesa del via)
- [ ] Lista della Spesa: analisi approvata prima dell’unificazione in una sola area prodotti e della gestione U.M. B2B/manuali; nessuna implementazione finché l’utente non dà il via

- [ ] Lista: Conferma atomica anche su «Da valutare» — fatto, prove dal vivo da fare
- [ ] Lista: U.M. fornitore solo nelle ripartizioni, «Altra U.M.» per non B2B (dopo A)

## Lista della Spesa — Preferiti e ordine Trevi (30/09)
- [x] Stella Lista = stesso Preferito dell'Inventario (lettura reale su tutte le card)
- [x] Stella nella finestra «Aggiungi prodotti» (il preferito alimenta i prossimi Inventari, non la Lista)
- [x] Verificare PATATE BN IT preferito sì/no nel database
- [x] Verificare percorso BASILICO A MAZZI → ripartizione Trevi → conferma Lista → ordine
