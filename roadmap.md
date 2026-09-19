# Roadmap

## Fatto
- [x] Prodotto ↔ Fornitori: `product_supplier_links`, coda riconciliazione Danea, funzioni protette, sezione Fornitori nella scheda prodotto (nessuna regola automatica di priorità tra costo Danea e costo manuale)
- [x] Vista inversa Fornitore → Prodotti forniti: tab nel dettaglio fornitore, ricerca/filtri, modifica condizioni, attiva/disattiva, preferito, associazione multipla, apertura scheda prodotto (unica fonte `product_supplier_links`, scritture solo via RPC esistenti)

## Prossimi passi
- [ ] Test reale con 2-3 fornitori e prodotti in combinazioni diverse
- [ ] Definire e approvare la formula del fabbisogno (disponibile, scorta minima, necessario, da acquistare, multiplo di riordino) — analisi in `.lovable/plan.md`, nessuna implementazione
- [ ] FASE A: parametri magazzino del prodotto (scorta minima, multiplo di riordino, U.M. di riferimento)
- [ ] FASE B: Inventario (sessione → conteggio → differenza → chiusura non modificabile → rettifiche tracciate)
- [ ] Lista Spesa e ripartizione quantità tra fornitori (dopo l'Inventario)
- [ ] Notifiche: badge, avvisi contestuali, notifiche vere (per ultime)
