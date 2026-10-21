# Ripristinare la visibilità delle quantità confermate

## Problema verificato in sola lettura
La lettura della lista aperta restituisce quantità positive salvate, fra cui 3, 5, 15 e 19. Sul cellulare, invece, compaiono soltanto card «Non in lista» con «Da acquistare —».

Il codice dà precedenza all'anteprima dell'inventario ancora da valutare e può quindi non selezionare nessuna lista, anche quando esiste una lista aperta. Questo spiega la discordanza osservata: non è una trasformazione delle quantità positive in «Non acquistare».

## Correzione limitata, solo in anteprima
1. Mantenere la scelta esplicita della lista e il collegamento a un inventario in lavorazione; in loro assenza mostrare la lista aperta già esistente, anche se un vecchio inventario è ancora da valutare.
2. Mostrare sulle relative card il numero e l'U.M. già salvati, senza recuperare quantità da liste chiuse o ordini inviati.
3. Conservare la regola: solo 0 + Conferma significa «Non acquistare»; una quantità positiva confermata resta positiva; campo vuoto non equivale a zero.

## File autorizzabili
- `src/components/shopping/shopping-list-panel.tsx`: correggere esclusivamente la selezione della lista mostrata.
- `src/components/shopping/shopping-list-selection.ts` (nuovo): isolare la precedenza delle liste per verificarla.
- `src/components/shopping/shopping-list-selection.test.ts` (nuovo): verificare lista aperta con inventario precedente pendente, scelta esplicita, inventario collegato e assenza di liste aperte.
- `src/components/shopping/shopping-quantity-state.test.ts`: verificare che zero, quantità positiva e campo vuoto restino distinti.
- `src/components/shopping/AGENTS.md`: documentare la precedenza verificata.

## Verifiche e limiti
Test mirati e controllo in sola lettura su cellulare e computer che i numeri ricevuti siano mostrati sulle card. Nessuna conferma, creazione di lista, modifica di dati reali, ordine, ritiro, migrazione, modifica dei filtri, stampa, avviso ORD, roadmap o pubblicazione.

Attendere conferma prima di modificare il codice.