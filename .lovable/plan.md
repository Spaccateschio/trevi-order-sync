# Acquisto diretto esplicito nella Lista della Spesa (Opzione A)

Principio: **assenza di assegnazione ≠ acquisto diretto**. L'acquisto diretto nasce solo dalla quota scelta dall'utente in `shopping_list_items.manual_purchase_*`. `purchase_mode` resta com'è, senza nuovo significato.

## Regola di completezza della riga (unica, usata da stato, anteprima e chiusura)

Quantità da acquistare Q (con l'U.M. della riga). Quote = somma delle quote fornitore (`shopping_list_item_suppliers`) + quota diretta (`manual_purchase_quantity`).

| Caso | Stato | Chiusura |
|---|---|---|
| Q vuota o ≤ 0 | Quantità mancante | bloccata |
| nessuna quota fornitore e nessuna quota diretta | Da assegnare | bloccata |
| U.M. di una quota (fornitore o diretta) non confrontabile con quella della riga, o quota fornitore senza quantità | Da verificare | bloccata |
| quote < Q | Parziale — N da assegnare | bloccata |
| quote = Q | Assegnata | ok |
| quote > Q | Da verificare (supera la quantità) | bloccata |

Confrontabile = stessa U.M. (stesso id, oppure stesso codice scritto a mano), come oggi. Nessuna conversione nuova.

## Modifiche

| Funzione / file | Contenitore letto | Contenitore scritto | Comportamento attuale | Comportamento nuovo |
|---|---|---|---|---|
| **Nuova** `set_shopping_list_direct_quota(_company_id, _item_id, _quantity, _unit_id, _unit_code)` (DB) | shopping_lists, shopping_list_items, shopping_list_item_suppliers | shopping_list_items.manual_purchase_quantity / _unit_id / _unit_code, audit_events | non esiste: nessuno scrive questi campi | solo lista aperta, membro dell'azienda della lista; quantità > 0 oppure vuota (= rimuove la quota); rifiuta se quote fornitore + diretta superano Q (quando confrontabili); scrive audit |
| `shopping_list_item_state` (DB) | shopping_list_items, shopping_list_item_suppliers | — | `manuale` se purchase_mode; altrimenti da_assegnare/parziale/assegnata solo sulle quote fornitore | aggiunge la quota diretta al conteggio; nuovo stato `da_verificare`; `purchase_mode` non decide più nulla; restituisce anche la quota diretta |
| `_shopping_list_close_plan` (DB) | shopping_list_items, shopping_list_item_suppliers | — | nessuna quota → `direct_whole`; resto → `direct_residual`; dubbi → `uncertain` | tipi: `missing`, `unassigned`, `partial`, `uncertain`, `ordered`. Una riga può avere quota diretta **e** quote fornitore: la quota diretta esce come voce `direct` separata, mai calcolata per differenza |
| `shopping_list_close_preview` (DB) | _shopping_list_close_plan, shopping_list_item_suppliers | — | elenchi missing / direct (dedotti) / uncertain / orders | elenchi: missing, **unassigned**, **partial** (con quantità mancante), uncertain, **direct** (solo quote esplicite), orders |
| `close_shopping_list` (DB) | _shopping_list_close_plan | shopping_lists, shopping_list_direct_purchases, purchase_orders, purchase_order_items, audit_events | chiude anche con righe non assegnate (le trasforma in diretti) e uncertain (`da_verificare`) | blocca se ci sono missing / unassigned / partial / uncertain; copia in shopping_list_direct_purchases **solo** manual_purchase_* con origin `esplicito`; ordini dalle quote fornitore come oggi |
| `manage_shopping_list` / `inventory_purchase_cycle_status` / `create_purchase_orders_from_list` (DB) | — | — | leggono purchase_mode | verifico che restino coerenti; nessun cambio se non serve (te lo indico prima) |
| `src/lib/shopping-list.functions.ts` | — | — | — | nuova `setShoppingListDirectQuota` (POST, utente autenticato, RPC con context.supabase); tipo ClosePreview aggiornato |
| `src/lib/shopping-list.ts` | — | — | ItemStatus senza da_verificare | aggiunge `da_verificare` e la quota diretta nei tipi/etichette |
| `src/components/shopping/card-suppliers.tsx` | stato riga | via setShoppingListDirectQuota | «Acquisto diretto» mostra solo un messaggio | apre un campo «Acquisto diretto: quantità + U.M.» (U.M. proposta = quella della riga), salva, rimuovi |
| `src/components/shopping/supplier-split-dialog.tsx` | quote | — | «rimanente» = Q − quote fornitore | rimanente = Q − quote fornitore − quota diretta; mostra la riga «Acquisto diretto» |
| `src/components/shopping/shopping-list-panel.tsx` (solo badge stato riga e contatori) | stato riga | — | 3 stati + manuale | aggiunge Da verificare; Parziale mostra «N da assegnare» |
| `src/components/shopping/close-list-dialog.tsx` | anteprima | — | sezioni Consegna, Ordini, Acquisti diretti (dedotti), Da verificare | sezioni: Ordini fornitori, Acquisti diretti scelti, **Da assegnare**, **Parziali**, Da verificare (con link alla riga); «Conferma e genera» disattivato se una delle ultime tre non è vuota |
| `src/components/shopping/AGENTS.md` | — | — | — | una regola: acquisto diretto solo da quota esplicita manual_purchase_*, mai dedotto |
| test `src/lib/shopping-list-state.test.ts` (nuovo) | — | — | — | regole: 8 = 3+2+3 assegnata; 3+2 su 8 parziale 3; nessuna quota da assegnare; U.M. diverse da verificare |

Non tocco: product_supplier_links, Inventario, giacenza, Carico merce, Ordini già creati, storico liste chiuse (le loro righe `intero/residuo/da_verificare` restano come sono).

## Migrazione database (una sola)

1. Vincolo `direct_purchases_origin_check`: oggi accetta solo `intero`, `residuo`, `da_verificare` → **va esteso** aggiungendo `esplicito` (i valori vecchi restano validi per lo storico). Il vincolo sulla quantità già richiede > 0 per tutto tranne `da_verificare`: va bene così.
2. Vincolo esistente `manual_qty_check` (quantità > 0 o vuota): già adatto, nessuna modifica.
3. Nuova funzione `set_shopping_list_direct_quota`: SECURITY DEFINER, search_path=public, controllo azienda/lista aperta via auth.uid(), REVOKE a PUBLIC/anon, GRANT a authenticated.
4. `CREATE OR REPLACE` di `shopping_list_item_state`, `_shopping_list_close_plan`, `shopping_list_close_preview`, `close_shopping_list` con le nuove regole (stesse firme dove possibile).
5. Commento sulla colonna `purchase_mode`: «non usato per dedurre acquisti diretti».

Nessuna nuova tabella, nessuna colonna eliminata o rinominata, nessun dato modificato.

## Effetto sulle liste aperte di oggi
Le righe senza fornitore (es. POMODORI CILIEGINO IT) diventano **Da assegnare** e bloccano la chiusura finché scegli un fornitore o una quota diretta.
