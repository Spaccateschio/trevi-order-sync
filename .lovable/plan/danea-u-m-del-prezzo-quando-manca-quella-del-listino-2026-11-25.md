# Danea: U.M. del prezzo quando manca quella del listino

## Cosa ho verificato (sola lettura)
Ordine ORD-2026-00022 di 3 EMME, scarico del 25/11 alle 08:14, 9 righe in `danea_order_export_lines`:
- `reason` = `um_diversa` su **tutte e 9**
- `list_price` presente (es. 3,00 / 3,80 / 1,40 / 0,95)
- `price_unit_code` = **vuoto** su tutte
- `customer_price_unit_code` = kg (7 righe), mazzo (1), pz (1)
- `line_unit_code` (U.M. scelta dal cliente): cs, kg, cassa, nr, mazzo, pz

Da dove arriva `customer_price_unit_code`: `danea_export_orders_priced` lo copia da `purchase_order_items.price_unit_code`, cioè l'U.M. del prezzo fotografata sulla riga d'ordine al momento dell'ordine.

Articoli con `products.price_unit_id` vuoto: **trevi srl 139 su 139**, 3 EMME 47 su 48. Per questo l'U.M. del listino non c'è mai e il database segna sempre `um_diversa`, anche quando il cliente ha ordinato nella stessa U.M. (es. kg con prezzo a kg, mazzo con prezzo a mazzo, pz con prezzo a pz).

## Correzione proposta (solo codice)
In `daneaExportLineDecision` (`src/lib/danea-orders-xml.ts`), solo al **primo scarico** e solo quando `reason = um_diversa`:
1. U.M. del prezzo = `price_unit_code` del listino; se è vuota, si usa `customer_price_unit_code`.
2. Se questa U.M. è **uguale** all'U.M. scelta dal cliente (confronto con la stessa funzione `sameUnit` già usata): riga normale, prezzo del listino, U.M. normale, nessuna nota «da pesare», nessuna scritta ORDINATO.
3. Se è **diversa**: il nuovo ramo già approvato (prezzo del listino, `<Um>` del prezzo, quantità del cliente, `>>> ORDINATO: … <<<` in testa alle note).
4. Se mancano sia l'U.M. del listino sia quella del cliente: resta «U.M. prezzo diversa – da pesare», come oggi.

Sull'ordine 00022 il risultato sarebbe: 3 righe normali (kg/kg, mazzo/mazzo, pz/pz) e 6 righe con prezzo + U.M. del prezzo + ORDINATO (cs, cassa, nr, pz con prezzo a kg).

## Cosa non tocco
- Database, `danea_export_orders_priced`, `products.price_unit_id`, listini.
- Storico `danea_order_export_lines`: non viene riscritto; la scelta avviene solo nel file esportato.
- Riscarichi di ordini già scaricati: escono identici alla prima volta (logica precedente, `danea-orders-xml.legacy.ts` invariato).
- `danea-orders-export.server.ts`: nessuna modifica, passa già `customer_price_unit_code`.

## Test
In `src/lib/danea-export-price.test.ts` aggiungo:
- U.M. listino vuota, cliente kg e prezzo cliente kg → prezzo normale, Um kg, nessuna nota.
- U.M. listino vuota, cliente cs e prezzo cliente kg → prezzo, Um kg, ORDINATO 3 cs.
- Entrambe vuote → «da pesare» come oggi.
- Riscarico con U.M. listino vuota → invariato.
Eseguo i 3 file di test Danea esistenti. Nessuno scarico vero verso Danea.

## Nota
Avendo l'ordine 00022 già scaricato, un suo riscarico resterà nel formato vecchio. Per vedere il nuovo formato serve un ordine nuovo di 3 EMME.
