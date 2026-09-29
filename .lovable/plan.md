# Step 2 definitivo — Lista della Spesa: acquisto = quantità + U.M. + fornitore

Regola: la ripartizione salva «3 cassette → Rossi». La quantità nell'U.M. di magazzino (`ordered_quantity`, `assigned_quantity`) è solo un **equivalente**: si compila se c'è la conversione, altrimenti resta vuota e non vale mai 0. Liste e ordini storici non vengono reinterpretati.

## A. Tabelle e colonne

**A1. `shopping_list_items.decided_quantity`**
- Oggi: obbligatoria, maggiore di 0, deve quadrare con le ripartizioni.
- Nuovo: facoltativa, «obiettivo in U.M. di magazzino». Vuota oppure maggiore di 0.
- Rischio: interfacce che la trattano come sempre presente.
- Verifica: tipi TypeScript, lista esistente, Fabbisogno che la invia.

**A2. `shopping_list_items`: 4 colonne nuove**
- `purchase_mode`: `fornitore` / `manuale`, predefinito `fornitore`, non vuota.
- `manual_purchase_quantity`: numero con 3 decimali, facoltativa, maggiore di 0.
- `manual_purchase_unit_id`: U.M. dell'azienda, facoltativa.
- `manual_purchase_unit_code`: copia del codice U.M.
- Oggi non esistono. Rischio: nessuno, le righe esistenti diventano `fornitore`.
- Verifica: righe storiche invariate.

**A3. Evento futuro per l'acquisto manuale** (predisposto, non usato)
- `manual_purchase_done_at` e `manual_purchase_done_by`: facoltative, sempre vuote in questo step.
- Il semaforo **non le legge ancora**: una riga manuale resta «non coperta».
- Nello step dedicato basterà registrarle e aggiungere una condizione al semaforo, senza cambiare le tabelle.

**A4. `shopping_list_item_suppliers`** (ripartizioni)
- `purchase_quantity`: oggi facoltativa. Nuovo: obbligatoria per le righe nuove o modificate, con un controllo nel database che non tocca le righe storiche.
- `purchase_unit_id`: stessa regola. Deve essere un'U.M. attiva dell'articolo di quel fornitore, oppure l'U.M. del prodotto.
- `assigned_quantity`: oggi obbligatoria in kg. Nuovo: facoltativa, «equivalente». La calcola il database: uguale alla quantità d'acquisto se l'U.M. è la stessa del prodotto, quantità × fattore se c'è la conversione, vuota se non c'è.
- Nuova colonna `conversion_type` (esatta / indicativa), copiata dall'articolo del fornitore.
- Rischio: il codice che somma `assigned_quantity` senza considerare il vuoto.
- Verifica: somme nel database e nell'interfaccia con valori vuoti.

**A5. Vincolo unico delle ripartizioni**
- Oggi: una sola ripartizione per riga e fornitore.
- Nuovo: una per riga + articolo fornitore + U.M. d'acquisto. Sarà possibile «Rossi 3 cassette + Rossi 5 kg».
- Rischio: la finestra Ripartizione ragiona per fornitore.
- Verifica: la finestra continua a creare e aggiornare una riga per fornitore come oggi, senza interfaccia multipla.

**A6. `purchase_order_items.ordered_quantity`**
- Oggi: obbligatoria, maggiore di 0, in U.M. di magazzino.
- Nuovo: facoltativa. Vuota solo nelle righe nuove senza conversione, altrimenti maggiore di 0. Mai in cassette.
- Nuova colonna `source_assignment_id`: collega la riga d'ordine alla ripartizione da cui nasce.
- Rischio: vedi sezione C.
- Verifica: ordine esistente invariato.

**A7. Aggiornamento una tantum delle ripartizioni esistenti**
- Solo su ripartizioni senza quantità d'acquisto: quantità d'acquisto = quantità assegnata, U.M. d'acquisto = U.M. del prodotto.
- Oggi ci sono 3 liste storiche, nessuna aperta o confermata. Il significato resta identico.
- Verifica: conteggio delle righe prima e dopo, nessun ordine toccato.

## B. Funzioni della Lista e del semaforo

**B1. `assign_shopping_list_supplier`**
- Oggi: kg obbligatori, vincolo per fornitore.
- Nuovo: richiede quantità e U.M. d'acquisto e calcola l'equivalente.
- Compatibile: se arrivano solo i kg (finestra attuale), l'acquisto = kg in U.M. del prodotto.
- Nuovo parametro facoltativo: identificativo della ripartizione, per aggiornare o rimuovere la riga giusta.
- Verifica: 4 scenari in una transazione annullata.
  - 3 cassette Rossi con conversione.
  - 2 sacchi Bianchi senza conversione.
  - Rossi 3 cassette + Rossi 5 kg.
  - Chiamata vecchia in kg.

**B2. `shopping_list_item_state`**
- Oggi: «Assegnata» = somma dei kg uguale alla decisa; legge l'U.M. del collegamento fornitore.
- Nuovo:
  - Assegnata = almeno una ripartizione valida (fornitore attivo, quantità > 0, U.M. abilitata).
  - Parziale = solo indicazione: equivalente noto e inferiore all'obiettivo.
  - Righe manuali: stato «manuale».
- Legge l'U.M. **della ripartizione**.
- I nomi tecnici restano per compatibilità; i testi sulle card si decidono nello step grafico.
- Verifica: stessi scenari.

**B3. `set_shopping_list_item_quantity`**: accetta anche il vuoto (obiettivo non indicato). Lo 0 resta rifiutato.

