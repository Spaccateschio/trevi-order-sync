# FASE D — Ordini fornitore, dichiarazione di consegna, confronto e ricezione

Nessuna implementazione in questa fase: solo piano tecnico.
Fuori scope: notifiche, previsione automatica, ordini cliente, fatturazione.

## Principio guida

Il nostro ordine è congelato. La consegna è una dichiarazione separata.
Il confronto non riscrive mai l'ordine. Ogni decisione è storicizzata
(chi, quando, come) e nulla viene cancellato.

```text
Lista Spesa confermata
   -> Ordine fornitore (righe immutabili)
      -> Consegna 1 (dichiarata) -> confronto -> finestra 30' -> accettata/contestata
      -> Consegna 2 (residuo)    -> confronto -> finestra 30' -> ...
         -> quantità accettate -> movimenti di magazzino (append-only)
```

## Tabelle proposte

**purchase_orders** — ordine verso un fornitore
company_id, archive_id, supplier_record_id, relation_id (opzionale, B2B),
shopping_list_id di origine, numero interno, stato, note generali,
data invio, autore, timestamp.

**purchase_order_items** — righe immutabili
order_id, product_id, product_supplier_link_id, quantità ordinata,
unit_id + unit_code (U.M. ordine), quantità in U.M. acquisto,
conversion_factor usato, snapshot costo, note interne.
Dopo l'invio: nessun UPDATE sulle quantità (regola applicata da trigger).

