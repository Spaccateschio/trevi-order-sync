# Roadmap

## Fatto
- [x] Prodotto ↔ Fornitori: `product_supplier_links`, coda riconciliazione Danea, funzioni protette, sezione Fornitori nella scheda prodotto (nessuna regola automatica di priorità tra costo Danea e costo manuale)
- [x] Vista inversa Fornitore → Prodotti forniti: tab nel dettaglio fornitore, ricerca/filtri, modifica condizioni, attiva/disattiva, preferito, associazione multipla, apertura scheda prodotto (unica fonte `product_supplier_links`, scritture solo via RPC esistenti)

## Prossimi passi
- [ ] Test reale con 2-3 fornitori e prodotti in combinazioni diverse
- [x] Formula del fabbisogno approvata: `max(0, necessario + scorta minima − disponibile)`, multiplo applicato solo dopo
- [ ] FASE A: parametri magazzino del prodotto (scorta minima, multiplo di riordino, U.M. di riferimento) — in corso
- [ ] FASE A/B: test richiesti (mai contato, contato a zero, due ubicazioni, sessione parziale, chiusura immutabile, rettifiche, giacenza complessiva, parzialmente contato, scorta minima, multiplo) senza lasciare dati di test
- [ ] FASE B: Inventario (ubicazioni configurabili per azienda, sessione generale o per ubicazione, conteggio → differenza → chiusura non modificabile → rettifiche tracciate)
- [ ] Lista Spesa e ripartizione quantità tra fornitori (dopo l'Inventario)
- [ ] Notifiche: badge, avvisi contestuali, notifiche vere (per ultime)
- [ ] Futuro (non ora): motore di previsione del fabbisogno e suggerimento acquisti con spiegazione del calcolo; FASE A/B devono solo non bloccarlo