**B4. `add_shopping_list_items`**: le righe senza decisa si salvano vuote invece di essere scartate.

**B5. `manage_shopping_list` (conferma)**
- Oggi: tutte le righe devono essere «Assegnata» in kg.
- Nuovo: blocca solo le righe `fornitore` senza nessuna ripartizione valida. Le righe `manuale` non bloccano.
- Nessuna quadratura con l'obiettivo.
- Rischio: si conferma prima di aver coperto l'obiettivo; è voluto.

**B6. `create_purchase_orders_from_list`**
- Oggi: somma i kg per prodotto e articolo fornitore.
- Nuovo:
  - una riga d'ordine per ripartizione (`source_assignment_id`), con quantità e U.M. d'acquisto come dato principale;
  - `ordered_quantity` = equivalente oppure vuota;
  - le righe `manuale` non generano ordini.

**B7. `inventory_purchase_cycle_status`**
- Eventi invariati:
  - inventario in corso → 🟡;
  - dopo il completamento → 🔴 finché mancano: lista presa in carico non annullata, fine valutazione, prodotti tutti ripartiti, ripartizioni coperte da ordini non annullati;
  - tutto soddisfatto → 🟢;
  - ordine annullato → di nuovo 🔴.
- Cambia solo il controllo di copertura:
  - con equivalente, confronto in kg come oggi;
  - senza, serve una riga d'ordine non annullata con lo stesso articolo, la stessa U.M. d'acquisto e quantità d'acquisto sufficiente.
- Le righe manuali restano scoperte.
- Rischio: il ciclo diventa verde per errore.
- Verifica: una ripartizione senza ordine resta 🔴; un ordine annullato torna 🔴.

**B8. `manage_inventory_purchase_evaluation`**: ha lo stesso controllo di copertura del semaforo, che viene allineato identico. Nessun altro cambiamento.

## C. Funzioni di Ordini, Consegne e Carico Merce (solo compatibilità)

**C1. `purchase_order_overview`**
- Oggi: somma `ordered_quantity`.
- Nuovo: somma solo i valori presenti e aggiunge «N righe senza equivalente».
- Rischio: basso.

**C2. `external_order_snapshot`**
- Oggi: invia al fornitore `ordered_quantity`.
- Nuovo: invia anche quantità e U.M. d'acquisto, con `ordered_quantity` vuota quando manca.
- Il link esterno mostrerà «3 cassette».
- Rischio: basso.

**C3. `delivery_comparison`**
- Oggi: dichiarato contro ordinato in U.M. di magazzino; il vuoto diventa 0.
- Nuovo: se l'ordinato è vuoto, lo stato della riga è «da verificare al Carico Merce», non inferiore o superiore.
- Rischio: basso.

**C4. `_delivery_open_core` — mi fermo qui, serve la tua decisione**
- Oggi: all'apertura di una consegna precompila la quantità dichiarata = ordinato − già dichiarato, **in U.M. di magazzino**. Le righe consegna non hanno un campo per l'U.M. d'acquisto.
- Senza equivalente non si può precompilare nulla di corretto.
  - Mettere 0 cambierebbe il significato: sembrerebbe «non arrivato».
  - Mettere 3 «cassette» nel campo kg è vietato.
- Opzioni:
  - **a)** In questo step le righe senza equivalente si aprono con dichiarata **vuota** e l'indicazione «ordinato: 3 cassette — inserire la quantità ricevuta». Richiede che la quantità dichiarata possa essere vuota fino all'invio: è un piccolo cambio di comportamento della Consegna.
  - **b)** Per ora un ordine con righe senza equivalente si può creare e inviare, ma la registrazione della consegna di **quelle righe** è rimandata allo step Carico Merce. Nessun cambio al Carico Merce adesso.

**C5. `confirm_goods_receipt` — collegata a C4**
- Oggi: confronta la somma ordinata con quella ricevuta per decidere «consegnato» o «parzialmente consegnato».
- Con righe senza equivalente, la somma in kg non è confrontabile.
- Proposta compatibile: le righe senza equivalente contano come consegnate quando esiste una ricezione confermata per quella riga, altrimenti l'ordine resta «parzialmente consegnato».
- Dipende dalla scelta a/b del punto C4.

## D. Interfaccia (minimo indispensabile)
- `shopping-list.functions.ts` e `shopping-list.ts`: nuovi campi facoltativi e tipi.
- `supplier-split-dialog.tsx`: quantità + U.M. d'acquisto per fornitore come dato principale, equivalente mostrato solo se esiste; niente più «rimanente» obbligatorio.
- `shopping-list-panel.tsx` e `use-shopping-list-extras.ts`: gestione dei valori vuoti.
- `purchase-order-detail.tsx`: mostra «3 cassette» e l'equivalente solo se c'è.
- Chi aggiunge alla lista (aggiunta prodotti, Fabbisogno, valutazione): nessun cambio, continuano a inviare la decisa come obiettivo.
- Nuove card: Step 1, da fare dopo.

## E. Verifiche finali
- Scenari del database in una transazione annullata, senza dati reali: Rossi 3 cassette con 8 kg; Bianchi 2 sacchi senza conversione; Rossi 3 cassette + 5 kg; riga manuale; conferma; ordini; semaforo con ordine annullato; confronto consegna.
- Controllo che la lista chiusa e l'ordine esistente leggano valori identici a prima.
- Controllo dei tipi, anteprima della Lista e del dettaglio ordine, sola lettura.

## Escluso
Card nuove, interfaccia ripartizioni multiple per fornitore, evento acquisto manuale, riprogettazione di Consegne e Carico Merce, invii, Inventario, Fabbisogno.
