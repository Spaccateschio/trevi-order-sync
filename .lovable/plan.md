# Numero d'ordine univoco verso Danea, per fornitore

## Problema confermato
Il numero inviato a Danea (`<Number>`) è la parte numerica dell'ORD del cliente (ORD-2026-00004 → 4). Ogni cliente numera i propri ordini per conto suo, quindi due clienti dello stesso fornitore possono mandare entrambi il numero 4. Conseguenze:
- Danea non importa due volte lo stesso numero: il secondo ordine si perde, ma Trevi Fruit lo mostra come «Scaricato».
- Se Danea chiede «dal numero X in poi», l'ordine di un altro cliente con numero più basso viene scartato per sempre.

Oggi Trevi ha un solo cliente (3 EMME), quindi il problema non si è ancora verificato. Si verificherebbe al secondo cliente.

## Soluzione
Ogni fornitore ha una sua numerazione progressiva per Danea, separata dall'ORD del cliente:
- Il numero viene assegnato una sola volta, al primo scarico dell'ordine, e non cambia più (gli eventuali riscarichi lo riusano).
- Parte sopra il numero più alto già usato verso Danea da quel fornitore: oggi 5, quindi il prossimo ordine sarà 6. Nessuna collisione con ORD-2026-00004 e 00005 già importati.
- L'ORD del cliente resta visibile nell'ordine in Danea (riferimento/note), così si ritrova sempre l'ordine originale.
- I filtri «dal numero / al numero» di Danea usano il nuovo numero.

## Cosa non cambia
- ORD-2026-00004 e 00005, già scaricati, restano intoccabili: un loro riscarico continua a usare il numero di prima (4 e 5), con la logica attuale.
- Numerazione ORD dei clienti, prezzi allo scarico, storico prezzi, postazioni, login e password.
- Nessun ordine viene rimesso in scarico o modificato.

## Dettagli tecnici
- Migrazione solo additiva: colonna `purchase_orders.danea_number integer NULL` + indice unico parziale per fornitore (azienda venditrice del rapporto, `danea_number`) dove non nullo.
- Assegnazione dentro `danea_mark_orders_exported` / `danea_export_orders_priced` sotto `pg_advisory_xact_lock('danea_order_number:'||seller_company_id)`: `max(danea_number, numero legacy degli ordini già esportati) + 1`. Mai rinumerare un ordine che ha già un numero.
- `danea_orders_export_candidates` restituisce anche `danea_number`.
- `src/lib/danea-orders-xml.ts`: `<Number>` = `danea_number`; se nullo e l'ordine è già esportato → numero legacy (compatibilità, test `danea-orders-legacy-reexport` invariato); candidati nuovi sotto filtro numerico ricevono il numero prima del filtro (assegnazione in una fase "prenota numeri" sotto lock, poi filtro, poi XML).
- `src/lib/danea-orders-export.server.ts`: ordine delle chiamate adeguato.
- Test nuovi: due clienti con lo stesso ORD → numeri Danea diversi; filtro `firstnum` non scarta l'ordine di un altro cliente; riscarico conserva il numero; ordini 00004/00005 mantengono 4 e 5.
- Aggiornare la regola in `src/lib/AGENTS.md` (Number numerico = numerazione per fornitore).
- Prove solo in transazioni annullate; nessuna chiamata agli indirizzi Danea reali; nessuna pubblicazione.

## Punto da decidere
Il numero viene prenotato quando Danea chiede gli ordini: se Danea poi non importa, il numero resta all'ordine (nessun buco problematico, il riscarico lo riusa).
