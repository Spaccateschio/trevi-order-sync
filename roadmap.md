# Roadmap

## Fatto
- [x] Prodotto ↔ Fornitori: `product_supplier_links`, coda riconciliazione Danea, funzioni protette, sezione Fornitori nella scheda prodotto (nessuna regola automatica di priorità tra costo Danea e costo manuale)
- [x] Vista inversa Fornitore → Prodotti forniti: tab nel dettaglio fornitore, ricerca/filtri, modifica condizioni, attiva/disattiva, preferito, associazione multipla, apertura scheda prodotto (unica fonte `product_supplier_links`, scritture solo via RPC esistenti)
- [x] Mockup Inventario solo frontend: impostazioni zone una tantum, vista operativa e conteggio rapido responsive con dati fittizi e stato locale

## Prossimi passi
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
