# Roadmap

## Fatto
- [x] Prodotto ↔ Fornitori: `product_supplier_links`, coda riconciliazione Danea, funzioni protette, sezione Fornitori nella scheda prodotto (nessuna regola automatica di priorità tra costo Danea e costo manuale)
- [x] Vista inversa Fornitore → Prodotti forniti: tab nel dettaglio fornitore, ricerca/filtri, modifica condizioni, attiva/disattiva, preferito, associazione multipla, apertura scheda prodotto (unica fonte `product_supplier_links`, scritture solo via RPC esistenti)
- [x] Mockup Inventario solo frontend: impostazioni zone una tantum, vista operativa e conteggio rapido responsive con dati fittizi e stato locale

## Prossimi passi
- [ ] Riorganizzare la navigazione in Panoramica → Acquisti/Vendite/B2B/Impostazioni e aggiungere preferenze persistenti per utente su visibilità e ordine di menu e dashboard; in attesa di approvazione della struttura dati dedicata
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
