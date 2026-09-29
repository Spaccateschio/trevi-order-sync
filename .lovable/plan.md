# Step 2 — Modello dati Lista della Spesa: acquisto = quantità + U.M. + fornitore

Principio: la riga di acquisto vale «3 cassette → Rossi». I kg sono solo un equivalente teorico, calcolato quando esiste la conversione. La quantità reale che entra in magazzino la decide il Carico Merce.

## 1. Tabelle e colonne coinvolte oggi
- **shopping_list_items**
  - `unit_id/unit_code`: U.M. del prodotto.
  - `suggested_quantity`: suggerita dal sistema.
  - `decided_quantity`: obbligatoria, maggiore di 0.
  - `snapshot_*`: dati del Fabbisogno al momento dell'aggiunta.
- **shopping_list_item_suppliers** (ripartizioni)
  - Fornitore e articolo fornitore.
  - `assigned_quantity`: obbligatoria, maggiore di 0, nell'U.M. del prodotto.
  - `purchase_quantity`: facoltativa.
  - `purchase_unit_id/code` e `conversion_factor`.
  - Una sola riga per fornitore e prodotto.
- **purchase_order_items**
  - `ordered_quantity`: nell'U.M. del prodotto, somma delle ripartizioni.
  - `purchase_quantity/unit`: quantità e U.M. d'acquisto.
- **Chi legge queste quantità**
  - Consegne fornitore, confronto consegna e Carico Merce leggono `ordered_quantity`.
  - Il semaforo del ciclo (inventory_purchase_cycle_status) confronta la somma di `assigned_quantity` con gli ordini.

## 2. Colonne che cambierei
**Ripartizioni (shopping_list_item_suppliers)**
- `purchase_quantity`: diventa il dato principale. Obbligatoria, maggiore di 0, per le nuove righe.
- `purchase_unit_id`: diventa obbligatoria per le nuove righe e deve essere un'U.M. attiva dell'articolo di quel fornitore. Se la ripartizione non la indica, si usa l'U.M. predefinita dell'articolo; se non c'è nemmeno quella, l'U.M. del prodotto.
- `assigned_quantity`: diventa **facoltativa** e cambia significato: «equivalente teorico nell'U.M. di magazzino».
  - Si calcola nel database: se l'U.M. d'acquisto coincide con quella del prodotto, vale quanto la quantità d'acquisto; se esiste la conversione, vale quantità × fattore (es. 3 × 8 = 24 kg).
  - Se non si può calcolare, resta vuota.
- Nuova colonna `conversion_type` (esatta / indicativa), copiata dall'articolo, per sapere se l'equivalente è certo o solo stimato.

**Righe (shopping_list_items)**
- `decided_quantity`: diventa **facoltativa** e resta con il significato di oggi: «obiettivo nell'U.M. di magazzino». Il Fabbisogno e le liste storiche non perdono nulla.
  - Non vincola più la Conferma.
  - Se vuota, la card mostra la suggerita.
- Nuova colonna `purchase_mode`: `fornitore` (predefinito) oppure `manuale`. Per ora solo preparata, senza interfaccia: servirà per «Fornitore da definire / acquisto manuale».

Non servono tabelle nuove.

## 3. Funzioni del database da cambiare
- `assign_shopping_list_supplier`
  - Richiede quantità d'acquisto maggiore di 0 e controlla l'U.M. sull'articolo del fornitore.
  - Calcola da solo l'equivalente teorico; la quantità in kg non è più richiesta.
  - Resta compatibile: se arriva solo la quantità in kg (vecchia finestra), l'acquisto = kg nell'U.M. del prodotto.
- `shopping_list_item_state`: nuova regola di stato (punto 5). Legge l'U.M. **della ripartizione**, non quella del collegamento: corregge l'incoerenza trovata.
- `set_shopping_list_item_quantity`: accetta anche il vuoto (obiettivo non indicato); lo zero resta rifiutato fino allo step «quantità vuota/zero».
- `add_shopping_list_items`: non scarta più le righe senza quantità decisa (le salva vuote), così nessun prodotto sparisce.
- `manage_shopping_list` (conferma):
  - Blocca solo le righe `fornitore` che non hanno nessuna ripartizione valida.
  - Le righe `manuale`, e quelle esplicitamente escluse in futuro, non bloccano.
  - Nessuna quadratura in kg.
- `create_purchase_orders_from_list`
  - Ogni riga d'ordine = una ripartizione, con quantità e U.M. d'acquisto come dato principale.
  - `ordered_quantity` = equivalente teorico, se c'è; altrimenti la quantità d'acquisto (vedi punto 11).
- `inventory_purchase_cycle_status` e la valutazione del ciclo: la copertura si misura per ripartizione (esiste un ordine non annullato per quel fornitore e prodotto), non sulla somma dei kg. Il colore del semaforo resta con le stesse regole di oggi.

