# FASE D — Ordine fornitore, consegna dichiarata, carico merce e provenienza

Solo piano tecnico: nessuna implementazione in questa fase.
Fuori scope: trasportatori, consegne ai clienti, finestra di 30 minuti,
pagamenti, notifiche, previsione automatica.

## Tre concetti separati

- **Prodotto**: cosa trattiamo (identità = `product_id` + `archive_id`, mai la descrizione).
- **Giacenza**: quanto ne abbiamo.
- **Carico / lotto / provenienza**: da quale arrivo, fornitore e condizioni deriva quella quantità.

```text
Ordine fornitore (destinazione = una zona)   -> nessun movimento
  -> Consegna dichiarata (fornitore o operatore) -> nessun movimento
     -> Confronto ordinato/dichiarato -> accettazione o contestazione per riga
        -> CARICO MERCE (unico evento che muove la giacenza)
           -> lotto interno + movimento di magazzino append-only
```

## 1. Ordine fornitore e destinazione

**purchase_orders**: company_id, archive_id, supplier_record_id,
relation_id (se collegato B2B), shopping_list_id di origine, numero interno,
stato, `destination_location_id` (zona di ricezione, obbligatoria, default la
zona predefinita), `destination_address_id` (facoltativa, sede fisica),
nota generale, inviato_at, autore, timestamp.

Una destinazione per ordine: nessuna ripartizione delle righe su più zone.
Merce necessaria in un'altra sede = altro ordine, o in futuro un trasferimento.

**purchase_order_items**: order_id, product_id, product_supplier_link_id,
quantità ordinata, unit_id/unit_code, quantità in U.M. acquisto,
conversion_factor usato, snapshot costo, nota interna.
Dopo l'invio le quantità sono congelate (trigger che blocca l'UPDATE).

## 2. Ordine ≠ giacenza

Regola tassativa: creazione, invio, dichiarazione del fornitore e arrivo
fisico **non** generano alcun movimento. Solo il carico merce lo fa.
Ordinati 100 kg, arrivati 92, caricati 92 → un solo movimento di +92 kg.

## 3. Consegna dichiarata e confronto

**purchase_deliveries**: order_id, progressivo, origine
(`fornitore_b2b` | `fornitore_link_esterno` | `operatore_interno`), stato,
nota generale, dichiarata_da/at (nullable per il link esterno), dichiarata_da_nome,
accettata_da/at. Nessuna scadenza automatica in questa fase:
la consegna resta aperta finché l'operatore la accetta, contesta o carica.
Consegne parziali: più consegne per lo stesso ordine, ognuna con il proprio confronto.

**purchase_delivery_items**: delivery_id, order_item_id (NULL se fuori ordine),
product_id, tipo riga (`ordinata` | `aggiunta_fornitore` | `sostituzione`),
sostituisce_order_item_id, quantità dichiarata, unit_id/unit_code,
equivalente in U.M. ordine, peso dichiarato, produttore dichiarato,
lotto produttore dichiarato, scadenza dichiarata, nota riga,
motivo mancata consegna, stato riga, quantità accettata, decisa_da/at.

**purchase_delivery_line_events** (append-only): evento
(`dichiarata`, `modificata`, `contestata`, `rettificata`, `accettata`, `rifiutata`),
quantità precedente/nuova, motivo, nota, attore, created_at. Nessun UPDATE/DELETE.

**purchase_delivery_disputes**: riga, motivo (enum: quantità inferiore/superiore,
non consegnato, non ordinato, qualità, pezzatura, altro), nota, stato
(`aperta` | `risolta_accettata` | `risolta_rettificata` | `risolta_rifiutata`),
aperta_da/at, risolta_da/at.

RPC `delivery_comparison(delivery_id)`: ordinato, già consegnato in precedenza,
dichiarato ora, differenza, esito (`corretta`, `inferiore`, `superiore`,
`non_consegnata`, `aggiunta_fornitore`, `sostituzione`), note, stato.
Differenze e percentuali sono calcolate, non salvate. Le righe aggiunte dal
fornitore restano etichettate e non entrano mai nell'ordine originale.

## 3-bis. Tre modalità fornitore, un solo modello dati

La dichiarazione è sempre la stessa tabella: cambia solo il canale, registrato
in `origine`.

**A. Fornitore registrato B2B** — riceve l'ordine nell'app e dichiara per ogni
riga quantità, U.M., peso effettivo, produttore, lotto produttore, scadenza,
mancanze, sostituzioni e note. `origine = fornitore_b2b`, autore = suo utente.

