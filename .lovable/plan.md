# Fase 1 — Lista della Spesa → «Genera ordini per fornitore»

Solo piano: nessuna modifica a codice, database o dati finché non lo approvi.

## Cosa esiste oggi
- Pulsante «Conferma lista» in `src/components/shopping/shopping-list-panel.tsx` (righe 1102 e 1573). Apre `close-list-dialog.tsx`, che usa `getShoppingListClosePreview` e `closeShoppingList` da `src/lib/shopping-list.functions.ts`.
- Le quantità si salvano in `shopping_list_items.decided_quantity` + `decided_unit_id/decided_unit_code`. La ripartizione per fornitore sta in `shopping_list_item_suppliers`, con `assigned_quantity`, `purchase_quantity`, `purchase_unit_id/code`, `conversion_type/mode`, `stock_unit_id`, `package_id` e `is_selected`. L'acquisto diretto sta in `shopping_list_items.manual_purchase_*`, che diventa `shopping_list_direct_purchases` alla chiusura.
- Oggi gli ordini nascono solo da `close_shopping_list`, che è tutto-o-niente:
  - un ordine per ogni `supplier_record_id`, con `send_status='da_inviare'`;
  - data, ora, indirizzo e note per fornitore passano da `_supplier_overrides`;
  - la funzione è idempotente sulla Lista già chiusa;
  - alla fine la Lista diventa `chiusa`.

  Esiste anche `create_purchase_orders_from_list`. Lo stato della riga viene da `shopping_list_item_state`, il semaforo da `inventory_purchase_cycle_status`.
- Il prezzo della riga d'ordine si legge solo da `applicable_b2b_price`; se manca, la riga mostra «Prezzo su richiesta».

## 1. Pulsante «Genera ordini»
- Il testo «Conferma lista» diventa «Genera ordini», in tutti e due i punti.
- Il pulsante è disattivato se nessuna riga ha `decided_quantity > 0`. La regola si legge da un helper puro in `src/lib/shopping-list.ts`, così si può provare.
- Il raggruppamento per fornitore resta quello di `_shopping_list_close_plan`, già usato dall'anteprima.

## 2. Prodotti senza quantità
- Prima della finestra compare un avviso con «Sistema le quantità» e «Procedi comunque».
  - «Sistema le quantità» mostra la Lista filtrata sulle sole righe senza quantità e la barra fissa «Riprendi l'invio ordini». Se mancano ancora quantità, la verifica si ripete.
  - «Procedi comunque» chiama una nuova RPC, `exclude_shopping_list_items_from_cycle(_list_id, _item_ids)`, che segna l'esclusione.
- Soluzione minima: nuove colonne `shopping_list_items.excluded_at`, `excluded_by` e `exclusion_reason`, tutte nullable. Così `decided_quantity` resta NULL e non diventa mai 0.
- Le righe escluse:
  - non generano ordini;
  - non bloccano la generazione;
  - si possono riprendere finché la Lista è aperta.
- Le righe a zero non generano mai righe d'ordine.

## 3. Prodotti senza fornitore
- Le righe con quantità positiva ma senza ripartizione e senza quota di acquisto diretto bloccano soltanto la propria card.
- Si sistemano con i comandi già esistenti:
  - `assign_shopping_list_supplier` per scegliere il fornitore;
  - `set_shopping_list_direct_quota` per scegliere esplicitamente «Acquisto diretto».
- Nessuna assegnazione automatica.

## 4. Finestra «Genera ordini»
- Nuovo `src/components/shopping/generate-orders-dialog.tsx`, costruito su `close-list-dialog.tsx`. Riusa le parti di data, ora e luogo e l'anteprima.
- Una card per fornitore, tutte selezionate all'inizio:
  - casella di selezione, nome, data, ora e luogo modificabili;
  - freccia per vedere i prodotti in ordine alfabetico;
  - per ogni prodotto: codice, descrizione, U.M. d'acquisto, quantità, prezzo o «Prezzo di vendita non inserito», nota.
- Le quantità si modificano con `assign_shopping_list_supplier`.
- In fondo, la card «Acquisti diretti».
- Nessun totale in euro.

## 5. Fornitori non selezionati e bozze
- La generazione diventa parziale, per fornitore. Nuova RPC `generate_supplier_order(_list_id, _supplier_record_id, _delivery jsonb)`:
  - blocca la Lista con FOR UPDATE;
  - legge `_shopping_list_close_plan` solo per quel fornitore;
  - crea `purchase_orders` con `status='bozza'` e `send_status='da_inviare'`;
  - copia nelle righe d'ordine U.M., fattore e prezzo come fotografia del momento.
