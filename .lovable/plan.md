# Pulsante «Apri la Lista» nella finestra di scollegamento bloccata

## Cosa cambia
Quando la X (o «Scollega dal prodotto») viene bloccata perché il fornitore ha una quota salvata in un'altra Lista, la finestra mostra, accanto a ogni Lista dell'elenco, un pulsante **«Apri la Lista»**. Il pulsante chiude la finestra e apre la Lista della Spesa direttamente su quella Lista, dove puoi usare «Togli da questa Lista».

## Cosa non cambia
- Le regole del blocco restano quelle del database: niente scollegamento con quote in Liste aperte o confermate.
- Nessuna scrittura: il pulsante apre solo la pagina.
- Il pulsante compare anche nella finestra delle card già in Lista, perché la finestra è la stessa.

## Dettagli tecnici
- Si modifica solo `src/components/shopping/unlink-supplier-dialog.tsx`: per ogni voce di `blocked_lists` viene aggiunto un `Link` a `/acquisti/lista-spesa` con `search={{ lista: list_id }}`. Questo parametro la pagina lo accetta già e lo passa a `ShoppingListPanel` come `initialListId`.
- Al click la finestra viene chiusa (`onClose`).
