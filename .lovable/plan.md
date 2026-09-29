# Step 2 — Piano operativo finale (in ordine di esecuzione)

Regola: per ogni valore ci sono campi della **U.M. d'acquisto** (commerciale: «2 cassette») e campi della **U.M. di magazzino** (equivalente o reale: «17,4 kg»). Non si usa mai lo stesso campo per unità diverse. L'equivalente è solo informativo: vuoto se manca la conversione, mai 0. Dati storici non reinterpretati.

Catena di tracciabilità: riga lista → ripartizione → riga ordine (`source_assignment_id`) → riga consegna (`order_item_id`, già esistente) → Carico Merce (`delivery_item_id`, già esistente) → movimento di magazzino.

## 1. Migrazione database (una sola)
**Modifico**
- **Righe della lista** (`shopping_list_items`)
  - `decided_quantity` diventa facoltativa (vuota o maggiore di 0).
  - Nuove colonne: `purchase_mode` (fornitore/manuale, predefinito fornitore), `manual_purchase_quantity`, `manual_purchase_unit_id`, `manual_purchase_unit_code`.
  - Nuove colonne predisposte per l'evento futuro dell'acquisto manuale: `manual_purchase_done_at` e `manual_purchase_done_by`, sempre vuote.
- **Ripartizioni** (`shopping_list_item_suppliers`)
  - `assigned_quantity` (equivalente) diventa facoltativa.
  - Nuova colonna `conversion_type`.
  - Quantità e U.M. d'acquisto obbligatorie sulle righe nuove o modificate, con un controllo che salta le righe storiche.
  - Il vincolo unico «riga + fornitore» diventa «riga + articolo fornitore + U.M. d'acquisto».
- **Righe ordine** (`purchase_order_items`)
  - `ordered_quantity` diventa facoltativa (vuota o maggiore di 0).
  - Nuova colonna `source_assignment_id`, collegata alla ripartizione.
- **Righe consegna** (`purchase_delivery_items`)
  - `declared_quantity` diventa facoltativa: vuota solo se la riga d'ordine non ha equivalente.
  - Nuove colonne `declared_purchase_quantity`, `accepted_purchase_quantity`, `purchase_unit_id`, `purchase_unit_code`.

**Non tocco**: tabelle di Inventario, giacenze, lotti, movimenti, Carico Merce (`goods_receipt*`), prodotti, fornitori.

**Test**: struttura verificata leggendo lo schema; conteggio delle righe esistenti invariato.

## 2. Funzioni Lista della Spesa
**Modifico**
- `assign_shopping_list_supplier`
  - Quantità + U.M. d'acquisto come dato principale; l'U.M. deve essere abilitata sull'articolo del fornitore.
  - Calcola da solo l'equivalente, oppure lo lascia vuoto.
  - Parametro facoltativo con l'identificativo della ripartizione.
  - Resta compatibile con la vecchia chiamata «solo kg».
- `shopping_list_item_state`
  - «Assegnata» = almeno una ripartizione valida.
  - «Parziale» = solo indicazione rispetto all'obiettivo.
  - Righe manuali = stato «manuale».
  - Legge l'U.M. della ripartizione, non quella del collegamento fornitore.
- `set_shopping_list_item_quantity`: accetta il vuoto; lo 0 resta rifiutato.
- `add_shopping_list_items`: le righe senza quantità si salvano vuote invece di essere scartate.
- `manage_shopping_list` (conferma): blocca solo le righe `fornitore` senza nessuna ripartizione valida; niente quadratura in kg.

**Non tocco**: apertura, chiusura e annullamento della lista; aggiunta dal Fabbisogno; permessi.

**Test**: Rossi 3 cassette (8 kg), Bianchi 2 sacchi senza conversione, Rossi 3 cassette + 5 kg, chiamata vecchia in kg, riga manuale, conferma.

## 3. Creazione Ordini
**Modifico**: `create_purchase_orders_from_list`
- Una riga d'ordine per ripartizione, con `source_assignment_id`.
- Quantità e U.M. d'acquisto come dato principale.
- `ordered_quantity` = equivalente oppure vuota.
- Le righe manuali non generano ordini.

`purchase_order_overview`: somma solo gli equivalenti presenti e aggiunge «N righe senza equivalente».

`external_order_snapshot` (link al fornitore): aggiunge quantità e U.M. d'acquisto.

**Non tocco**: numerazione, stati dell'ordine, invio, link di condivisione.

**Test**: ordini generati dagli scenari; «3 cassette» presente; kg vuoti dove manca la conversione.

