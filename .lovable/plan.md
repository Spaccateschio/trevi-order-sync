# Chiusura della Lista della Spesa: confronto con l'esistente e piano

## 1. Cosa esiste già
- **Lista**: stati `aperta → confermata → chiusa / annullata`, con `confirmed_at`, `confirmed_by` e `closed_at`. Una nuova Lista nasce solo alla prima azione salvata.
- **Conferma** (`manage_shopping_list`, azione confirm): oggi blocca la conferma se un prodotto non ha una ripartizione valida.
- **Generazione ordini** (`create_purchase_orders_from_list`): funziona solo su una Lista confermata e raggruppa per fornitore. Ogni ordine riceve il numero `ORD` (`next_document_number`) e resta collegato a `shopping_list_id`. Se la Lista ha già ordini si ferma, quindi non ne crea di doppi.
- **Fotografia sulle righe d'ordine**: quantità, U.M. d'acquisto, fattore di conversione, prezzo, U.M. del prezzo, codice del fornitore e collegamento alla ripartizione di origine.
- **Ordine**: stati `bozza → inviato → …`, con `sent_at` e note. `manage_purchase_order` si occupa di invio, destinazione, note, annullamento e chiusura. Dopo l'invio non si possono più cambiare destinazione e righe.
- **Link esterno per il fornitore** (`purchase_order_share_links`), con numero di accessi.

## 2. Cosa manca
| Punto richiesto | Stato oggi |
|---|---|
| Numero Lista `LS-000123` | Manca: esiste solo un nome libero |
| Righe incomplete: la quantità mancante blocca, il fornitore mancante è solo un avviso con «Conferma comunque» | Oggi il fornitore mancante blocca la conferma |
| Riepilogo prima della conferma (prodotti, ordini per fornitore) | Manca |
| Data, fascia oraria e indirizzo di consegna per questa Lista, precompilati dall'azienda | Manca (gli ordini hanno solo il magazzino di destinazione) |
| Note per singolo fornitore | In parte: gli ordini hanno le note, la Lista no |
| Conferma e generazione ordini in un'unica operazione | Oggi sono due passaggi separati |
| Protezione dal doppio clic lato database | In parte: c'è il controllo «ordini già presenti», ma senza blocco della Lista |
| Fotografia del nome prodotto e dei dati di consegna | Manca: il nome prodotto viene letto dalla scheda attuale |
| Stato di invio separato (DA INVIARE / INVIATO / ERRORE INVIO) e storico degli invii e reinvii | Manca: c'è solo `sent_at` |
| Storico Liste, dettaglio, stampa | Manca |
| Area di lavoro pulita dopo la chiusura | Già così: una Lista confermata non è più «aperta» |

## 3. Cosa si può riutilizzare
Le tabelle `shopping_lists`, `shopping_list_items`, `shopping_list_item_suppliers`, `purchase_orders` e `purchase_order_items`. Le funzioni `next_document_number`, `create_purchase_orders_from_list` (la logica di raggruppamento), `manage_purchase_order` e `shopping_list_overview`.

## 4. Modifiche al database davvero necessarie
1. `shopping_lists`: aggiungere `number` (LS-…), `delivery_date`, `delivery_time_from`/`to`, `delivery_address_id` più la fotografia testuale dell'indirizzo, e `general_notes`.
2. `purchase_orders`: aggiungere `send_status` (da_inviare / inviato / errore_invio), `delivery_*` (fotografia) e `supplier_notes`.
3. `purchase_order_items`: fotografia di `product_name` e `product_code`.
4. Nuova tabella `purchase_order_send_events`: invio, reinvio ed errore, con canale, data e autore. Solo inserimento, mai modifiche.
5. Nuova funzione `close_shopping_list(list, dati consegna, note, note per fornitore, accept_unassigned)` descritta al punto 5.
6. Blocco delle modifiche su Lista, righe e ripartizioni quando lo stato non è `aperta`. In parte esiste già con `assert_shopping_list_open`: va verificato che copra tutto.

## 5. Chiusura atomica
Una sola funzione nel database, in un'unica transazione:
1. Blocca la Lista (`SELECT … FOR UPDATE`). Se è già confermata e ha ordini, restituisce gli stessi ordini senza creare nulla: così il doppio clic è innocuo.
2. Controlla che ogni prodotto abbia una quantità. Se ne manca una, si ferma ed elenca i prodotti.
3. Se ci sono prodotti senza ripartizione e l'utente non ha scelto «Conferma comunque», si ferma e li elenca.
4. Assegna il numero LS, salva la fotografia dei dati di consegna e delle note, e porta la Lista a `confermata`.
5. Crea gli ordini per fornitore con la logica attuale, con `send_status = da_inviare` e la fotografia del prodotto.
6. Se un passaggio fallisce, annulla tutto.

L'invio (WhatsApp, email, link, B2B) resta un'operazione separata. Se fallisce, registra «errore invio» e la Lista resta chiusa. «Riprova invio» e «Rinvia» aggiungono solo un evento, senza creare nuovi ordini.

## 6. Interfaccia (dopo il database)
- «Conferma lista» apre un riepilogo con gli errori bloccanti, gli avvisi, gli ordini per fornitore, i dati di consegna modificabili e le note, poi il pulsante «Conferma e genera ordini».
- Pagina «Storico Liste» con dettaglio e stampa (la stampa del browser permette anche di salvare in PDF).

## Da decidere
- Prodotti senza fornitore dopo «Conferma comunque»: restano nella Lista chiusa come «non ordinati» (proposta), oppure passano automaticamente nella Lista successiva?
- Fonte dei dati di consegna abituali: oggi non esiste un campo aziendale con giorni e orari preferiti. Proposta: precompilare solo l'indirizzo di consegna dell'azienda e lasciare data e orario da inserire.
