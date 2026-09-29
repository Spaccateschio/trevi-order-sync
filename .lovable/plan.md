# Lista della Spesa: si apre subito sui prodotti

## Come funziona oggi (verificato nel codice)
- La pagina mostra in automatico la prima lista **Aperta** (o, se non c'è, la prima **Confermata**).
- Se c'è un inventario completato da valutare e nessuna lista collegata, compare solo il riquadro con il pulsante «Crea Lista della Spesa da questo inventario». Il pulsante fa due cose: crea una lista nuova e la collega all'inventario («presa in carico»).
- Solo dopo si vedono i prodotti contati, ognuno con il suo campo quantità.
- «+ Nuova lista» crea sempre una lista vuota. Il database permette più liste aperte insieme, ma la pagina ne mostra una sola: la più recente.
- Le card prodotto dello Step 1 **non sono ancora state costruite**: oggi la lista è una tabella compatta, oppure un elenco sotto il riquadro inventario.

## Proposta (la più sicura)

### Caso 1 — c'è una lista aperta
La pagina apre subito quella lista e i suoi prodotti. È già così: cambio solo l'ordine della schermata (piccolo riferimento «Da inventario …», poi barra filtri, poi prodotti).

### Caso 2 — nessuna lista, ma un inventario completato da valutare
- La pagina mostra **subito** i prodotti dell'inventario, **solo leggendoli**: nessuna lista viene creata aprendo la pagina.
- In alto un riferimento piccolo: «Da inventario 28/09/2026 · 06:43 — non ancora preso in carico».
- La lista viene creata e collegata all'inventario **solo alla prima azione reale** su un prodotto: scrivere e confermare una quantità, oppure aggiungere un prodotto. In quel momento, con un solo gesto, il sistema usa le stesse funzioni di oggi, nell'ordine attuale: crea la lista, la prende in carico, salva la quantità.
- Se esci senza fare nulla non resta nessuna lista fantasma e il semaforo non cambia.
- Il pulsante «Crea Lista della Spesa da questo inventario» sparisce.

### «+ Nuova lista» (lista straordinaria)
- Resta. Crea una lista **non collegata** a nessun inventario, per acquisti immediati (limoni, basilico, cipolle).
- Non prende in carico l'inventario e non cambia il semaforo.
- Punto da decidere: se esistono sia la lista dell'inventario sia una lista straordinaria, serve un modo semplice per passare dall'una all'altra. Proposta: il selettore liste in alto le mostra entrambe con un'etichetta («Da inventario 28/09» / «Straordinaria»). All'apertura della pagina viene scelta per prima quella dell'inventario.

### «+ Aggiungi prodotto»
- Aggiunge prodotti alla lista in uso, senza toccare quantità o modifiche già inserite.
- Nel Caso 2, se la lista non esiste ancora, la crea e la prende in carico come descritto sopra.

## Cosa NON cambia
Database, funzioni del server, semaforo, Inventario, Fabbisogno, Ordini, Consegne, Carico Merce. Nessun dato di prova.

## Dettagli tecnici
- File: `shopping-list-panel.tsx`, `inventory-to-evaluate.tsx`.
- Lettura in anteprima: la stessa query sui conteggi della sessione già usata da `InventoryEvaluation`.
- La creazione alla prima azione riusa `manageShoppingList('open')` → `manageInventoryEvaluation('take')` → `addShoppingListItems`. Un blocco impedisce doppie creazioni con clic ripetuti.
- La scelta della lista corrente dà precedenza a quella con `cycle.list_id`.
- Le righe restano nell'aspetto attuale finché non costruiremo le card dello Step 1. Questa modifica prepara il posto dove le card andranno.
