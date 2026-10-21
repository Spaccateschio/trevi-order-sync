# Articoli sempre visibili e nuovi acquisti senza attendere il ritiro

## Risultato richiesto
- Le card restano visibili anche senza una lista aperta e mentre altri ordini attendono il ritiro, rispettando Preferiti/Tutti e ricerca.
- Non occorre premere «Nuova lista» solo per vedere gli articoli: si possono inserire le quantità del prossimo acquisto direttamente dalle card.
- Dopo l'invio, gli articoli restano disponibili con quantità nuove da inserire: quelle dell'ordine precedente non vengono copiate né modificate.
- L'avviso ORD resta visibile fino al ritiro, ma è soltanto un riferimento agli ordini precedenti, non un blocco per nuovi acquisti.
- L'inventario resta facoltativo; il suo riquadro resta riapribile. Nessun ritorno dei testi rimossi.

## Integrità dei dati
La lista già inviata resta immutabile. La visualizzazione delle card non crea liste automaticamente; al primo salvataggio esplicito del nuovo acquisto si utilizza la creazione della lista tramite i comandi già autorizzati. Nessuna nuova regola per ordini, ricezioni o conversioni.

## File previsti
- `src/components/shopping/shopping-list-panel.tsx`: togliere il blocco legato al ritiro e mostrare le card anche senza lista attiva, mantenendo i comandi esistenti.
- `src/components/shopping/catalog-entries.tsx` (integrazione da approvare): le card dei prodotti non ancora in lista usano questo file; mantenere anche per loro la vista compatta sul cellulare, l'apertura singola e la conferma esplicita. Gli articoli B2B continuano a usare il percorso esistente di aggiunta, senza copie alla sola visualizzazione.
- `src/components/shopping/shopping-list-ready-state.ts`: stato condiviso degli articoli disponibili per un nuovo acquisto, separato dallo storico.
- `src/components/shopping/shopping-list-ready-state.test.ts`: verificare disponibilità con ordini pendenti, quantità nuove senza copia delle precedenti e nessuna creazione alla sola apertura.
- `src/components/shopping/AGENTS.md`: documentare la separazione tra card disponibili, nuova lista e ordini pendenti.

## Verifiche e limiti
Test delle regole e controllo su cellulare e computer, con letture reali e simulazioni locali per le transizioni. Nessuna creazione di liste o ordini durante i controlli, nessun invio, ritiro o modifica di dati reali. Nessuna migrazione, pubblicazione o modifica di roadmap.md. Se i comandi esistenti richiedono interventi fuori dai file elencati, fermarsi e presentare l'integrazione prima di modificarli.

## Analisi effettuata prima dell'intervento
- Il pannello nasconde l'area prodotti quando non esiste una lista e il riquadro inventario non è aperto; inoltre disattiva il caricamento dei prodotti disponibili fuori da lista/inventario. Non basta rimettere il pulsante «Nuova lista».
- La creazione al salvataggio deve distinguere la nuova lista ordinaria dalla lista collegata all'inventario: il percorso attuale `ensureInventoryList` richiede una sessione d'inventario e non è adatto a un nuovo acquisto indipendente.
- Le definizioni effettive di `manage_shopping_list` e `generate_supplier_order` non impongono l'attesa di ricezione degli ordini precedenti; la generazione blocca e verifica la lista corrente e usa una chiave per evitare duplicati, non il fornitore globalmente.
- La chiusura automatica della lista verifica la copertura degli acquisti e l'assenza di bozze; non richiede che gli ordini inviati siano ricevuti. Nessuna modifica SQL proposta.
- Le quantità nuove sono inizialmente vuote, equivalenti a nessun acquisto: nessun INSERT/UPDATE con quantità zero, nessun azzeramento delle righe precedenti.