## 4. Frontend e server che dipendono oggi dalla quantità decisa
- `shopping-list.functions.ts`: validazioni della quantità decisa e dell'assegnazione.
- `shopping-list.ts`: tipi e calcolo di «traducibile».
- `shopping-list-panel.tsx`: campo quantità e avviso «assegnati X su Y».
- `supplier-split-dialog.tsx`: totale, rimanente, quantità in kg per fornitore.
- `use-shopping-list-extras.ts`: somma delle quantità assegnate.
- Chi aggiunge prodotti alla lista con la quantità decisa: `add-products-dialog.tsx`, `inventory-to-evaluate.tsx`, `inventory-requirements-panel.tsx`.

In questo step cambiano solo la finestra Ripartizione (quantità + U.M. per fornitore) e i testi di stato. Le card nuove restano allo Step 1, da fare dopo.

## 5. Nuovi stati
Per le righe `fornitore`:
- **Da assegnare**: nessuna ripartizione valida.
- **Assegnata**: almeno una ripartizione con fornitore attivo, quantità d'acquisto maggiore di 0 e U.M. abilitata per quel fornitore.
- **Parziale**: diventa solo un'**indicazione**, non un blocco. Compare quando la quantità decisa (obiettivo) esiste, tutte le conversioni ci sono, e l'equivalente totale è inferiore all'obiettivo. Esempio: «Assegnata · 24 kg su 30 kg obiettivo».

In più:
- Avviso «sotto il minimo del fornitore», come oggi.
- Le righe `manuale` avranno in futuro lo stato **Acquisto manuale**.

## 6. Ripartizione con conversione
«3 cassette → Rossi», con 8 kg/cassetta: salvati 3 + cassetta + Rossi, equivalente 24 kg e tipo di conversione. Nell'ordine si vede «3 cassette (≈ 24 kg)» oppure «= 24 kg» se la conversione è esatta.

## 7. Ripartizione senza conversione
«2 sacchi → Bianchi»: salvati 2 + sacco + Bianchi, equivalente vuoto. Riga valida, stato Assegnata, ordinabile. Il confronto con l'obiettivo mostra «equivalente non calcolabile», senza blocco.

## 8. Ordini esistenti e liste storiche
- Oggi ci sono 1 lista chiusa, 2 annullate e 1 riga d'ordine. Nessuna lista aperta o confermata.
- Nessun dato viene riscritto: le liste storiche restano come sono e sono già non modificabili.
- Gli ordini esistenti mantengono `ordered_quantity` e le loro righe. Consegne e Carico Merce continuano a leggerli come oggi.

## 9. Compatibilità con i dati esistenti
- Aggiornamento una tantum, solo su ripartizioni ancora senza quantità d'acquisto:
  - quantità d'acquisto = quantità assegnata;
  - U.M. d'acquisto = U.M. del prodotto, se manca.
  - Il significato non cambia: oggi quelle righe erano già in U.M. del prodotto.
- I controlli nuovi valgono solo per le righe nuove o modificate, così le righe storiche non vengono rifiutate.
- La vecchia chiamata «solo kg» continua a funzionare.

## 10. Preparazione a «Fornitore da definire» e quantità non compilata
- `purchase_mode = manuale` permette righe senza ripartizioni, che non bloccano la Conferma e non generano ordini.
- La quantità decisa facoltativa permette righe senza quantità. Il futuro avviso «N prodotti senza quantità» si basa su righe senza ripartizioni e senza quantità.
- Nel prossimo step la Conferma non andrà riscritta: sarà solo aggiunta l'interfaccia.
- Per gli acquisti manuali serviranno in futuro quantità e U.M. d'acquisto sulla riga stessa. Le aggiungerò allora, oppure già ora se preferisci: sono 2 colonne facoltative, senza effetti.

## 11. Uso futuro nel Carico Merce
- L'ordine dice «3 cassette». Il Carico Merce registra cosa arriva (es. 2 cassette) e il peso reale che entra in giacenza (es. 17,4 kg).
- L'equivalente teorico serve solo come proposta iniziale del peso.
- Se manca la conversione, il peso si scrive a mano al carico.
- `ordered_quantity` resta per compatibilità con le consegne attuali. Quando manca la conversione, conterrà la quantità d'acquisto nell'U.M. d'acquisto, con l'U.M. dell'ordine allineata, così i confronti di consegna non mescolano U.M. diverse.
- La revisione completa di Consegne e Carico Merce sarà uno step dedicato.

## Cosa NON viene toccato
Inventario, giacenza, semaforo (stesse regole di colore), Fabbisogno, Prodotti, Fornitori, card nuove (Step 1), invii.

## Verifica
- Controlli sul database solo in lettura.
- Prova delle funzioni con scenari sui casi 3 cassette Rossi + 2 sacchi Bianchi, con e senza conversione, eseguiti in una transazione annullata: nessun dato reale resta salvato.
- Controllo dei tipi e della finestra Ripartizione nell'anteprima.