**B. Fornitore non registrato, link esterno sicuro** — nessun account. Modello
dati predisposto ora, pagina pubblica eventualmente dopo se il perimetro FASE D
cresce troppo.
**purchase_order_share_links**: order_id, token_hash (solo hash, mai il token
in chiaro), scadenza, revocato_at, creato_da/at, ultimo_accesso_at, contatore
accessi, nome/etichetta del destinatario. Il token dà accesso esclusivamente a
quell'ordine e solo per creare/inviare la propria dichiarazione: nessuna
lettura di altri ordini, clienti, costi, carichi o lotti. Pagina pubblica sotto
`/api/public/*` + route dedicata, molto semplice e usabile da smartphone.
`origine = fornitore_link_esterno`, autore utente NULL, nome dichiarante salvato.

**C. Fornitore completamente esterno** — nessun canale digitale: l'operatore
compila la dichiarazione al controllo merce su etichette, DDT e verifica fisica.
`origine = operatore_interno`.

### Dichiarato ≠ verificato ≠ caricato

```text
ORDINATO 20 kg
  -> DICHIARATO dal fornitore 20 kg · Produttore Rossi · Lotto A123
     -> VERIFICATO da noi 19,6 kg · Produttore Rossi · Lotto A123
        -> CARICATO 19,6 kg   (solo qui nascono lotto e movimento)
```

La dichiarazione del fornitore non crea mai giacenza, lotto o movimento.
La schermata di controllo precompila quantità, peso, produttore, lotto e
scadenza dichiarati; l'operatore conferma o corregge. In caso di correzione si
conservano entrambi i valori: il dichiarato resta su `purchase_delivery_items`,
il verificato su `goods_receipt_items`, con l'evento di modifica nello storico.

Lotto: se il fornitore comunica il lotto produttore viene proposto nel carico;
altrimenti lo inserisce l'operatore leggendo l'etichetta; se non esiste, il
carico non si blocca e Trevi Fruit genera comunque il lotto interno collegato a
fornitore + carico + data + prodotto.

## 4. Carico merce

**goods_receipts**: company_id, archive_id, order_id, delivery_id (facoltativo),
supplier_record_id, `location_id` (dalla destinazione dell'ordine, modificabile
solo prima della conferma), numero interno, stato (`bozza` | `confermato`),
nota, ricevuto_at, operatore, timestamp.

**goods_receipt_items**: receipt_id, delivery_item_id (facoltativo),
order_item_id (facoltativo), product_id, quantità caricata, unit_id/unit_code,
quantità in U.M. di giacenza + conversion_factor usato, costo unitario
snapshot (da Danea o manuale), produttore, `producer_lot_code` (facoltativo),
scadenza (facoltativa), nota.

La conferma del carico è l'unico punto che crea lotti e movimenti, ed è
idempotente: un carico già confermato non genera un secondo movimento.

## 5. Lotto interno e provenienza

**stock_lots** — lotto interno Trevi Fruit, sempre generato dal carico, anche
senza lotto produttore: company_id, archive_id, product_id, location_id,
goods_receipt_item_id, supplier_record_id, codice interno progressivo,
`producer_name`, `producer_lot_code` (nullable), costo unitario,
unit_id/unit_code, quantità iniziale, data ingresso, scadenza, stato
(`disponibile` | `esaurito` | `bloccato`), note.

Il lotto interno è indipendente dal lotto ufficiale del produttore: quando
quest'ultimo manca la provenienza resta comunque tracciata (fornitore +
carico + data). L'identità del prodotto resta `product_id` + `archive_id`:
due articoli con la stessa descrizione e lo stesso prezzo restano distinti.
Nessuna aggregazione o deduplicazione per nome, mai.

Più carichi dello stesso prodotto → più lotti. Stesso prodotto da fornitori
diversi → lotti distinti con costo e provenienza propri.

## 6. Registro movimenti append-only

**inventory_movements**: company_id, archive_id, product_id, location_id,
`stock_lot_id` (nullable per le rettifiche non riferite a un lotto),
tipo (`entrata_acquisto`; predisposti `uscita_cliente`, `scarto`, `reso`,
`trasferimento`, `rettifica`), quantità firmata, unit_id/unit_code,
riferimento origine (tabella + id: carico, futuro ordine cliente, rettifica),
autore, created_at. Nessun UPDATE né DELETE: una correzione è un nuovo movimento.

## 7. Giacenza e compatibilità con l'Inventario

La formula attuale (ultimo conteggio valido + rettifiche) viene estesa a:

```text
giacenza(prodotto, zona) = ultimo conteggio valido
                         + rettifiche successive al conteggio
                         + movimenti (carichi/uscite) successivi al conteggio
```

Il conteggio fisico resta il riferimento della realtà: azzera il contributo
dei movimenti precedenti, non li cancella. I conteggi esistenti e le RPC
`inventory_location_stock` / `product_stock_overview` / `inventory_requirements`
vengono estese, non riscritte, e la formula del fabbisogno non cambia.

