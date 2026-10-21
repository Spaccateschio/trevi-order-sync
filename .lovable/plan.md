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
- `src/components/shopping/shopping-list-ready-state.ts`: stato condiviso degli articoli disponibili per un nuovo acquisto, separato dallo storico.
- `src/components/shopping/shopping-list-ready-state.test.ts`: verificare disponibilità con ordini pendenti, quantità nuove senza copia delle precedenti e nessuna creazione alla sola apertura.
- `src/components/shopping/AGENTS.md`: documentare la separazione tra card disponibili, nuova lista e ordini pendenti.

## Verifiche e limiti
Test delle regole e controllo su cellulare e computer, con letture reali e simulazioni locali per le transizioni. Nessuna creazione di liste o ordini durante i controlli, nessun invio, ritiro o modifica di dati reali. Nessuna migrazione, pubblicazione o modifica di roadmap.md. Se i comandi esistenti richiedono interventi fuori dai file elencati, fermarsi e presentare l'integrazione prima di modificarli.
