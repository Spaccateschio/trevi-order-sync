# Lista della Spesa: causa misurata dei 3 secondi e correzione minima

## Misure dal vivo (3 EMME, lista «Straordinaria 12/11», telefono 390x844, rete Fast 3G)
Prove su BANANE COSTARICA (3 kg, poi riportata a 2 kg) e scrittura su AVOCADO HASS KG (campo poi svuotato, nulla salvato).

### Rete (una conferma)
- 0,09 s: 2 letture in parallelo (riga + quote), ~0,6 s
- 0,71 s: 8 letture in parallelo (fornitori, U.M., preferiti, prodotto, preferenza diretta...), ~0,8 s
- 1,46–1,53 s: 2 letture (memoria/quote, righe d'ordine), ~0,6 s
- 2,13 s: salvataggio unico `commit_shopping_list_item_quantity`, 0,6 s
- 2,73 s: ricarica unica in sottofondo (riepilogo lista, quote, righe), 0,6 s
- Nessuna di queste richieste blocca la riga successiva: la card si chiude dopo 0,10 s e la card successiva è subito scrivibile. Solo la riga confermata resta bloccata per circa 3 s (fino a fine salvataggio).

### Disegno dello schermo (separato dalla rete)
- Computer veloce: ogni cambiamento sullo schermo (tasto premuto, conferma, apertura card, arrivo della ricarica) ridisegna tutta la lista (63 card), con blocchi di 280–300 ms.
- Telefono simulato (processore 4 volte più lento, come uno smartphone medio): ogni blocco dura **1,1–1,4 s**, fino a 2,9 s. Con la conferma la card si chiude dopo 1,37 s; la card successiva risponde solo a 2,75 s; ogni cifra digitata dopo appare con 1,3 s di ritardo.
- La ricarica in sottofondo non fa perdere il punto di scrittura né il valore (8 cifre su 8 conservate, campo sempre attivo), ma aggiunge un altro blocco di ~1,3 s.

## Causa precisa
Non è più la rete: è il **ridisegno dell'intera lista a ogni cambiamento**. In `shopping-list-panel.tsx` ogni card (`ShoppingListCard`) riceve funzioni ricreate a ogni disegno (onToggleLock, onClearQuantity, onFixUnit, onUnitChange...) e non è memorizzata, quindi un tasto o una conferma su una riga ridisegna tutte le 63 card. Su telefono: conferma (~1,3 s) + apertura della card dopo (~1,3 s) ≈ i 3 secondi segnalati.

## Correzione minima (solo presentazione, nessuna modifica a dati o database)
1. `ShoppingListCard` avvolta in `React.memo`.
2. Comandi della card resi stabili: un solo gestore per tipo, con riferimento sempre aggiornato (useRef/useCallback), che riceve la riga; la card li chiama con il proprio item_id.
3. Alla card si passano solo i valori della sua riga (bozza, U.M. scelta, bloccata, in salvataggio, memoria), non le mappe intere; la patch della riga già sostituisce solo la riga cambiata (le altre restano gli stessi oggetti).
4. Invariati: coda per riga, una sola `commit_shopping_list_item_quantity`, aggiornamento ottimistico, ricarica unica in sottofondo, regole di fornitori/stelle/memoria.
5. Verifica: stessa misura con processore 4 volte più lento; obiettivo: digitazione e conferma sotto 150 ms; test della Lista esistenti.
