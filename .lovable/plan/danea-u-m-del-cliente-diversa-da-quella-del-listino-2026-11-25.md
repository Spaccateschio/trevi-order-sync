# Danea: U.M. del cliente diversa da quella del listino

## 1. Da dove arrivano i dati (verificato)
- **U.M. scelta dal cliente**: `purchase_order_items.purchase_unit_code`, se vuota `purchase_order_items.unit_code` (in `danea_export_orders_priced`: `COALESCE(i.purchase_unit_code, i.unit_code)`). Nell'XML è `line.unit`, scritta in `<Um>`.
- **U.M. del listino**: `products.price_unit_id` -> `units_of_measure.code` dell'articolo del venditore (`product_supplier_links.b2b_item_id`). Arriva come `price_unit_code`.
- **Prezzo**: `product_prices.net_price` del venditore, per il listino del cliente (`customer_records.assigned_price_list_number`, attivo in `danea_price_lists`, stesso archivio). Arriva come `list_price` (e `price` solo se U.M. uguale).
- **Confronto oggi** (`_danea_export_line_price`): se `lower(trim(price_unit_code)) <> lower(trim(U.M. cliente))` o una delle due manca -> `reason = 'um_diversa'`, `price = NULL`, `list_price` valorizzato. In `daneaExportLineDecision` (src/lib/danea-orders-xml.ts righe 201-204) diventa nessun `<Price>` e nota «U.M. prezzo diversa – da pesare».

## 2. Nuovo comportamento (solo `um_diversa` con `list_price` > 0)
- `<Price>` = `list_price`
- `<Um>` = `price_unit_code`
- `<Qty>` = quantità del cliente, invariata
- `<Notes>` = `>>> ORDINATO: <quantità> <U.M. cliente> <<<` all'inizio, poi le note esistenti (note riga, eventuale «Prezzo visto dal cliente…»). La vecchia frase «da pesare» sparisce.
- Se `price_unit_code` manca o `list_price` manca: comportamento attuale (nessun prezzo), per non inventare un'U.M.
- U.M. uguale e tutti gli altri motivi: identici.

## 3. Riscarichi e storico
- `danea_order_export_lines` **non viene riscritto**: nessuna migrazione, nessuna modifica alla funzione DB. Lo storico contiene già `reason`, `list_price`, `price_unit_code`, quindi il nuovo XML si calcola solo nel codice.
- Conseguenza da decidere: un riscarico di un ordine già esportato con `um_diversa` produrrebbe il nuovo formato (prezzo e U.M. del listino) invece di quello scaricato la prima volta. Le regole del progetto dicono che gli ordini già scaricati sono intoccabili.
- **Proposta**: il nuovo formato vale solo per gli ordini al primo scarico (`already_exported = false`); i riscarichi restano identici a prima. Il riscarico senza storico usa ancora `danea-orders-xml.legacy.ts`, che non tocco.

## 4. File e test
- `src/lib/danea-orders-xml.ts`: `LinePriceDecision` riceve anche `unit` e `highlight` facoltativi; `daneaExportLineDecision` gestisce il nuovo caso; nella costruzione della riga `<Um>` usa l'U.M. della decisione e la nota evidenziata va in testa.
- `src/lib/danea-orders-export.server.ts`: nessuna modifica prevista (passa già `export_price` e `already_exported`); la verifico soltanto.
- `danea-export-price.test.ts`: aggiorno il test «U.M. diversa» e aggiungo: prezzo/U.M. listino/Qty invariata/nota ORDINATO; caso senza `price_unit_code`; riscarico invariato.
- `danea-orders-xml.test.ts`: il test riga 44 riguarda `daneaLinePrice` (vecchia logica senza storico): resta invariato.
- `danea-orders-legacy-reexport.test.ts`: nessuna modifica; lo rieseguo per conferma.

## Non tocco
Database, `_danea_export_line_price`, `danea_export_orders_priced`, storico, numerazione, stati ordini, file legacy.

## Rischi
- In Danea la quantità resta nell'U.M. del cliente ma con prezzo per U.M. listino: il totale della riga è sbagliato finché non viene corretta in lavorazione (per questo la nota in evidenza).
- Nessuna prova reale verso Danea: solo test automatici.