## 4. Semaforo
**Modifico**: `inventory_purchase_cycle_status` e il controllo gemello in `manage_inventory_purchase_evaluation`, solo nella verifica di copertura:
- con equivalente, confronto in kg come oggi;
- senza, serve una riga d'ordine non annullata con lo stesso articolo, la stessa U.M. d'acquisto e quantità d'acquisto sufficiente (meglio tramite `source_assignment_id`);
- le righe manuali restano **non coperte**. Il futuro evento `manual_purchase_done_at` sarà aggiunto qui come unica condizione.

**Non tocco**: giallo, rosso e verde, presa in carico, fine valutazione, blocco dei nuovi inventari.

**Test**: una ripartizione senza ordine resta 🔴; con l'ordine diventa 🟢; annullando l'ordine torna 🔴; la riga manuale resta 🔴.

## 5. Consegne
**Modifico**
- `_delivery_open_core`
  - Righe **con** equivalente: come oggi, più le colonne d'acquisto a titolo informativo.
  - Righe **senza**: precompila la quantità in cassette = ordinate − già dichiarate; i kg restano vuoti.
- `_delivery_set_item_core`, `external_set_delivery_item` e la funzione per le righe aggiunte dal fornitore: accettano la quantità in U.M. d'acquisto; nelle righe senza equivalente la quantità in kg resta vuota.
- `_delivery_submit_core`: la dichiarazione è completa se ogni riga ha la quantità nella propria U.M. di riferimento (kg se c'è l'equivalente, altrimenti U.M. d'acquisto).
- Accettazione e contestazione (`accept_purchase_delivery`, `dispute_purchase_delivery_item`): copiano o rettificano anche la quantità in U.M. d'acquisto.
- `delivery_comparison`: senza equivalente confronta cassette con cassette (non consegnato, parziale, consegnato, superiore); se il confronto non è possibile mostra «da verificare al Carico Merce», mai 0.

**Non tocco**: flusso della consegna, contestazioni, link esterno (salvo il campo nuovo), sicurezza delle funzioni.

**Test**: ordinate 3 cassette, dichiarate 0, 1, 2, 3, 4, con e senza conversione. Controllo che nessun kg compaia dove manca l'equivalente.

## 6. Compatibilità minima Carico Merce
**Modifico**
- `confirm_goods_receipt`: **solo** il calcolo dello stato dell'ordine. Le righe senza equivalente si valutano in cassette ordinate contro cassette accettate in consegna.
- Schermata Carico Merce: riferimento «Dichiarate: 2 cassette» quando la quantità in kg è vuota.

**Non tocco**: quantità verificata, pesature, lotti, scadenze, movimenti di magazzino, riconciliazioni, aggiornamento della giacenza (sempre e solo dalla quantità verificata).

**Test**: Carico con 17,4 kg su un ordine da 3 cassette. La giacenza aumenta di 17,4; lo stato dell'ordine segue le cassette.

## 7. Frontend minimo
**Modifico**
- `shopping-list.functions.ts`, `shopping-list.ts`, `purchase.ts`: nuovi campi facoltativi.
- `supplier-split-dialog.tsx`: quantità + U.M. d'acquisto per fornitore; equivalente mostrato solo se c'è.
- `shopping-list-panel.tsx`, `use-shopping-list-extras.ts`: gestione dei valori vuoti.
- `purchase-order-detail.tsx`: «3 cassette (≈ 24 kg)».
- `delivery-declaration-panel.tsx`, `delivery-comparison-panel.tsx`: campo in U.M. d'acquisto per le righe senza equivalente.
- `goods-receipt-panel.tsx`: solo il riferimento «Dichiarate».

**Non tocco**: nuove card (Step 1), Inventario, Fabbisogno, Prodotti, Fornitori, navigazione.

**Test**: controllo dei tipi, anteprima in sola lettura della Lista e di un ordine.

## 8. Dati storici
- Aggiornamento una tantum solo sulle ripartizioni senza quantità d'acquisto: quantità d'acquisto = quantità assegnata, U.M. d'acquisto = U.M. del prodotto. Stesso significato di prima.
- Righe consegna esistenti: le colonne nuove restano vuote.
- Liste chiuse o annullate, ordine esistente e consegne restano come sono.

**Test**: confronto prima/dopo di liste, ordini e consegne esistenti; valori identici.

## 9. Transazioni di prova
- Tutti gli scenari delle fasi 2–6 in un'unica transazione annullata alla fine: nessun dato reale resta salvato. Nessun uso dell'inventario reale del 28/09.
- Controllo delle regole di sicurezza del database dopo la migrazione.

## 10. Controlli finali anti-regressione
- Semaforo attuale identico prima e dopo (🔴 sull'inventario del 28/09).
- Inventario, giacenze e Fabbisogno: stessi valori.
- Pagine Lista, Ordini, Consegne e Carico si aprono senza errori, nessun errore di compilazione.
- Resoconto finale con file e funzioni modificati.