- I fornitori non selezionati restano come ripartizioni aperte nella Lista. Il pulsante «Bozze» elenca gli ordini `status='bozza'` della Lista e i fornitori ancora da generare.
- Una bozza si modifica con una nuova RPC `update_draft_order`, ammessa solo con `status='bozza'`. Si possono cambiare prodotti, quantità, data, ora e luogo; il fornitore si cambia annullando la bozza e rigenerando.
- Quando la Lista resta aperta: finché c'è almeno una riga con quantità positiva non coperta da ordini non annullati o da un acquisto diretto, e non esclusa.
- Le righe coperte dagli ordini escono dalla vista di lavoro, ma restano nello storico.
- La quantità ancora da ordinare è la differenza tra `assigned_quantity` e quanto già ordinato. È la stessa regola che il semaforo già usa.
- Quando tutto è coperto, la Lista si chiude da sola con l'attuale chiusura finale, che assegna il numero LS.
- Il semaforo resta rosso finché ci sono quantità da ordinare o ordini in bozza.
- L'Inventario del 07/10 non viene chiuso.

## 6. U.M. e prezzi mancanti
- Se manca la conversione, la quantità ordinata e la sua U.M. si salvano lo stesso. L'equivalente in magazzino resta NULL, compare un avviso e serve una conferma esplicita di copertura (vedi 7-bis).
- Se manca il prezzo B2B, l'ordine non si blocca. Cliente e fornitore vedono «Prezzo di vendita non inserito». Il prezzo resta NULL, mai 0.

## 7. Errori e ripresa
- Ogni chiamata a `generate_supplier_order` è una transazione singola, quindi un fornitore che fallisce non annulla gli ordini già creati.
- La finestra genera i fornitori uno alla volta e mostra l'esito per ciascuno. Quelli falliti restano selezionati con l'errore e i dati scritti, e si può riprovare.

## 7-bis. Protezioni obbligatorie
- **Creazione e invio separati.** Il comando «Genera ordini selezionati» crea l'ordine con `status='bozza'` e `send_status='da_inviare'`. Il comando «Invia» (fuori Fase 1) imposterà `status='inviato'`, `sent_at` e `send_status='inviato'`:
  - per gli ordini B2B, alla consegna nella piattaforma;
  - per gli altri, alla conferma dell'utente.
- **Nessun doppione:**
  - nuovo indice unico parziale `purchase_orders(shopping_list_id, supplier_record_id) WHERE status <> 'annullato'`;
  - la RPC blocca la Lista con FOR UPDATE e, se l'ordine esiste già, lo restituisce invece di crearne un altro (`already_exists: true`);
  - sullo schermo il comando si disattiva durante l'invio, ma la garanzia vera è nel database.
- **Copertura senza conversione:** nuove colonne nullable su `shopping_list_item_suppliers`, cioè `coverage_confirmed_at`, `coverage_confirmed_by`, `coverage_quantity` e `coverage_unit_code`, più una riga in `audit_events`. I conteggi dell'Inventario non vengono toccati.

## Migrazioni previste
- **M1:** colonne di esclusione, colonne di copertura e indice unico. Va controllata prima l'assenza di doppioni esistenti.
- **M2:** `exclude_shopping_list_items_from_cycle`, `generate_supplier_order`, `update_draft_order` e `confirm_assignment_coverage`. Tutte SECURITY DEFINER con search_path=public, membro dell'azienda verificato da `auth.uid()`, RAISE dopo la prima scrittura.
- **M3:** adeguamento di `_shopping_list_close_plan`, `shopping_list_item_state` e `inventory_purchase_cycle_status` per escludere le righe escluse e gli ordini già generati.

## Rischi
- Inventario e giacenze: nessuno, perché non si toccano conteggi né movimenti.
- Semaforo: cambia la regola «da completare». Va provato con Liste a metà.
- Liste e ordini esistenti: `close_shopping_list` resta per la chiusura finale. Gli ordini già esistenti non vengono modificati.
- Possibile doppione storico prima del nuovo indice: va verificato prima di M1.

## Sequenza
1. M1 e M3 con prove annullabili.
2. M2 con prove: doppio clic, richieste contemporanee, fallimento parziale, prezzo mancante, conversione mancante.
3. Server function in `shopping-list.functions.ts`.
4. Finestra, pulsante «Bozze» e flusso «Sistema le quantità».
5. Verifica a 1280 e 390 px, poi la suite completa.

## Decisioni da prendere prima dello sviluppo
1. Nome dei comandi: «Genera ordini selezionati» per creare e «Invia» solo per trasmettere. Va bene?
2. Lista con tutte le righe ordinate o escluse: si chiude da sola, oppure resta un comando finale?
3. Bozza: si può cambiare il fornitore direttamente, oppure solo annullando e rigenerando?
4. Una riga esclusa con «Procedi comunque» si può riprendere nella stessa Lista?
