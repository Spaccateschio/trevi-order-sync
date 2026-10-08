# Riallineamento stati ed etichette delle card della Lista

Sono interessate solo le etichette e i badge. Nessuna modifica a database, U.M., quantità suggerita, giacenza, ordini o assegnazione fornitori.

## 1. Stato di valutazione dell'Inventario (card prodotti contati, non ancora in Lista)
La fonte ufficiale diventa `inventory_purchase_evaluation_items`:
- prodotto contato senza riga salvata, oppure status = da_valutare → **DA VALUTARE**
- status = da_acquistare → **DA ACQUISTARE · {decided_quantity} {U.M.}** (quantità salvata)
- status = non_acquistare → **NON ACQUISTARE** (non mostra più DA VALUTARE)
- se il prodotto ha una riga in `shopping_list_items` della lista → **IN LISTA** (ha la precedenza)

## 2. Card già in Lista
Restano **IN LISTA** + DA ASSEGNARE / PARZIALE / ASSEGNATA, calcolati solo da `shopping_list_item_suppliers` (regola attuale invariata).

## 3. Card non in Lista (catalogo)
Al posto di «Senza fornitore»:
- prodotto B2B → **Catalogo B2B · {venditore}**
- prodotto proprio con collegamenti → nomi dei fornitori collegati (oltre 2: «N fornitori collegati»)
- prodotto proprio senza collegamenti → **Nessun fornitore collegato**
Il badge «Non in lista» resta. Stessa dicitura nel dialog «Aggiungi prodotti».
Il filtro «Senza fornitore» nella Lista diventa «Nessun fornitore assegnato» per le card in Lista e «Nessun fornitore collegato» per quelle del catalogo; non cambia il comportamento del filtro.

## 4. Origini
`products.origin` non diventa un badge. `shopping_list_items.origin` resta solo l'origine della riga; nessuna nuova etichetta.

## File
- src/components/shopping/shopping-list-card.tsx — nuova prop `evaluationStatus` + quantità salvata nel badge
- src/components/shopping/shopping-list-panel.tsx — passa lo stato salvato alla card, etichetta filtro
- src/components/shopping/catalog-entries.tsx — etichetta fornitore/catalogo
- src/components/shopping/add-products-dialog.tsx — stessa etichetta
- src/lib/card-labels.ts (nuovo) + test — regole delle etichette

## Verifica finale
Esempi reali a schermo e da database per: DA VALUTARE, DA ACQUISTARE (AGLIO 10 se ancora valutabile), NON ACQUISTARE (ALLORO), IN LISTA · DA ASSEGNARE, prodotto B2B non in Lista, prodotto proprio senza fornitore collegato, con il contenitore/campo che alimenta ciascun badge.