**purchase_deliveries** — dichiarazione di consegna (una per consegna parziale)
order_id, progressivo, origine (`fornitore_b2b` | `operatore_interno`),
stato, nota generale, dichiarata_da, dichiarata_at,
finestra_minuti (copia del parametro al momento dell'invio),
scade_at, esito_accettazione (`manuale` | `decorrenza`),
accettata_da, accettata_at.

**purchase_delivery_items** — righe consegna
delivery_id, order_item_id (NULL se aggiunta dal fornitore),
product_id, tipo riga (`ordinata` | `aggiunta_fornitore` | `sostituzione`),
sostituisce_order_item_id, quantità dichiarata, unit_id/unit_code,
quantità equivalente in U.M. ordine, nota riga, motivo mancata consegna,
stato riga, quantità accettata (definitiva), decisa_da, decisa_at.

**purchase_delivery_line_events** — versionamento append-only
delivery_item_id, tipo evento (`dichiarata`, `modificata`, `contestata`,
`rettificata`, `accettata`, `rifiutata`), quantità precedente/nuova,
motivo, nota, attore, created_at. Nessun DELETE/UPDATE.

**purchase_delivery_disputes** — contestazione per riga
delivery_item_id, motivo (enum: `quantita_inferiore`, `quantita_superiore`,
`non_consegnato`, `non_ordinato`, `qualita`, `pezzatura`, `altro`),
nota, stato (`aperta` | `risolta_accettata` | `risolta_rettificata` |
`risolta_rifiutata`), aperta_da/at, risolta_da/at.

**inventory_movements** — registro append-only (creato qui, usato dalla ricezione)
company_id, archive_id, product_id, location_id, tipo movimento
(`entrata_acquisto`, e per il futuro `uscita_cliente`, `scarto`, `reso`,
`trasferimento`, `rettifica`), quantità firmata, unit_id/unit_code,
riferimento origine (delivery_item_id o altro), autore, created_at.
Le rettifiche esistenti dell'Inventario non vengono toccate: la ricezione
aggiunge movimenti, non riscrive i conteggi.

**company_settings** — nuovo campo `delivery_check_window_minutes` (default 30).

## Confronto ordinato / consegnato

Vista/RPC `delivery_comparison(delivery_id)` che per ogni riga restituisce:
prodotto, ordinato, già consegnato in consegne precedenti, dichiarato ora,
differenza, equivalente in U.M. ordine, esito
(`corretta`, `inferiore`, `superiore`, `non_consegnata`,
`aggiunta_fornitore`, `sostituzione`), note, stato riga, contestazione.
Le percentuali e le differenze sono calcolate, non salvate.
La riga `aggiunta_fornitore` è sempre etichettata in modo esplicito e non
entra nell'ordine originale: può solo essere accettata o contestata.

## Stati e transizioni

Ordine: `bozza` → `inviato` → `parzialmente_consegnato` → `consegnato`
→ `chiuso`; più `annullato` solo da `bozza`/`inviato` senza consegne.

Consegna: `bozza` → `dichiarata` (parte la finestra) →
`in_contestazione` → `accettata_manuale` | `accettata_decorrenza` |
`chiusa_con_rifiuti`.

Riga consegna: `dichiarata` → `accettata` | `contestata` →
(`rettificata` | `accettata` | `rifiutata`).

Accettazione automatica per decorrenza: nessun job schedulato in questa
fase; la maturazione è calcolata al momento della lettura e consolidata
da una RPC idempotente `settle_expired_deliveries` invocata all'apertura
della pagina consegna. Il tempo residuo è sempre visibile lato interfaccia.

## RPC e sicurezza

Tutte `SECURITY DEFINER`, `search_path = public`, company ricavata
dall'utente autenticato, mai dal browser.

- `create_purchase_order_from_list(list_id, …)` — genera ordini per fornitore
- `send_purchase_order(order_id)` — congela le righe
- `open_delivery(order_id, origine)` / `set_delivery_item(…)` /
  `submit_delivery(delivery_id)` — imposta `dichiarata_at`, finestra e scadenza
- `accept_delivery(delivery_id)` / `dispute_delivery_item(item_id, motivo, nota)`
- `resolve_delivery_dispute(dispute_id, esito, quantita_rettificata, nota)`
- `settle_expired_deliveries()`
- `receive_delivery(delivery_id, location_id)` — scrive i movimenti solo
  per le quantità accettate, idempotente

RLS: il compratore vede i propri ordini/consegne; il fornitore collegato
B2B vede solo gli ordini a lui indirizzati e può scrivere unicamente la
propria dichiarazione di consegna, mai le righe ordine. Fornitore non
registrato: nessun accesso, la parte “consegnato” la compila l'operatore
interno con `origine = operatore_interno`; il modello dati è identico.

## Interfaccia

- Elenco ordini con stato, fornitore, consegne, residuo.
- Scheda ordine: righe ordinate immutabili + elenco consegne.
- Pagina confronto: tabella compatta su desktop/tablet, schede touch su
  smartphone, colonne Prodotto | Ordinato | Dichiarato | Differenza | Nota |
  Stato, badge colore per esito, countdown della finestra, azioni
  accetta riga / contesta riga / accetta tutto.
- Compilazione consegna (fornitore B2B o operatore interno) con nota per
  riga e nota generale, aggiunta articolo fuori ordine.
- Ricezione: scelta zona e conferma entrata magazzino.

## Test previsti

1. Ordine inviato: tentativo di modifica quantità → rifiutato.
2. Ordinate 3 kg, dichiarate 2 kg con nota → differenza -1, ordine intatto.
3. Articolo non consegnato (0) con motivazione → ordinato resta 10 kg.
4. Articolo aggiunto dal fornitore → etichettato, accettabile o contestabile.
5. Consegna parziale 6 + 4 su 10 casse: due confronti e due finestre.
6. Finestra: default 30', parametro modificato a 5', countdown coerente.
7. Scadenza senza contestazione → `accettata_decorrenza`, distinta dalla manuale.
8. Contestazione di una sola riga, le altre accettate.
9. Contestazione risolta come accettata / rettificata / rifiutata, con storico completo.
10. Ricezione: solo le quantità accettate generano movimenti; doppia chiamata non duplica.
11. Fornitore non registrato: flusso completo compilato dall'operatore.
12. RLS: il fornitore B2B non può toccare le righe ordine né altre aziende.
13. Nessuna riga di storico cancellata o sovrascritta in tutto il flusso.
