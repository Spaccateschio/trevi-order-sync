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

---

# Revisione 2 — correzioni A–G (sostituiscono le parti corrispondenti sopra)

## A. Idempotenza (sostituisce l'indice unico per fornitore)
- Oggi nessuna Lista ha più ordini dello stesso fornitore. Gli ordini integrativi legittimi però devono restare possibili, quindi niente indice unico su (Lista, fornitore).
- Nuova colonna `purchase_orders.generation_key uuid` (nullable) con indice unico parziale `(company_id, generation_key) WHERE generation_key IS NOT NULL`.
- La chiave nasce all'apertura della finestra, una per ogni card fornitore, e viene riusata a ogni nuovo tentativo.
- `generate_supplier_order(_list_id, _supplier_record_id, _generation_key, _delivery, _lines)`:
  - blocca la Lista con FOR UPDATE;
  - se la chiave esiste già, restituisce l'ordine esistente (`already_exists`);
  - altrimenti crea l'ordine solo per la quantità non ancora coperta (vedi C). Un doppio invio con chiave diversa trova la quantità a zero e non crea nulla.
- Un ordine integrativo nasce da una nuova finestra, quindi con una chiave nuova, e solo sul residuo.

## B. Acquisti diretti
- Restano senza `supplier_record_id`: nessun fornitore fittizio.
- Quota da `shopping_list_items.manual_purchase_*`, impostata con il comando già esistente `set_shopping_list_direct_quota`.
- La card «Acquisti diretti» del popup elenca queste quote. «Registra acquisto diretto» chiama la nuova `register_direct_purchase(_item_id, _generation_key)`, che scrive `shopping_list_direct_purchases` (fotografia) e `manual_purchase_done_at/by`, con la stessa protezione della chiave.
- Un acquisto diretto è completato quando `manual_purchase_done_at` è valorizzato. Solo allora conta come coperto per la chiusura.

## C. Stati delle quantità (per riga, calcolati solo nel database)
Per ogni riga con `decided_quantity > 0` in U.M. di magazzino, ogni quantità ha un solo stato:

| Stato | Origine del dato |
|---|---|
| Da assegnare | decisa − assegnata − quota diretta |
| Assegnata | `shopping_list_item_suppliers` meno quanto già in ordini non annullati |
| In bozza | righe di ordini `status='bozza'` (`source_assignment_id`) |
| Generata non inviata | ordini `status='bozza'` già confermati come generati |
| Inviata | ordini `status IN ('inviato', 'parzialmente_consegnato', 'consegnato', 'chiuso')` |
| Esclusa | `excluded_at` valorizzato: l'intera riga, che non conta in nessun altro stato |

Nota: con lo schema attuale «bozza» e «generata non inviata» coincidono, perché entrambe sono `status='bozza'` con `send_status='da_inviare'`. Distinguerle richiederebbe un nuovo stato: decisione D1.

- **Nessuna doppia copertura:**
  - una riga d'ordine si lega a una sola ripartizione (`source_assignment_id`, già esistente);
  - la somma ordinata per ripartizione non può superare `purchase_quantity`, controllo in `generate_supplier_order` e `update_draft_order` sotto FOR UPDATE.
- **Lista «chiusa»:** si chiude in automatico quando tutte queste condizioni sono vere:
  - ogni riga è inviata, completata come acquisto diretto oppure esclusa;
  - non resta nessuna bozza;
  - non resta nessuna quantità da assegnare o assegnata ma non ordinata.

  La chiusura avviene nella stessa transazione dell'ultimo «Invia» o dell'ultima registrazione di acquisto diretto, e usa le parti esistenti di `close_shopping_list`: numero LS e fotografia.
- **Semaforo verde:** con le stesse condizioni. La bozza non conta mai come ordine inviato.
- **Inventari già conclusi:** nessuna modifica.

## D. Modifica delle bozze
- `update_draft_order(_order_id, _lines, _delivery)` è ammessa solo con `status='bozza'`, perché il trigger `assert_order_items_frozen` blocca già le altre. Blocca l'ordine e la Lista con FOR UPDATE e scrive `purchase_order_changes`.
- Esempio: 30 kg in bozza portati a 20 kg. La riga d'ordine scende a 20 e i 10 kg tornano «Assegnata», che si può ordinare di nuovo o riassegnare. Le ripartizioni non vengono toccate.
- **Cambio fornitore** con `change_draft_supplier(_order_id, _new_supplier_record_id, _generation_key)`, in un'unica transazione:
  - annulla la bozza (`status='annullato'` e `cancel_reason`; il trigger non notifica il fornitore perché era una bozza);
  - sposta le ripartizioni sul nuovo fornitore tramite `assign_shopping_list_supplier`, con le stesse regole per U.M. e B2B;
  - crea la nuova bozza;
  - registra l'operazione in `audit_events`.

  Se un passaggio fallisce, non cambia nulla.
