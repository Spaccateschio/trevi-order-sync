# Lentezza conferma quantità nella Lista della Spesa — diagnosi e correzione minima

## Diagnosi (verificata sul codice e sul database reale)

### 1. Cosa succede alla conferma
Percorso: `toggleLock` → `commitQuantity` → coda per riga `commitQueue` → `workerRef.current` in `src/components/shopping/shopping-list-panel.tsx` (righe ~1114–1206). Chiamate tutte **in sequenza**, ognuna è un viaggio di rete browser → database:

1. lettura `shopping_list_items` (quantità, blocco, U.M.)
2. lettura `shopping_list_item_suppliers.updated_at` (versione quote)
3. `autoAssignItem` (`src/lib/shopping-auto-assign.ts`, `run`):
   - rilegge **di nuovo** la stessa riga `shopping_list_items` (doppione del punto 1)
   - 6 letture in parallelo: `shopping_list_item_suppliers`, RPC `product_supplier_overview`, RPC `shopping_item_supplier_units`, `company_product_supplier_favorites`, `products.stock_unit_id`, `product_direct_purchase_preferences`
   - poi in sequenza, secondo il caso: `readLinksInTime` (2 letture una dopo l'altra: `shopping_lists.delivery_date`, poi `product_supplier_links`), `readConversions`, `purchase_order_items` (solo se ci sono quote), `readMemories` (2 letture), `product_supplier_links.preferred_set_at`
4. server function `commitShoppingListItemQuantity` (`src/lib/shopping-list.functions.ts`) → RPC `commit_shopping_list_item_quantity` (passaggio in più browser → server → database)
5. attende il ricaricamento di `shopping-list-overview`, `shopping-extras-assignments`, `shopping-list-assignments`
6. nel `finally` attende **un secondo** ricaricamento: `shopping-extras-locks` + `refresh()` = `shopping-lists`, di nuovo `shopping-list-overview`, di nuovo `shopping-extras-assignments`, stato ciclo `inventory-cycle`

Totale tipico: **10–13 viaggi di rete in fila** per ogni riga.

### 2. Ricarica dell'intera lista
Sì. Dopo ogni conferma si ricarica tutta la RPC `shopping_list_overview` (tutte le 119 righe della lista aperta più grande) **due volte di seguito**, più elenco liste e stato del ciclo. Nessun aggiornamento della sola riga.

### 3. Trigger e funzioni lato database
- Trigger su `shopping_list_items`: solo `assert_shopping_list_open` e `set_updated_at`; su `shopping_list_item_suppliers`: `assert_shopping_list_open`, `assert_assignment_purchase_data`, `set_updated_at`. Leggeri, nessun ricalcolo su tutta la lista.
- `commit_shopping_list_item_quantity` (SECURITY DEFINER) richiama `set_shopping_list_item_quantity_lock` e `shopping_list_item_state` solo sulla riga: nessun ciclo su tutta la lista né controlli di acquistabilità per ogni prodotto.

### 4. Campo bloccato durante il salvataggio
Sì. `savingIds` disattiva campo quantità (riga ~1009), «Conferma» e «Non acquistare» (`shopping-list-card.tsx` riga 704, `lockPending`) finché non finiscono **anche i due ricaricamenti** (il `finally`). Nessun aggiornamento ottimistico.

### 5. Tempi misurati (EXPLAIN ANALYZE, dati reali, sola lettura)
| Lettura | Tempo |
|---|---|
| riga `shopping_list_items` | 1,2 ms |
| versioni quote `shopping_list_item_suppliers` | 6,9 ms |
| `product_supplier_links` del prodotto | 2,4 ms |
| `company_product_supplier_favorites` | 1,2 ms |
| `product_direct_purchase_preferences` | 1,2 ms |
| memoria ultima Lista chiusa | 1,4 ms |
| `purchase_order_items` per quote | 0,1 ms |
| tutte le 119 righe della lista | 1,4 ms |
| tutte le quote della lista | 0,2 ms |

Statistiche del database: le letture della Lista hanno media 1–14 ms. Le RPC (`shopping_list_overview`, `commit_shopping_list_item_quantity`, ecc.) non posso lanciarle con EXPLAIN ANALYZE (il mio accesso in lettura non può eseguire funzioni) e non compaiono tra le 100 operazioni più costose del database.

**Conclusione:** il database è veloce, **nessun indice manca** (le scansioni complete sono su tabelle di 86–119 righe). I secondi di attesa nascono dai 10–13 viaggi di rete in fila più i due ricaricamenti completi, con il campo bloccato per tutto il tempo.

## Piano di correzione (modifiche minime)

1. **Aggiornamento ottimistico della riga**: alla conferma la riga mostra subito quantità e stato confermato nella cache di `shopping-list-overview`, la card si chiude e il campo successivo è subito usabile. Il salvataggio continua in coda per quella riga (un piccolo indicatore «salvataggio…»). Se il database rifiuta: la riga torna com'era, la bozza resta nel campo, messaggio d'errore come oggi.
2. **Niente ricarica totale in attesa**: un solo ricaricamento in sottofondo, non atteso e senza doppioni (overview + quote della sola riga + blocchi); elenco liste e stato ciclo solo quando cambiano davvero (prima quantità della lista / ultima riga), non a ogni riga.
3. **Letture in parallelo e senza doppioni**: le letture dei punti 1 e 2 partono insieme; la riga già letta viene passata ad `autoAssignItem` invece di rileggerla; `readLinksInTime`, `readMemories` e `preferred_set_at` partono in parallelo quando indipendenti.
4. **Nessun indice nuovo** e nessuna modifica al database: la misura non lo giustifica.

Restano invariati: una sola `commit_shopping_list_item_quantity` per salvataggio (regola del progetto), controlli del database, coda per riga «vince l'ultimo valore», regole fornitori/stelle/memoria, Non acquistare.

## Dettagli tecnici
- File: `src/components/shopping/shopping-list-panel.tsx` (worker, `toggleLock`, `savingIds`), `src/lib/shopping-auto-assign.ts` (opzione `item` già letto, parallelismo), eventualmente `src/components/shopping/shopping-list-card.tsx` solo per l'indicatore.
- Nuova funzione pura per applicare/annullare la modifica ottimistica alla riga, con test (conferma, rifiuto con ripristino, valore più recente in coda che vince).
- Verifica: test esistenti della Lista + prova in anteprima solo su 3 EMME ROMA SRL, misurando il tempo tra conferma e campo successivo utilizzabile prima e dopo.
