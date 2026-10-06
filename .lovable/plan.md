# Modifica ordine cliente completa + richieste di modifica + prove a schermo

## Cosa cambia per l'utente

**Lato cliente (es. 3 EMME), ordine NON bloccato**
- «Modifica» apre una finestra con: righe prodotto (quantità modificabile, ✕ per togliere), «+ Aggiungi prodotto» (solo dai prodotti pubblicati dal fornitore, con le loro U.M.), data, orario, luogo, note.
- Se togli tutti i prodotti: conferma «Togliendo tutti i prodotti l'ordine verrà annullato» → diventa Annullato (stesse regole del cestino).
- Se nel frattempo il fornitore ha aperto l'ordine, il salvataggio viene rifiutato dal database con il messaggio «L'ordine è stato appena bloccato dal fornitore» e la pagina si ricarica con il lucchetto.

**Lato cliente, ordine bloccato (lucchetto)**
- «Modifica» disattivato; compare «Chiedi modifica»: il cliente scrive una nota che arriva al fornitore (campanella + nell'ordine).
- Il cestino resta secondo le regole già in vigore (dopo il lucchetto: chiamare il fornitore).

**Lato fornitore (Trevi, «Ordini clienti»)**
- Ordine modificato dopo l'invio: badge «Modificato» nell'elenco; aprendolo, le righe cambiate hanno bordo arancione e «prima X, ora Y» (righe aggiunte: «nuova»; tolte: barrate). Il badge sparisce all'apertura (che è anche il momento del lucchetto).
- Richiesta di modifica in attesa: riquadro con la nota del cliente e due pulsanti:
  - **Accetta** → l'ordine si sblocca, il cliente riceve la notifica e può fare lui la modifica; alla successiva apertura del fornitore si ri-blocca.
  - **Rifiuta** (con motivo facoltativo) → resta bloccato, il cliente riceve la notifica.
- Nota: la richiesta è testo libero, quindi «accetta» non può applicare da sola le quantità: sblocca l'ordine al cliente. Se preferisci che sia il fornitore a correggere direttamente le righe, dimmelo.

## Prove a schermo previste (3 EMME cliente, Trevi fornitore)
1. Invio ordine reale da 3 EMME → banner a scorrimento con «+N».
2. Modifica quantità/prodotti prima del lucchetto → Trevi vede «Modificato» e righe evidenziate.
3. Trevi apre → lucchetto → 3 EMME vede «Chiedi modifica» → richiesta → accetta e poi rifiuta.
4. Annullamento prima e dopo il lucchetto.
5. Concorrenza: cliente con finestra Modifica aperta, Trevi apre l'ordine, cliente salva → errore chiaro.
6. Controllo nessuna regressione: inventario, card «da controllare», semaforo, resto U.M.

Resoconto finale nel formato «provato a schermo / non provato», con migrazioni e file dei bug trovati.

## Dettagli tecnici
- Migrazione **0009_order_customer_edit_history**:
  - tabella `purchase_order_changes` (company_id venditore + buyer, order_id, item_id nullable, field, old_value, new_value, changed_by, changed_at) con GRANT, RLS per membri di acquirente o venditore.
  - tabella `purchase_order_change_requests` (order_id, note, status in_attesa/accettata/rifiutata, requested_by/at, decided_by/at, decision_note) con GRANT e RLS analoga.
  - colonna nullable `purchase_orders.customer_modified_at`; colonna nullable `purchase_order_items.previous_quantity` per l'evidenza «prima/ora».
  - RPC SECURITY DEFINER (search_path=public): `customer_update_order_full(_order_id, _expected_seen_null, header..., _items jsonb)` con `SELECT ... FOR UPDATE` e verifica status='inviato' e seen_by_supplier_at IS NULL, altrimenti errore `ORDER_LOCKED`; scrive storico, aggiorna/aggiunge/rimuove righe (prodotti solo pubblicati dal venditore, U.M. del venditore), annulla se zero righe, notifica `ordine_modificato`.
  - `request_order_change`, `decide_order_change(_request_id, _accept, _note)`: accetta → azzera seen_by_supplier_at; notifiche a entrambe le parti.
  - `mark_order_seen_by_supplier` azzera customer_modified_at/previous_quantity dopo l'apertura (le evidenze restano consultabili dallo storico).
  - Aggiornamento di `guard_order_seen_lock` per consentire le modifiche righe solo tramite la RPC.
- Frontend: `order-customer-actions.tsx` (dialog modifica righe, «Chiedi modifica»), `purchase-orders-panel.tsx`, `received-orders-panel.tsx` (badge, evidenze, accetta/rifiuta), `purchase.functions.ts` se serve.
- Non tocco Inventario, Lista della Spesa, semaforo, Consegne, Carico Merce, Danea.