Letture previste:
- `product_stock_overview` — totale prodotto e per zona (come oggi, con i movimenti).
- `product_lot_availability(product_id)` — residuo per lotto: quantità iniziale
  meno le uscite registrate, con fornitore, costo, data, zona, lotto produttore.
- `goods_receipt_history(product_id)` — storico dei carichi.

Esempio: Melanzane = 100 kg totali, con lotto Maria 40 kg e lotto Franco 60 kg.

## 8. Prelievo futuro da più provenienze

La struttura è già pronta: un futuro ordine cliente di 30 kg genererà due
movimenti `uscita_cliente` (−10 kg sul lotto Maria, −20 kg sul lotto Franco).
In questa fase non implementiamo né il prelievo né criteri automatici
(FIFO/scadenza): predisponiamo solo `stock_lot_id` sui movimenti e il calcolo
del residuo per lotto.

## 9. Stati e transizioni

- Ordine: `bozza` → `inviato` → `parzialmente_consegnato` → `consegnato` → `chiuso`; `annullato` solo senza consegne.
- Consegna: `bozza` → `dichiarata` → `in_contestazione` → `accettata` | `chiusa_con_rifiuti`.
- Riga consegna: `dichiarata` → `accettata` | `contestata` → (`rettificata` | `accettata` | `rifiutata`).
- Carico: `bozza` → `confermato` (immutabile; correzione = nuovo carico o rettifica).
- Lotto: `disponibile` → `esaurito` | `bloccato`.

## 10. RPC e sicurezza

Tutte `SECURITY DEFINER`, `search_path = public`, azienda e ruolo ricavati
dall'utente autenticato, mai dal browser; scritture solo via server function.

`create_purchase_order_from_list`, `send_purchase_order`,
`open_delivery` / `set_delivery_item` / `submit_delivery`,
`accept_delivery` / `dispute_delivery_item` / `resolve_delivery_dispute`,
`open_goods_receipt` / `set_goods_receipt_item` / `confirm_goods_receipt`
(crea lotti e movimenti, idempotente), `product_lot_availability`,
`goods_receipt_history`.

RLS: ogni azienda vede solo i propri ordini, consegne, carichi, lotti e
movimenti. Il fornitore collegato B2B vede l'ordine a lui indirizzato e
scrive unicamente la propria dichiarazione di consegna: mai le righe ordine,
mai i carichi, mai i lotti, mai i movimenti.

Link esterno: nessuna policy `anon` sulle tabelle. L'accesso passa solo da
server function/route pubblica che verifica l'hash del token, la scadenza e
la revoca, e opera con privilegi di servizio limitati a quell'ordine
(`create_external_declaration`, `revoke_order_share_link`). Nessun dato
diverso dalle righe dell'ordine viene restituito.

## 11. Interfaccia

- Elenco ordini: fornitore, destinazione, stato, consegne, residuo.
- Scheda ordine: righe congelate + consegne + carichi collegati.
- Confronto: tabella compatta su desktop/tablet, schede touch su smartphone,
  colonne Prodotto | Ordinato | Dichiarato | Differenza | Nota | Stato,
  badge per esito, accetta/contesta per riga.
- Carico merce: quantità realmente ricevuta, zona, produttore, lotto
  produttore, scadenza, nota; conferma esplicita.
- Scheda prodotto: nuovo riquadro Provenienze con lotti disponibili e storico carichi.

## 12. Test previsti

1. Ordine creato, inviato e dichiarato: giacenza invariata in ogni passaggio.
2. Ordinati 100 kg, dichiarati 92, caricati 92 → un solo movimento +92, ordine intatto.
3. Carico confermato due volte → nessun movimento duplicato.
4. Destinazione Magazzino X → il carico entra tutto in X.
5. Due carichi dello stesso prodotto da fornitori diversi → due lotti, totale corretto.
6. Lotto produttore assente → provenienza comunque tracciata.
7. Due prodotti con descrizione e prezzo identici → giacenze e lotti separati.
8. Conteggio fisico dopo un carico → il conteggio diventa il nuovo riferimento, storico conservato.
9. Carico dopo il conteggio → giacenza = conteggio + carico.
10. Consegne parziali 6 + 4 su 10 casse, con due carichi distinti.
11. Contestazione di una sola riga; risoluzione accettata/rettificata/rifiutata con storico completo.
12. Articolo aggiunto dal fornitore: etichettato, accettabile o contestabile, mai nell'ordine originale.
13. Fornitore completamente esterno: flusso compilato dall'operatore.
14. Dichiarato 20 kg, verificato 19,6 kg → giacenza +19,6, dichiarato conservato.
15. Link esterno: token valido consente solo la dichiarazione di quell'ordine; token scaduto o revocato rifiutato.
16. RLS: il fornitore B2B non accede a righe ordine, carichi, lotti, movimenti.
17. Nessun record di storico cancellato o sovrascritto in tutto il flusso.
