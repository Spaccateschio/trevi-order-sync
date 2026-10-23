# Giorni di consegna: scelta automatica del fornitore, senza blocchi

## Cosa ho verificato (sola lettura)
- **Scelta automatica oggi:** `autoAssignItem` in `src/lib/shopping-auto-assign.ts` (righe 191–390). Ordine di scelta: fornitore del Catalogo B2B appena usato → memoria dell'ultima Lista chiusa (`supplier-memory.ts`, `chooseListDestinations`, righe 26–47) → unico idoneo / stella (`autoPickSupplier` in `supplier-selection.ts`, riga 44). Quote multiple: `planQuotaUpdate` / `planRescale`.
- **Dati usati:** stella = `product_supplier_links.is_preferred` (via `product_supplier_overview`); preferiti inventario = `company_product_supplier_favorites`; quote = `shopping_list_item_suppliers.purchase_quantity` (+ `deselected_at` per i fornitori tolti); quota diretta = `shopping_list_items.manual_purchase_quantity`; quantità confermata = `shopping_list_items.quantity_locked_at`; quote già in ordine = `purchase_order_items.source_assignment_id`.
- **Chiamata da:** Conferma della card e conferma di massa (`shopping-list-panel.tsx` 1061, 1118), aggiunta prodotti (`add-products-dialog.tsx` 534), card fornitori (`card-suppliers.tsx` 407, 658 = spunta manuale), Genera ordini (`generate-orders-dialog.tsx` 274).
- **Acquisto diretto:** si assegna con la funzione esistente `set_shopping_list_direct_quota` (`setShoppingListDirectQuota`), già usata dalla scelta automatica tramite memoria.

## Rischio da segnalare
Il database **non registra se una quota è stata scelta a mano o in automatico**. Regola proposta, senza nuove colonne: la scelta per data vale **solo quando la riga non ha ancora nessuna destinazione** (nessun fornitore e nessuna quota diretta). Ogni destinazione già presente è trattata come intoccabile e riceve soltanto l'avviso. Anche la spunta manuale di un fornitore (`onlyLinkId`) non viene mai sostituita.

## Come funzionerà
1. Calcolo della prima consegna valida per ogni fornitore: giorni del prodotto, altrimenti del fornitore; giorno mensile aggiunto ai settimanali; «N gg» = giorni di calendario dalla data di oggi dell'azienda.
2. Con «Per quando serve» impostata e riga senza destinazioni:
   - un solo fornitore in tempo → a lui;
   - più fornitori in tempo → ripartizione attuale, limitata a quelli in tempo;
   - nessuno in tempo → quota «Acquisto diretto» dell'intera quantità, visibile e modificabile.
3. Senza data «Per quando serve»: comportamento identico a oggi.
4. Destinazione già presente non compatibile: avviso sulla card e in «Fornitori e ripartizione», con proposta da accettare con un tocco (altro fornitore in tempo oppure acquisto diretto).
5. «Genera ordini»: avviso per i fornitori la cui prima consegna è dopo la data richiesta; nessuno spostamento di data, nessun blocco.

## File e modifiche previste (non applicate)
- `src/lib/delivery-schedule.ts`: nuova `firstValidDelivery(from, schedule, leadDays)` e `canDeliverBy(...)` (~30 righe).
- `src/lib/delivery-schedule.test.ts` (nuovo): un test per regola, inclusi preavviso nel fine settimana e giorno mensile.
- `src/lib/supplier-memory.ts` / `shopping-auto-assign.ts`: filtro dei fornitori in tempo solo nel ramo «riga senza destinazioni» (~40 righe); lettura di `lead_time_days`, giorni e data della Lista; risultato «diretto per data».
- `src/lib/quota-automation.test.ts`: casi uno / due / nessun fornitore / manuale invariato.
- `src/components/shopping/card-suppliers.tsx`, `supplier-split-dialog.tsx`: avviso + proposta con un tocco (usa le funzioni esistenti).
- `src/components/shopping/generate-orders-dialog.tsx`: avviso data non servita.
- `AGENTS.md`: una regola sulla scelta per data solo per righe senza destinazioni.

## Database e app pubblicata
**Nessuna modifica SQL necessaria**: niente blocchi, e le scritture usano `assign_shopping_list_supplier` e `set_shopping_list_direct_quota` già esistenti. Il sito pubblicato resta invariato finché non si pubblica; nessuna migrazione da rinviare.

## Prove previste (solo 3 EMME, dati da te autorizzati)
Esempio: oggi martedì, serve giovedì.
1. Un solo fornitore: A consegna lun/gio 2 gg, B solo lunedì → A.
2. Due fornitori: A e B consegnano giovedì → stella / ripartizione attuale.
3. Nessuno: A solo lunedì, B il 15 del mese → acquisto diretto.
4. Manuale: spunto B (non in tempo) → resta B, compare l'avviso con proposta A.
5. Fine settimana: ordine venerdì, 2 gg, fornitore lun–ven → lunedì (domenica non valida).
Prima con test automatici su dati inventati, poi collaudo manuale tuo su 3 EMME, senza invio ordini.

## Vincoli
Nessuna modifica a ordini, Liste, prodotti, giacenze o preferenze reali; nessuna email; roadmap invariata; nessuna pubblicazione.
