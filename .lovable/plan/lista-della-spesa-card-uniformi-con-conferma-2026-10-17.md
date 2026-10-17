# Lista della Spesa — card uniformi con Conferma

## Cosa è emerso dal codice
Le tre scelte «Solo i preferiti», «Tutti i prodotti» e «Lista vuota» cambiano già soltanto i prodotti iniziali: non scelgono un modello diverso di card.

La differenza nasce invece dalla condizione del prodotto:
- **Già in Lista:** `ShoppingListCard` riceve `autoConfirm`; la quantità si salva e conferma uscendo dal campo, con Invio o con i tasti rapidi, e il pulsante Conferma è nascosto.
- **Da valutare dall’Inventario:** lo stesso componente riceve `pending` e mostra Conferma, con un percorso di inserimento diverso.
- **Non ancora in Lista:** `CatalogProductCard` ha un disegno separato e il pulsante Aggiungi.

Per questo una lista nuova, una già compilata e i prodotti non ancora inseriti possono apparire e funzionare diversamente, pur non essendo la scelta del menu la causa.

## Risultato richiesto
Un solo modello visivo e di inserimento, ispirato alla seconda foto: nome e immagine, informazioni e stato, campo **Quantità da acquistare** con U.M., pulsante **Conferma** sotto il campo, tasti rapidi sotto il pulsante. La parte fornitori e ripartizioni rimane nella card della Lista.

Le tre opzioni cambiano esclusivamente quali prodotti vengono inseriti inizialmente. La stessa esperienza vale anche per liste esistenti e prodotti aggiunti in seguito.

## Intervento proposto
1. **Uniformare la presentazione:** riusare una struttura comune per le card in Lista, da valutare e non ancora in Lista, senza copiare la logica dell’Inventario. Stati e informazioni restano reali: non mostrare ripartizioni inesistenti né attivare comandi che richiedono una riga non ancora creata.
2. **Conferma esplicita della quantità:** scrittura nel campo, cambio U.M. e +1/+3/+5/+10 preparano il valore; non confermano automaticamente all’uscita. Conferma salva il valore corrente con la sua U.M. e applica le regole esistenti delle quote. Invio nel campo esegue la stessa conferma.
3. **Dopo Conferma:** quantità e relativa U.M. risultano bloccate; una matita permette di modificarle e riconfermarle. Non bloccare indiscriminatamente i comandi fornitori: mantenere le protezioni attuali sulle ripartizioni e sui documenti già generati.
4. **Prodotti non ancora in Lista:** il pulsante ha lo stesso nome e posizione; internamente riusa l’aggiunta/adozione esistente e la conferma della Lista, con controlli contro doppio clic e duplicati. Nessuna creazione o adozione solo per mostrare una card.
5. **Conservare il lavoro:** in caso di errore la quantità inserita resta visibile per riprovare. Prima di cambiare lista o avviare Genera ordini, segnalare eventuali quantità modificate e non confermate: non trattarle come salvate né generare ordini usando silenziosamente un valore precedente.

## Protezioni e limiti
- Nessuna modifica a database, autorizzazioni, endpoint o Inventario.
- Non cambiare formule, conversioni, preferiti, memoria fornitori, deselezioni, quote manuali, acquisti diretti, stati o regole di generazione ordini.
- Le quantità già confermate restano confermate; liste chiuse e documenti rimangono immutabili.
- La quota separata Acquisto diretto conserva il salvataggio e le regole attuali: il nuovo Conferma riguarda la quantità totale da acquistare del prodotto.
- Nessuna pubblicazione, invio ordine o prova su dati operativi reali.

## Dettagli tecnici e file previsti
- `src/components/shopping/shopping-list-panel.tsx`: eliminare l’autoconferma degli eventi ordinari, gestire quantità/U.M. in modifica e conferma/sblocco espliciti.
- `src/components/shopping/shopping-list-card.tsx`: struttura comune, Conferma sotto il campo e matita per la modifica; blocco coerente di input, U.M. e tasti rapidi.
- `src/components/shopping/catalog-entries.tsx`: integrare la presentazione comune conservando i percorsi di adozione e aggiunta esistenti.
- Nuovi `src/components/shopping/shopping-quantity-editor.tsx` e `src/components/shopping/shopping-quantity-state.ts`: controlli condivisi e decisioni verificabili di modifica/conferma, senza logica inventariale.
- Nuovo `src/components/shopping/shopping-quantity-state.test.ts`: prove delle regole di conferma esplicita, blocco, modifiche non confermate e doppio clic.
- `src/components/shopping/AGENTS.md`: sostituire la regola di autoconferma con quella approvata; conferma delle righe già presenti sempre tramite la coda e `commit_shopping_list_item_quantity`, che salva quantità, conferma e quote in un’operazione. Non riattivare il vecchio percorso quantità → blocco → assegnazione con scritture separate.
- `AGENTS.md`: registrare il riuso dei controlli condivisi, senza duplicare le regole di acquisto.
- `roadmap.md`: avanzamento del solo intervento approvato.

Il percorso dei prodotti da valutare oggi conferma e poi propone i fornitori separatamente: non va esteso come alternativa al salvataggio atomico delle righe già in Lista. Se riusare le funzioni disponibili per un prodotto non ancora inserito richiedesse nuove garanzie nel database, fermarsi e proporre quel cambiamento separatamente, senza applicarlo in questa fase.

## Verifiche previste
- Test concreti: una modifica non conferma da sola; Conferma usa l’ultimo valore e U.M.; un doppio clic non avvia due conferme; card bloccata non modifica quantità; errore conserva la modifica.
- Test esistenti su preselezione, memoria fornitori, deselezioni e quote; nessuna prova di invio.
- Verifica visiva delle tre opzioni su dati fittizi/intercettati, sia prima sia dopo la conferma, e confronto con liste già esistenti. Card e vista Righe conservano gli stessi comandi.
- Controllo schermi stretti e larghi, assenza di sovrapposizioni e segnali automatici di errore.

**Attendo l’autorizzazione prima di modificare il codice.**