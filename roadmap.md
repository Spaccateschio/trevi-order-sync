# Roadmap

## 22/10 — Lista: nuovi acquisti dopo invio (solo anteprima)
- [ ] Nascondere intestazione e freccia su cellulare e computer; piano in preparazione.
- [ ] Separare quantità nuove da ordini inviati, residui e bozze conservati; verificare fattibilità prima dell’intervento e attendere approvazione delle modifiche strutturali. Nessuna migrazione, scrittura operativa o pubblicazione.

## 19/10 — Progettazione esecutiva collaboratori 2A
- [x] Preparare SQL integrale di protezioni, gestione e storico e inventario live di funzioni/policy che scrivono appartenenze e ruoli. Proposta completa: 1 writer diretto, 1 indiretto, 6 policy (4 di scrittura), verifica tecnica locale isolata; nessuna migrazione, assegnazione o scrittura operativa.
- [ ] Applicazione 2A bloccata: attende approvazione SQL completo ed eccezione SECURITY INVOKER per i trigger antifalsificazione. Assegnazione titolare, collaudi reali e pubblicazione richiedono autorizzazioni separate.
- Requisiti futuri: Magazziniere avvia/conteggia ma non chiude/riapre inventario generale; Compratore crea/modifica/conferma AD ma non annulla; Preparatore invariato.

## 18/10 — Ruoli aziendali e reparti
- [x] Fase 1 mockup: Azienda → Collaboratori (anteprima): invito, 6 profili combinabili, permessi per pagina/azione, prezzi, fornitori, eccezioni per fornitore, reparti, liste per reparto con cambio rapido e ordine consolidato. Solo dati inventati.
- [ ] Fase 2 (database e permessi reali): attende approvazione mockup e verifica dipendenze con Inventario, Lista, Ordini.


## 18/10 — Preparazione con dati reali
- [x] Fase 1 approvata: Preparazione reale e stampa; mantenere mockup e test originali.
- [x] Sviluppo Fase 1: Preparazione separata, conferme, storico, preparatore, versioni e firme sorgente, stampa singola/multipla; mockup e test originali conservati. Migrazioni 0074/0075 applicate; grant client sola lettura verificati. 22 test nuovi + 6 mockup + 17 Danea superati; build OK. Nessuna scrittura operativa: preparazioni/righe/eventi tutti a zero.
- [ ] Collaudo completo Fase 1 bloccato: 3 EMME solo acquisti, /operativo torna alla Panoramica e non esistono ordini ricevuti di prova. Lettura RPC con vero utente 3 EMME riuscita e membership estranea respinta; salvataggio/rilettura, concorrenza reale, dettaglio e stampa visiva richiedono un'azienda venditrice di prova autorizzata. Non modificare la configurazione aziendale senza nuovo via.
- File Fase 1: nuovi preparation-panel.tsx (737), preparation-print.ts (44), preparation.ts (133), preparation.functions.ts (36), preparation.test.ts (127), preparation.functions.test.ts (71); operativo.tsx (52), preparation-guide.ts (131), AGENTS.md, src/lib/AGENTS.md, roadmap.md. Migrazioni generate 0074 (103) e 0075 (3), tipi e metadati generati; piano aggiornato al punto di controllo. Nessun file di esportazione Danea modificato.
- [ ] Fase 2 bloccata: attende verifica della Fase 1 e nuova autorizzazione esplicita. Non modificare export Danea, non chiamare endpoint reali, non alterare scarichi/storici/numerazione. Voce AI esclusa, nessuna pubblicazione.

