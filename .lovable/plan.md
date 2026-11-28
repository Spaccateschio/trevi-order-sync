# Correzione «Apri» da «Tutte le liste» per liste scaricate da Danea

## Cosa succede oggi
- «Apri» in `/acquisti/lista-spesa/storico` porta a `/acquisti/lista-spesa?lista=<id>`; l'id diventa la lista scelta (`initialListId` → `listId`).
- Le liste si leggono da `shopping_lists` (campo `status`: aperta / confermata / chiusa / annullata), con gli ordini collegati `purchase_orders(status, danea_exported_at, …)` e le righe `shopping_list_items(…)`.
- «Scaricata da Danea» non è un campo: la calcola `shoppingListDownloaded` (tutti gli ordini non annullati con `danea_exported_at`, e lista chiusa oppure righe interamente coperte).

## Causa
Commit `147eb6dd` («Nasconde dalla Lista le liste già scaricate in Danea»): in `shopping-list-panel.tsx` la lista scelta viene cercata in `lists`, che ora esclude le liste scaricate. `selectShoppingList` non trova l'id e restituisce nessuna lista, quindi la pagina mostra il prossimo acquisto vuoto.

## Correzione minima (solo presentazione)
1. `shopping-list-panel.tsx`: quando la lista è scelta esplicitamente con un id, cercarla nella lettura completa (`listsQuery.data`); la scelta automatica resta sulle liste filtrate.
2. Sola lettura: `editable` diventa falso anche per una lista con stato «aperta» ma già scaricata da Danea; bozze locali non accettate per quella lista. Liste confermate o chiuse sono già non modificabili.
3. `shopping-list-selection.ts`: piccolo parametro per la ricerca esplicita, con test puri: id di lista scaricata → trovata; nessun id → mai una lista scaricata; `NEXT_PURCHASE` invariato.

## Fuori perimetro
Nessuna modifica a database, ordini, Danea, Incassi, stato delle liste o pagina «Tutte le liste».

## Verifica
Test vitest della selezione; prova a schermo solo in lettura su 3 EMME, se ha una lista scaricata.
