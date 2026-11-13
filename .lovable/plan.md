# Lista della Spesa: conferma veloce dei prodotti «Non in lista»

## Stato della misura
La misura non e' partita: in modalita' piano non posso entrare nell'anteprima con l'utente 3 EMME (l'accesso richiede un'approvazione che qui non viene mostrata). Diventa il passo 1, eseguito appena il piano e' approvato, prima di qualsiasi modifica.

## Passo 1 - Misura (solo 3 EMME ROMA SRL, mai Trevi)
- Telefono simulato (402x725, CPU 4x) con rete Fast 3G, utente 3 EMME.
- Conferma di 3 prodotti «Non in lista»; la prima crea la Lista.
- Timeline per ogni conferma, in millisecondi:
  - creazione Lista (solo la prima);
  - add_catalog_product_to_own_products (solo se B2B non ancora tuo);
  - addShoppingListItems;
  - lettura id della riga;
  - letture di autoAssignItem (gruppo parallelo + passi in fila);
  - commit_shopping_list_item_quantity;
  - tempo totale in cui la card resta su «Salvataggio…» e quando la card successiva accetta il Conferma.
- Nessun invio a fornitori, nessuna generazione ordini. La Lista creata resta in 3 EMME (dato di prova autorizzato).
- Ti riporto le misure prima del passo 2; se i numeri contraddicono la diagnosi, mi fermo.

## Passo 2 - Correzione minima (stesso principio delle righe gia' in Lista)
1. Card liberata subito: al Conferma la card mostra la quantita' confermata, si chiude e il campo si svuota; nessuna attesa della catena.
2. Catena in sottofondo, in coda per prodotto: aggiunta prodotto -> riga in Lista -> salvataggio quantita' tramite la coda gia' esistente (vince l'ultimo valore, una sola commit_shopping_list_item_quantity).
3. Errore in qualsiasi passo: messaggio chiaro, la card torna «Non in lista» con la quantita' scritta ancora nel campo, per riprovare. Nessun dato a meta': se la riga e' stata creata ma la quantita' no, la riga resta vuota come oggi.
4. Chiamate in parallelo dove indipendenti: dopo l'inserimento la riga e' gia' nota, quindi la lettura dell'id viene eliminata (l'id arriva dall'inserimento) oppure eseguita insieme alle letture del salvataggio.
5. Prima conferma (creazione Lista): resta l'unico blocco condiviso, ma solo per la durata della creazione, non dell'intera catena.
6. Nessuna modifica al database, alle regole di autorizzazione o al calcolo delle quote.

## Dettagli tecnici
- `catalog-entries.tsx`, `CatalogProductCard.confirm`: non attendere piu' `onAdd`; chiusura e svuotamento immediati; `confirming` solo per il tempo di avvio; ripristino bozza tramite callback di errore.
- `shopping-list-panel.tsx`, `onAdd`: avvia la catena con `void`, usa una coda per chiave catalogo (createLatestQueue) per evitare doppie aggiunte dello stesso prodotto; segna il prodotto come «in salvataggio» in uno stato locale per mostrarlo subito come confermato; su errore ripristina `catalogValues`.
- `useCatalogActions.add`: evitare il select finale se `addShoppingListItems` restituisce gia' l'id (da verificare nel passo 1 leggendo la funzione); altrimenti metterlo in parallelo con le letture del worker.
- La ricarica finale resta quella unica in sottofondo (`createRefreshBatcher`).
- Test: aggiornare/aggiungere test puri per la coda per prodotto e per il ripristino su errore; eseguire i test della Lista.
- Regola aggiornata in `src/components/shopping/AGENTS.md`.
