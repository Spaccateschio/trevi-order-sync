# Chiusura della Lista della Spesa

## Regole decise
- **Quantità mancante (vuota o 0)**: errore bloccante, con l'elenco dei prodotti e un link alle card.
- **Quantità senza fornitore**: non è un errore. Diventa **ACQUISTO DIRETTO** (nessuna domanda «Conferma comunque»).
- **Assegnazione parziale** (20 kg, di cui Trevi 10 kg): il residuo va negli acquisti diretti solo se si calcola con certezza (stessa U.M. o conversione certa). Altrimenti lo segnalo nel riepilogo senza inventare quantità.
- Gli acquisti diretti restano nella Lista chiusa e non vengono copiati nella Lista successiva.
- **Consegna**: indirizzo aziendale precompilato; data, fascia «dalle–alle» e note generali modificabili. Sono il valore di partenza per ogni ordine, ma si possono cambiare per il singolo fornitore. La fotografia viene salvata su ogni ordine.
- **Note**: generali della Lista, per singolo ordine fornitore e per singolo acquisto diretto (luogo facoltativo, es. «prendere al CAR»).
- Dopo la chiusura la Lista è storico e non si può più modificare. L'area di lavoro si svuota e la prossima azione crea una nuova Lista LS.
- Gli ordini nascono **DA INVIARE**. L'invio è un passaggio separato (lo faremo dopo).

## Modifiche al database
1. `shopping_lists`: `number` (LS-000001, numerazione esistente), `delivery_date`, `delivery_time_from`, `delivery_time_to`, `delivery_address_id`, `delivery_address_text` (fotografia), `general_notes`.
2. `purchase_orders`: `send_status` (da_inviare / inviato / errore_invio, predefinito da_inviare), gli stessi campi di consegna come fotografia e `supplier_notes`. Gli ordini esistenti restano validi.
3. `purchase_order_items`: fotografia di `product_name` e `product_code`.
4. Nuova tabella `shopping_list_direct_purchases`: Lista, prodotto, fotografia di nome e codice, quantità, U.M. (id + codice), nota e origine (intero / residuo). Solo lettura dopo la chiusura, con accesso limitato all'azienda.
5. Nuova funzione `close_shopping_list(list, consegna generale, note generali, eccezioni per fornitore in jsonb, note acquisti diretti in jsonb)`, in un'unica transazione:
   blocco della Lista → se è già chiusa restituisce il risultato esistente (doppio clic innocuo) → validazione delle quantità → numero LS → fotografia dei dati di consegna e delle note → acquisti diretti (interi e residui certi) → ordini per fornitore con la logica attuale di `create_purchase_orders_from_list` → Lista `confermata`. Se un passaggio fallisce, annulla tutto.
6. Funzione di anteprima `shopping_list_close_preview(list)`: prodotti, errori, ordini per fornitore, acquisti diretti e residui non calcolabili. Usa le stesse regole della chiusura.
7. Verifico che tutte le modifiche a Lista, righe e ripartizioni siano rifiutate quando la Lista non è aperta.

## Interfaccia
- «Conferma lista» apre il riepilogo con: errori, dati di consegna generali, ordini per fornitore (apribili per modificare consegna e note), acquisti diretti con nota, e in evidenza «15 prodotti verranno ordinati / 3 acquisti diretti». Poi «Conferma e genera», protetto dal doppio clic.
- Pagina **Storico Liste**: numero, data, stato, prodotti, fornitori, ordini, data di consegna, chi ha confermato. Il dettaglio mostra gli ordini generati e gli acquisti diretti.
- **Stampa**: Lista completa e «Stampa acquisti diretti» con la casella ☐ per ogni riga (dalla stampa del browser si può salvare in PDF).

## Verifiche
Prove della chiusura in una transazione annullata alla fine: blocco per quantità mancante, acquisto diretto intero e residuo, residuo non calcolabile, doppia chiamata, consegna per fornitore, rollback. Nessun dato reale modificato.

## Fuori da questo lavoro
Invio, reinvio e storico invii, Carico Merce, DDT, preferenze di consegna aziendali.
