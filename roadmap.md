# Roadmap

## Fatto
- [x] Prodotto ↔ Fornitori: `product_supplier_links`, coda riconciliazione Danea, funzioni protette, sezione Fornitori nella scheda prodotto (nessuna regola automatica di priorità tra costo Danea e costo manuale)
- [x] Vista inversa Fornitore → Prodotti forniti: tab nel dettaglio fornitore, ricerca/filtri, modifica condizioni, attiva/disattiva, preferito, associazione multipla, apertura scheda prodotto (unica fonte `product_supplier_links`, scritture solo via RPC esistenti)

## Prossimi passi
- [ ] Test reale con 2-3 fornitori e prodotti in combinazioni diverse
- [x] Formula del fabbisogno approvata: `max(0, necessario + scorta minima − disponibile)`, multiplo applicato solo dopo
- [x] FASE A: parametri magazzino del prodotto (`product_stock_settings`: scorta minima, multiplo di riordino, U.M. di riferimento, giorni di copertura) — solo valori manuali
- [x] FASE B: Inventario (zone configurabili + zona predefinita automatica, sessioni generali o per zona, conteggio per prodotto+zona, chiusura immutabile, rettifiche append-only, giacenza = ultimo conteggio valido + rettifiche)
- [x] FASE A/B: test superati (mai contato, contato a zero, due zone, sessione parziale, chiusura immutabile, rettifiche + e −, giacenza complessiva, parzialmente contato, scorta minima, multiplo) senza dati di test residui
- [ ] Lista Spesa e ripartizione quantità tra fornitori (dopo l'Inventario)
- [ ] Notifiche: badge, avvisi contestuali, notifiche vere (per ultime)
- [ ] Futuro (non ora): motore di previsione del fabbisogno e suggerimento acquisti con spiegazione del calcolo; FASE A/B devono solo non bloccarlo
- [ ] FASE C — Lista della Spesa + assegnazione fornitori: riga manuale e da Fabbisogno, suggerito vs deciso con snapshot, ripartizione senza redistribuzione automatica, residuo e stati, avviso (non blocco) sotto minimo fornitore con accettazione registrata, nessuna riga doppia, nessun arrotondamento automatico alle confezioni del fornitore (proposta da confermare), conferma bloccata se un'assegnazione non è traducibile nell'U.M. d'acquisto
