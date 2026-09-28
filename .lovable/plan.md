# Inventario → Prodotti da valutare → Lista della Spesa

## Idea chiave: nessun ID "momentaneo", il contesto si ricava dai dati già salvati
Non serve ricordare nel browser quale inventario hai appena finito: il database lo sa già.
- L'ultimo inventario **completato** (data di chiusura più recente) e i suoi conteggi sono salvati in modo permanente.
- La Lista della Spesa legge ogni volta questi dati e mostra i prodotti "da valutare".
- Quindi aggiornare la pagina, chiudere Chrome, tornare dopo un'ora o aprire da un altro dispositivo/utente dà **sempre lo stesso risultato**. Nessuna tabella nuova.

## Regole
- **Lista corrente** = Aperta, oppure Confermata non ancora Chiusa. **Storico** = Chiusa o Annullata; mai selezionata da sola.
- **Prodotti da valutare** = prodotti dell'ultimo inventario completato **non ancora presenti** nella Lista corrente.
- Ogni prodotto da valutare mostra: foto, codice, descrizione, categoria, quantità contata + U.M. del conteggio, giacenza risultante (se disponibile), campo "Da acquistare" **vuoto**.
- Vuoto = non deciso, mai 0. Nessuna quantità creata automaticamente.
- Scrivendo una quantità > 0 e premendo "Aggiungi", si usa la funzione esistente di aggiunta: il prodotto diventa riga reale della Lista e sparisce dal riquadro "da valutare".
- Il riquadro è modificabile solo se la Lista corrente è Aperta.

## Casi all'arrivo sulla Lista
1. **Esiste una Lista corrente** → avviso "Esiste già una Lista della Spesa in lavorazione" con data/ora, numero prodotti e stato.
   - Scelta principale: **Continua questa Lista e valuta i prodotti dell'inventario** (si apre la Lista con il riquadro sopra, nessun inserimento automatico).
   - Se è Confermata: si spiega che per aggiungere prodotti va prima riaperta/gestita con le operazioni già esistenti; nessuna seconda Lista creata in automatico.
   - L'avviso compare solo arrivando da "Termina inventario" (indicazione nella navigazione, solo per mostrare l'avviso; i dati non dipendono da essa).
2. **Nessuna Lista corrente, esiste un inventario completato non ancora valutato** → "Inventario del 28/09 completato · 6 prodotti controllati" + **Crea Lista della Spesa da questo inventario** (usa la creazione già esistente, lista vuota) e sotto i 6 prodotti da valutare.
3. **Nessuna Lista corrente e nessun inventario** → "Nessuna Lista in lavorazione" + "+ Nuova lista" e, separato, "Storico".

## Limite da decidere (unico punto dove il database potrebbe servire)
Senza modifiche dati, il riquadro scompare solo quando: il prodotto viene aggiunto, la Lista viene Chiusa/Annullata e ne nasce una dopo l'inventario, oppure arriva un inventario più nuovo.
Non è possibile salvare per tutti gli utenti "questo prodotto l'ho valutato e non lo compro" (es. patate lasciate vuote restano visibili). Opzioni:
- A) accettarlo: i vuoti restano visibili finché la Lista è in lavorazione (coerente con "vuoto = non deciso");
- B) pulsante "Nascondi" salvato solo su questo dispositivo;
- C) piccola modifica dati per salvare "valutato, non acquisto" condivisa tra dispositivi.
Consiglio A per ora.

## Cosa non cambia
Inventario chiuso, conteggi, giacenze, Fabbisogno, ordini, database e server.

## Dettagli tecnici
- `inventory-count-panel.tsx`: la navigazione dopo chiusura aggiunge `?daInventario=<sessionId>` (solo per l'avviso).
- `acquisti.lista-spesa.tsx`: `validateSearch` per `daInventario`.
- `shopping-list-panel.tsx`: selezione automatica solo di liste correnti; stato "Nessuna Lista in lavorazione"; selettore Storico separato; dialog avviso lista esistente.
- Nuovo `inventory-to-evaluate.tsx`: query in sola lettura su `inventory_sessions` (status completata, ultima per `finished_at`) + `inventory_count_entries` + giacenza tramite funzione esistente; esclude i prodotti già nella lista; aggiunta con `addShoppingListItems` (origin "manuale", decided_quantity > 0).