- **Richieste contemporanee:** FOR UPDATE sulla Lista per tutte le funzioni di generazione e modifica. La seconda richiesta attende e poi ricalcola il residuo.

## E. Compatibilità e sicurezza (verificate in sola lettura)
- `close_shopping_list` resta la chiusura finale: la nuova chiusura automatica ne riusa le parti interne. `create_purchase_orders_from_list` richiede una Lista `confermata` e oggi non è usata dal nuovo flusso: la lascio intatta e la segno come vecchio sistema.
- Liste chiuse e ordini storici: nessuna colonna obbligatoria nuova, `generation_key` resta NULL negli ordini storici, nessun ricalcolo.
- Trigger esistenti considerati:
  - `assert_order_items_frozen`: le righe si modificano solo in bozza, ed è compatibile;
  - `purchase_orders_notify`: notifica solo il passaggio a «inviato», quindi le bozze non avvisano il fornitore;
  - inoltre `guard_order_seen_lock`, `purchase_order_items_price_unit_guard` e `trg_order_item_previous_qty_fallback`.
- Nuove funzioni:
  - SECURITY DEFINER con search_path=public;
  - azienda ricavata dalla Lista (mai dal browser) e `is_company_member(company)` su `auth.uid()`;
  - EXECUTE solo per authenticated e service_role;
  - RAISE dopo la prima scrittura.
- Nessuna scrittura su `inventory_counts`, giacenze o movimenti.

## F. Dicitura del prezzo
- `src/lib/purchase.ts` riga 280: «Prezzo su richiesta» diventa «Prezzo di vendita non inserito». Questa funzione alimenta il dettaglio ordine di 3 EMME e gli ordini ricevuti da Trevi.
- La prova `src/lib/order-price-note.test.ts` righe 5–6 si aggiorna alla nuova dicitura.
- Il popup «Genera ordini» usa la stessa funzione.
- `src/components/catalog/catalog-list.tsx` riga 205 (Catalogo, non ordini): da decidere, D2.
- Il prezzo resta NULL, mai 0.

## G. Semaforo, confronto prima e dopo
Prima di applicare M3, una prova annullabile:
1. per ogni ciclo esistente legge `inventory_purchase_cycle_status` con la versione attuale;
2. sostituisce la funzione dentro la transazione e la rilegge;
3. confronta i risultati e annulla tutto.

Riporta ciclo, Lista, stato prima, stato dopo e motivo, compresa la Lista `8b062306…`. Se un ciclo cambia, mi fermo prima di applicare.

## Piano migrazioni aggiornato (nessuna applicata)
- **M1, solo additiva:**
  - `purchase_orders.generation_key` con il suo indice unico parziale;
  - `shopping_list_items.excluded_at`, `excluded_by` ed `exclusion_reason`;
  - colonne di copertura su `shopping_list_item_suppliers`.
- **M2, funzioni nuove:**
  - `generate_supplier_order`, `update_draft_order`, `change_draft_supplier`;
  - `exclude_shopping_list_items_from_cycle` / `restore_excluded_items`;
  - `register_direct_purchase`, `confirm_assignment_coverage`;
  - `send_purchase_order`, che lascio come struttura per l'invio futuro.
- **M3, adeguamenti:** `_shopping_list_close_plan`, `shopping_list_item_state` e `inventory_purchase_cycle_status`. Solo dopo il confronto G.

## Prove aggiuntive indispensabili
- Doppio clic e nuovo tentativo con la stessa chiave: un solo ordine.
- Due richieste contemporanee con chiavi diverse: la seconda trova il residuo a zero.
- Ordine integrativo sul residuo: ammesso.
- Bozza da 30 a 20 kg: tornano 10 kg assegnati.
- Cambio fornitore: un'unica operazione, nessun doppione, tutto registrato.
- Fallimento di un fornitore: gli altri ordini restano validi.
- Esclusione e ripresa.
- Acquisto diretto registrato due volte: una sola registrazione.
- Prezzo mancante: resta NULL e mostra la nuova dicitura.
- Conversione mancante: equivalente NULL e conferma tracciata.
- Utente di altra azienda: rifiutato.
- Confronto G del semaforo.
- Liste chiuse storiche: nessun cambiamento.

## Decisioni ancora necessarie
- **D1.** «In bozza» e «generata non inviata» vanno distinte? Senza un nuovo stato coincidono.
- **D2.** «Prezzo su richiesta» nel Catalogo B2B diventa anch'esso «Prezzo di vendita non inserito»?
- **D3.** «Invia» per gli ordini non B2B: basta la conferma dell'utente oppure serve indicare anche il mezzo (telefono, di persona)?