## 18/10 — Completare Preparazione
- [x] Analisi e piano del solo mockup Preparazione approvati.
- [x] Mockup /operativo: ordini inventati, filtri, preparatore, quantità e pesi separati, conferma/correzione righe, mancanti, riepilogo, pronto, dialogo simulato e guida. Sei test superati; build OK; percorso completo verificato in anteprima autenticata, immagini e layout 1280/390 px. Nessun collegamento ai dati operativi, nessuna pubblicazione.
- File: operativo.tsx (47 righe finali); nuovi preparation-demo-data.ts (120), preparation-demo-data.test.ts (64), preparation-mockup.tsx (542), preparation-guide.ts (74); AGENTS.md (+1 regola); roadmap.md (+6 righe rispetto all'inizio del lavoro).

## 17/10 — Rimanda ordine sulle card
- [x] Verifica read-only: mancava il collegamento al singolo ordine B2B in sola consultazione; link consegna inadatti. RLS venditore presente; apertura card operativa registra il visto. 00004/00005 B2B già visti e scaricati, nessuna modifica; adattamento approvato 17/10 06:41 UTC.
- [x] Pulsante sulle card inviate e riuso finestra non B2B; B2B nella pagina Ordini clienti, consultazione specifica separata dalla navigazione aziendale, ingresso auth con ordineB2b validato e ritorno alla destinazione; controllo is_order_supplier prima delle letture RLS, cache per utente, messaggio neutro assente/non autorizzato. 24 test pass; compilazione automatica OK. Anteprima autenticata 3 EMME: 3 pulsanti, copia link, sette canali, acquirente escluso, ordine inesistente, ingresso senza sessione conserva ID; 390 px senza overflow o errori. Zero scritture operative tentate; impronte ordine/righe/scarichi 00003/00004/00005 identiche prima/dopo. Nessuna pubblicazione, comunicazione o blocco SQL.
- [ ] Accesso riuscito e ritorno dopo login password con vero utente fornitore: richiede account/ordini di prova autorizzati, mai Trevi. Conferma effettiva reinvio e storico non B2B: collaudo manuale di Andrea su nuovi dati 3 EMME, nessuna azione dell'assistente.

## Condivisione ordini — anteprima, rilascio coordinato non autorizzato
- [x] Correzioni autorizzate 17/10: 0071 aggiunge solo copia_testo al vincolo; messaggio distinto per Lista chiusa dopo rifiuto RPC e letture RLS, nessuna modifica alle funzioni SQL. 17 test pertinenti superati; anteprima autenticata: selezione canale/chiusura senza conferma, nessun errore; app pubblicata /auth HTTP 200, flussi pubblicati non collaudati con scritture. Tutti e cinque gli ordini invariati per impronta completa prima/dopo. Nessun invio, link o ordine creato dall'assistente.
- [x] Analisi sola lettura e elenco incoerenze: ORD-2026-00003/00004/00005 di 3 EMME hanno status inviato e send_status da_inviare. Nessuna correzione operativa.
- [x] Migrazione additiva 0070: confirm_non_b2b_order_share, undo_non_b2b_order_send_confirmation, order_share_history; ruoli nel DB, audit, idempotenza sotto lock e protezione degli eventi audit da inserimenti client. manage_purchase_order invariata; nessun backfill.
- [x] Finestra unica Lista/Ordini con sette canali, destinatari, note, link solo espliciti, conferma manuale, reinvio e storico; avviso U.M. diversa e stato unico con incoerenza persistita visibile. 280 test pass; build OK. Browser autenticato: ordine 00003, anteprima/reinvio, selezione sette canali e chiusura senza scritture, link ancora zero e audit invariato.
- [ ] Collaudo manuale A/B: Andrea su nuovi dati di prova 3 EMME, primo invio/reinvio/rettifica/storico e chiusura Lista ancora da verificare prima di aprire l'app ad altri clienti. Attendere il suo via, nessuna azione al suo posto.
- [ ] Permessi admin/operatore: da verificare prima di aprire l'app ad altri clienti; servono sessioni reali di entrambi i ruoli su 3 EMME. Lettura anteprima autenticata non prova autorizzazione alle scritture.
- [ ] Isolamento aziende e autorizzazioni storico: da verificare prima di aprire l'app ad altri clienti; servono due utenti reali in aziende di prova e ordini di prova, mai Trevi o altre aziende reali.
- [ ] Esclusione B2B: da verificare prima di aprire l'app ad altri clienti; controlli DB/candidati letti, ma rifiuto RPC con JWT reale su fixture B2B di prova non eseguito.
- [ ] Idempotenza UUID e concorrenza: da verificare prima di aprire l'app ad altri clienti; client di test con JWT reale e stessa/differenti chiavi, chiamate simultanee su fixture 3 EMME autorizzate. Non usare client privilegiato. Test con JWT e rollback resta non disponibile negli strumenti attuali.
- [ ] Rilascio coordinato e blocco legacy: proposta .lovable/deferred/block_legacy_non_b2b_send.sql fuori dalle migrazioni automatiche, hash della funzione corrente e diff limitato al rifiuto non B2B. Blocco: autorizzazione rilascio e collaudo SQL. Nessuna pubblicazione, invio o ripristino reale.

## Lista della Spesa — card uniformi con Conferma
- [x] Controlli quantità condivisi in Lista, da valutare e non ancora inserite: Conferma/Invio espliciti, matita, tasti rapidi senza autoconferma e avviso prima di cambio lista/generazione. Funzioni e database invariati. 269 test pass; build automatica OK. Browser con sessione reale e scritture bloccate: inserimento/uscita senza scrittura, errore conserva quantità, generazione bloccata con modifica pendente; 1280/390 px senza overflow. Nessuna pubblicazione o scrittura operativa.
- [ ] Conferma riuscita e creazione delle tre modalità da verificare integralmente su ambiente/dati di prova autorizzati: non eseguite sul database operativo condiviso.

## Inventario — barra fissa di conferma
- [x] Spostare l'unico comando «Conferma inventario» in basso alla finestra, sopra la navigazione mobile; conservare bozza, comportamento e permessi. Verificati 1280/390 px, scorrimento, ultime card e finestra Storico sopra la barra; build automatica OK. Typecheck separato non disponibile nei segnali automatici. Solo anteprima, nessuna pubblicazione o modifica dati.
- [x] Aspetto della barra: banda blu notte (token sidebar) con scritta chiara centrata a tutta larghezza, «Bozza salvata» sopra in piccolo; verificato 1280/390 px, barra fissa dopo lo scorrimento e ultima card libera; build automatica OK, non pubblicata.
- [x] Stessa barra fissa per la Lista della Spesa: «Conferma lista» con il riepilogo dei prodotti sopra, comando in fondo all'elenco sostituito dalla barra, pulsante in alto lasciato com'è; verificati 1280/390 px con scorrimento fino in fondo e nessuna sovrapposizione alla navigazione; build OK, non pubblicata.

## Inventario — filtri, contatori e stampa
- [x] Parte 1: regola unica delle card (Preferiti = stella prodotto o card; stato, ricerca, zona, categoria, sottocategoria, fornitore combinati); riepilogo filtrato card/prodotti; «Trovato in» per ricerche escluse; Stampa vista attuale Rapida/Dettagliata + Stampa tutto l'inventario; avviso conferma con filtri. Solo anteprima.
- [ ] Parte 2: U.M. nella card Inventario — solo analisi consegnata, in attesa di decisioni.

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
- [x] Compattare la parte superiore Inventario: stato nel riepilogo generale, stampa accanto ai filtri, barra principale e menu stati, descrizioni duplicate rimosse (in attesa di approvazione; «Sblocca quantità» resta dov'è)

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

- [ ] Ordini da inviare: riquadro, dettaglio, modifica consegna/note, preferenze consegna, precompilazione chiusura Lista (nessun invio reale)

- [x] Ciclo concluso: Inventario e Lista puliti, Storico inventari per sessione, pagina Ricezione ordini (verifica a ciclo verde/arancione reale ancora da fare)

- [ ] Inventario: definire sblocco card dopo invio ordini e aggiornamento con Carico merce (in attesa conferma utente)

- [ ] Inventario modificabile + Lista «Da controllare» + banner ordini inviati (piano in attesa di approvazione)
- [ ] Da decidere: Lista divisa per reparti/ruoli (es. ristorante: vino, carne, pesce)
- [ ] Da decidere: U.M. libera in inventario con resto (casse + bottiglie) per chi ordina

## Ordini cliente – modifica completa (in corso)
- [x] Modifica righe/quantità prima del lucchetto (RPC con controllo concorrenza), storico modifiche
- [x] «Chiedi modifica» dopo lucchetto, accetta/rifiuta lato fornitore
- [x] Badge «Modificato» + righe prima/ora lato fornitore
- [x] Pulsante «Chiama il fornitore» (telefono ordini nei dati aziendali), tel:/Copia, «Nuovo ordine»
- [x] Annullamento fornitore dopo export Danea: promemoria + storico motivo
- [x] Prove a schermo complete
- [x] U.M. di magazzino passo 1: fondamenta database (nessun cambiamento visibile)
- [x] U.M. di magazzino passo 2: scheda prodotto (U.M. magazzino, confezioni, conversioni in stock_conversion_factor, filtro da completare)
- [ ] U.M. di magazzino passo 3: Inventario usa solo stock_unit_id — piano approvato, non implementare prima del passo 2
- [ ] Passo futuro: migrare scorta minima/multiplo/Fabbisogno alla U.M. di magazzino (decidere il significato dei numeri)
- [ ] U.M. di magazzino passi 2–5: scheda prodotto, carico merce, inventario, Lista (in attesa di via)

## U.M. di magazzino — Passo 3 (completato)
- [x] Inventario legge solo products.stock_unit_id (descrittore, nessuna logica matematica); danea_um solo informativa; vecchio selettore U.M. eliminato; conteggio salvato in U.M. magazzino con fattore 1; giacenza NULL ("—"/Da verificare) senza baseline valida, mai zero implicito; prodotti senza stock_unit_id visibili come "U.M. da impostare", non confermabili, bloccanti alla chiusura; storico mai convertito; allows_decimals non letto dall'Inventario

## Fase 3 — Memoria fornitori abituali (in attesa del via)
- [ ] Memoria dei fornitori abituali tra Liste successive
- [ ] Memoria delle U.M. preferite per fornitore
- [ ] Memoria dell'acquisto diretto abituale
- [ ] Rispetto della deselezione volontaria del fornitore anche dopo sblocco e riconferma
- [ ] Assegnazione automatica della quota quando si spunta manualmente un fornitore con U.M. diversa ma conversione valida
- [ ] Non copiare le quantità delle Liste precedenti

## Modello 2 (card = prodotto + collegamento fornitore) — Tappa A in preparazione
- [ ] Regola aggiuntiva 0038: add_product_to_open_inventory inserisce in inventory_session_products tutte e sole le card visibili da inventory_cards_for, ciascuna con il suo product_supplier_link_id (stessa regola dell'avvio sessione) + prova dedicata rollbackata; idempotente (aggiunge solo card mancanti, mai doppioni sessione+prodotto+ubicazione+link); card già presenti mai rimosse/aggiornate fino alla chiusura; dettagli in /mnt/documents/Integrazione_TappaA_aggiunta_prodotto.md

## Rinviato
- [ ] Controllo delle confezioni intere nel database — oggi il vincolo è verificato solo dal frontend (il DB controlla U.M. e conversioni): una chiamata diretta alla funzione DB potrebbe proporre 2,5 casse. Quando esisterà un'impostazione «Confezione intera obbligatoria» per prodotto o fornitore, valutare il controllo nel DB. Non blocca la pubblicazione attuale.

## 12/10 — Lista della Spesa semplice (anteprima, NON pubblicare)
- [x] ★ automatica fornitore unico (trigger + allineamento dopo verifica numeri)
- [x] Spunta visiva senza quantità; deselezione prima della quantità salvata
- [x] Priorità deselezione > manuale > B2B > memoria (se non contrasta ★) > ★ > unico
- [x] Contatori sempre visibili + contatori Preferiti
- [x] U.M. B2B pubblicate nelle card «Non in lista»
- [x] 42 prove + test/typecheck/build + schermate; resoconto

## 12/10 — Ultime correzioni autorizzate (solo anteprima)
- [x] Filtri smartphone: ricerca dedicata e due righe scorrevoli in shopping-list-panel.tsx; menu provati, pagina senza overflow.
- [x] Spunta e quota con scelta coerente: chooseListDestinations condivisa, memoria valida (anche più fornitori), poi stella, poi unico; «Come l'ultima volta» già prima della quantità; deselezioni e conflitti conservati.
- [x] Diagnosticata lentezza: richieste per card e riletture duplicate, presenti anche nel bundle pubblicato. Raggruppate letture quota diretta/prezzo/preferenze; cache React Query 60s per evitare riletture immediate. A 390 px prima 16,11/9,76s, dopo stabilizzazione 8,64/9,87s; richieste REST 170–175 → 107–114. A 1280 px prima 3,68/5,48s, dopo 4,88/3,10s. Rimangono RPC per prodotto: non promettere tempi fissi, dipendono dalla rete; prova durante aggiornamento codice esclusa dalle misure finali.
- [x] Test automatici, segnali typecheck/build e schermate 390/1280; resoconto unico. Non pubblicato, nessuna migrazione, nessuna scrittura sui dati operativi nelle verifiche.

## 12/10 — Lettura unica card Lista (solo anteprima, non pubblicare senza via)
- [x] Funzione di sola lettura `shopping_list_cards_bundle` (0047/0048) e card collegate
- [x] Confronto identico su 41 righe 3 EMME; richieste misurate prima/dopo
- [ ] Pubblicazione: in attesa del via dell'utente

## 12/10 — U.M. di acquisto per fornitore (solo anteprima)
- [x] Card parte nell'U.M. predefinita del fornitore unico/★ se quella attuale non è sua
- [x] Quantità già salvate incompatibili: avviso e correzione con conferma esplicita
- [x] «Genera ordini»: «U.M. di acquisto da correggere — X vende in …»
- [ ] Pubblicazione: in attesa del via dell'utente

## 12/10 — Matita e annullo conferma in «Genera ordini» (solo anteprima)
- [x] Lettura 0049 (sola lettura): stato conferma e dati della quota nell'anteprima
- [x] Matita: quantità + U.M. del fornitore, salvataggio atomico esistente, avviso cambio U.M. senza conversione
- [x] «Annulla conferma» persistente con la funzione esistente
- [x] Spiegazione avviso Basilico a mazzi in cs
- [ ] Pubblicazione: in attesa del via dell'utente

## U.M. di magazzino — da valutare, nessun cambio autorizzato
- [ ] 0251 UOVA CONF. (trevi srl): magazzino cs, Danea nr. Nessuno storico da preservare: cambio futuro da valutare. In attesa di autorizzazione.
- [ ] 0288 ALLORO (trevi srl): magazzino mz, Danea nr. Da valutare dopo il prossimo inventario completato; i conteggi storici in mz restano invariati; nessuna conversione non documentata. In attesa di autorizzazione.

## 13/10
- [x] Parte A Inventario: riepilogo «Vista attuale» (card da contare/contate/mancanti/%)
- [x] Parte B Prodotti: viste Acquisti/Vendite (in anteprima, non pubblicata)

## 13/10 — Pagina Prodotti per attività dell'azienda (solo anteprima)
- [x] Fase 1: dettaglio prodotto — Vendita solo se vende, Acquisto solo se acquista, Inventario sempre; «Stato» solo se vende; scheda non disponibile → Prodotto.
- [x] Fase 2: colonne/filtri/azioni per capacità azienda, poi ruolo; azioni vetrina/U.M. vendita solo vista Vendite; preferenze con colonne non ammesse ignorate.
- [x] Fase 3: rimando /vendite/prodotti ↔ /acquisti/prodotti senza cicli.
- [ ] Futuro: «Importa da Danea» oggi richiede `company_sells` (controllo server in danea.functions.ts, l'import nasce come catalogo di vendita/listini). Valutare l'import del catalogo Danea anche per aziende solo Acquisti (es. 3 EMME). Regola non modificata.
- [ ] B2B 3 EMME: verificare a schermo Acquisti → Catalogo fornitori → Trevi (nessuna modifica). Correzioni «Cliente associato»/articoli in attesa di autorizzazione.

## 14/10 — Inventario: aggiunte al conteggio, stelle, filtri (solo anteprima)
- [x] Una sola barra filtri; zone abituali in menu a tendina
- [x] Nell'Inventario solo la stella del prodotto (stella della card nascosta, dati invariati)
- [x] «Tutti»: card fuori sessione con «Aggiungi al conteggio»; avvio «Inventario completo» (amministratore)
- [x] Ricerca nei cataloghi fornitori: «Aggiungi al conteggio» (admin+operatore, inventario aperto) / «Aggiungi ai miei prodotti» (solo admin)
- [ ] RIMANDATO: segnalazione prodotto mancante all'amministratore (nome, quantità, nota/foto), senza creare prodotti né bloccare la chiusura. In attesa di autorizzazione.
- [ ] Pubblicazione: in attesa del via dell'utente


## 14/10 — Ripristino filtri fissi Inventario (solo anteprima)
- [x] Ripristinati gli stessi filtri insieme alla ricerca rapida durante lo scorrimento; verificati Inventario reale 3 EMME, menu Filtri e passaggio a Tutti, schermi 390/718/1280 px senza overflow. 21 test superati, build automatica OK. Nessun conteggio o dato operativo scritto, nessuna pubblicazione.

## 14/10 — Card Inventario più strette (solo anteprima)
- [x] Griglia a larghezza automatica: card strette (250 px) quando sotto il nome non c'è nulla da leggere, più larghe (320 px) quando almeno metà delle card in vista ha scritte; tutte sempre della stessa misura. «Zona abituale: nessuna» sostituita da «+ zona»; nome a tutta larghezza con comandi a destra, immagine e scritte sotto, badge di stato su riga propria. Verificato 390/848/1480 px: 3 card per riga a 848 px (257×315 tutte uguali), campo quantità, «Conferma» e +1 +3 +5 +10 interi. 198 test, typecheck pulito, build OK. Nessun dato toccato, nessuna pubblicazione.

## 14/10 — Parte alta compatta e Card / Righe (solo anteprima)
- [x] Parte alta compatta durante lo scorrimento, senza duplicare ricerca e filtri; selettore Card/Righe sempre raggiungibile.
- [x] Righe a due fasce a 390/607 px, una riga a 1280 px; stessi comandi e protezioni delle card.
- [x] Vista ricordata localmente per utente, azienda e dispositivo, fallback Card; bozze, U.M., ricerca e filtri conservati cambiando vista.
- [x] 31 test pertinenti e build automatica OK; verificati 390/607/1280 px, entrambe le viste prima/dopo scroll, nessun overflow o errore a schermo. Typecheck separato non disponibile nei segnali automatici. Nessuna pubblicazione. Durante la prova una bozza temporanea è stata salvata dall'autosalvataggio esistente e poi rimossa; nessun conteggio confermato.

- [x] 14/10 — Inventario: «Tutti» mostra anche gli articoli dei fornitori collegati (Mostra altri), ricerca su tutte le card, «Togli i filtri» quando la vista è vuota (solo anteprima)

- [x] 14/10 — «Genera ordini»: menu Luogo con indirizzi aziendali attivi + «Altro indirizzo…», precompilazione Lista → ultimo ordine → Preferenze → indirizzo principale di consegna; update_draft_order accetta address_id (solo anteprima)
- [ ] Futuro (non approvato): Consegna/Ritiro sull'ordine; campo pickup_address_id separato per indirizzi del fornitore; creazione e modifica bozze per entrambe le modalità

## Acquisto diretto come documento (AD-AAAA-NNNNN)


- [x] Quota acquisto diretto: salvataggio automatico con ripartizione del residuo ai fornitori e avviso di quantità superiore (eccedenza ammessa, riga «da verificare») — anteprima, non pubblicato
- [x] Acquisto diretto come ordine normale (Fase 1): spunta in testa, «Chi acquista», data e luogo nella finestra Genera ordini; un solo pulsante «Genera ordini selezionati» che conta fornitori + diretto; campo buyer_label nel documento AD — anteprima, non pubblicato
- [ ] Acquisto diretto Fase 2: stampa e condivisione del documento AD
- [ ] Acquisto diretto Fase 3: pagina con link per inserire peso netto/lordo, prezzo e dati di carico (non B2B)
- [ ] Acquisto diretto Fase 4: pagina di conferma ricezione con spunta dei prodotti ritirati/consegnati
- [x] Fase 3: carico merce da acquisto diretto confermato (quantità, U.M., peso, prezzi effettivi)
- [x] Fase 4: storico, consultazione e stampa dei documenti
- [ ] Foto dello scontrino: sviluppo successivo
- [x] Fasi 1 e 2 acquisto diretto: documento AD, bozza, conferma e annullamento (anteprima, non pubblicato)
- [x] 15/10 — «Prima di generare gli ordini»: elenchi «Prodotti (N)» aperti per fornitori e acquisti diretti, eccedenza solo con U.M. uguali, rilettura all'apertura; ARANCE: quota diretta non salvata (solo anteprima, in attesa di controllo)
- [x] 15/10 — Finestra «Prima di generare gli ordini» adattata a 390/768/1280 px; eccedenza = «Assegnato» con avviso (stato riga nel DB); regola permanente sulle prove in AGENTS.md (solo anteprima, in attesa di controllo)

- [ ] Acquisto diretto come ordine normale: incluso in «Genera ordini selezionati» (conteggio 3), stessa spunta dei fornitori, destinatario facoltativo (collaboratore / fornitore senza anagrafica) — in attesa di approvazione piano
- [ ] AD: stampa e condividi (come ordini non B2B)
- [ ] AD: pagina esterna da link per il collaboratore/fornitore non B2B: peso netto, lordo, prezzo, dati utili al carico
- [ ] AD: pagina conferma ricezione con spunta prodotti ritirati/consegnati → carico merce e inventario
- [x] Fase A Genera e invia (anteprima, non pubblicato): B2B inviati subito, non B2B condivisione, AD creato, riepilogo esiti con riprova

- [x] Scarico ordini B2B in Danea: sviluppo completato in anteprima (non pubblicato, nessuna postazione ordini creata). In attesa: prova su archivio Danea di test.

## Prezzi variabili fino allo scarico Danea (autorizzato, solo anteprima)
- [x] Fase 1: ultimo aggiornamento reale del listino + orario abituale e testo per azienda
- [x] Fase 2: messaggio prezzi al cliente (Catalogo fornitore, ordine prima dell'invio)
- [x] Fase 3: prezzo del listino corrente allo scarico, storico righe esportate, coerenza con blocco
- [x] Fase 4: pagina Danea con ultimo aggiornamento, avvisi, prezzi da verificare
- [ ] Resoconto, schermate e istruzioni prova Danea (non pubblicare)

## Danea — dopo i prezzi variabili
- [ ] Invio prodotti Danea tutto-o-niente (oggi prodotti e U.M. si salvano prima dei prezzi).
- [ ] Stampa dell'ordine con messaggio prezzi indicativi.

## Pagina fornitore esterno (link consegna) — 17/10
- [x] Mockup pagina /consegna/{token} approvati (desktop tabella + mobile righe compatte con spunta)
- [x] Pagina fornitore esterno rifatta: intestazione cliente/data/indirizzo/note, righe compatte con spunta obbligatoria, dettagli espandibili (prezzo, tara, lordo, netto, lotto, descrizione alternativa, note), banner registrazione → /auth; colonne DB aggiunte (migrazione 0072) — anteprima, da collaudare con link reale

## Guida interattiva — 17/10
- [x] Fase 1: ⓘ + guida Lista della Spesa (9 passaggi)
- [ ] Fase 2: memoria per utente, Mostra le novità, proposta automatica all'ingresso (attende autorizzazione)
