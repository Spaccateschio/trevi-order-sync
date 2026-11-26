# Collegamento Trevi Incassi → passi 4, 5, 6 dell'ordine

Fuori dal perimetro: PDF, conferma del cliente, ricezione merce, RPC esistenti, Danea, invio ordini. Niente viene attivato in produzione finché non lo dici tu.

## Verifiche fatte (in sola lettura)
- **Ordine:** `purchase_orders.number` (testo), `purchase_orders.company_id` (azienda acquirente), `purchase_orders.relation_id` → `supplier_customer_relations.id`.
- **Fornitore della relazione:** `supplier_customer_relations.seller_company_id`; acquirente: `buyer_company_id`.
- **Codice cliente Danea:** `customer_records.internal_reference`, raggiunto con `supplier_customer_relations.customer_record_id` → `customer_records.id`. Attenzione: anche `supplier_customer_relations` ha un suo campo `internal_reference`. Uso solo quello di `customer_records`, come mi hai chiesto. Se è vuoto, il documento resta «da controllare».
- **`number` non è unico tra clienti diversi.** Il vincolo è `UNIQUE (company_id, number)`. Nel database `ORD-2026-00001` esiste in 7 aziende, `00002` in 6 e `00003` in 2. Per questo il codice cliente è obbligatorio.
- **Barra dei passi:** `orderTimeline` ha già i campi facoltativi `prepared_at`, `shipped_at` e `delivered_at`, oggi sempre vuoti.

## 1. Nuova tabella `supplier_delivery_documents`
C'è una riga per ogni documento Incassi, con chiave unica `(source, external_id)`.
- `source` (testo, oggi `trevi_incassi`), `external_id`, `seller_company_id`
- `doc_type`: `ddt` o `preventivo`. Poi `doc_number`, `doc_date`, `customer_code`, `order_ref` (il riferimento ORD letto dalle note) e `notes_raw`
- `purchase_order_id` (vuoto se non collegato), `buyer_company_id` (copiato dall'ordine collegato)
- `link_status`: `collegato` o `da_controllare`, più `link_reason` (nessun_ordine / più_ordini / codice_cliente_mancante / riferimento_mancante)
- `prepared_at`, `in_carico_at`, `consegna_stato` (`consegnato` / `non_consegnato` / vuoto), `consegna_at`
- `lines` in formato jsonb: `[{code, description, qty, um, um_normalized, price, total, needs_review}]`
- `has_lines_to_review`, `received_at`, `updated_at`
- **Il nome del trasportatore non viene salvato**, e nemmeno letto dal messaggio.

**Accesso (RLS):**
- Nessuna lettura per i visitatori non registrati (`anon`).
- L'acquirente legge con `is_company_member(buyer_company_id)` ma solo se il documento è collegato: è la stessa regola degli ordini.
- Il fornitore legge con `is_company_member(seller_company_id)`.
- Le scritture le fa solo il server dopo aver verificato la chiave (`service_role`), mai il browser.
- **Prezzo:** l'acquirente non legge la tabella direttamente. Riceve una vista o funzione di lettura che toglie `price` e `total` quando il prezzo non è assegnato. La regola si basa su `applicable_b2b_price` dell'articolo nella relazione, quindi nessun prezzo viene inventato. Il fornitore vede sempre i suoi prezzi.

## 2. Collegamento all'ordine (funzione pura + controllo nel database)
L'ordine viene cercato con tutte queste condizioni insieme:
- stesso fornitore: `relation.seller_company_id` = fornitore della fonte;
- stesso codice cliente: `customer_records.internal_reference` = `customer_code`, senza differenze di maiuscole e spazi;
- stesso numero: `purchase_orders.number` = `order_ref`.

Il riferimento ORD si legge dalle note con il modello `ORD-\d{4}-\d{5}`:
- un solo riferimento trovato: si usa;
- nessun riferimento oppure più riferimenti diversi: «da controllare».

Esito della ricerca: un solo ordine diventa «collegato»; nessun ordine o più di uno diventa «da controllare». L'app non prova mai a indovinare.

Se un aggiornamento arriva quando il documento è già collegato, il collegamento si ricalcola con le stesse regole e non viene mai spostato a mano.

## 3. Indirizzo di ricezione
`POST /api/public/integrations/trevi-incassi/documents`
- **Chiave:** intestazione `X-Incassi-Key`, confrontata con il segreto `TREVI_INCASSI_KEY` a tempo costante. Il fornitore collegato alla chiave è nel segreto `TREVI_INCASSI_SELLER_COMPANY_ID`. Ti chiederò i valori solo con il modulo sicuro, mai in chat.
- **Controllo dei dati:** fatto con Zod, con limiti su lunghezze, numero di righe e date ISO.
- **Idempotenza:** si fa un upsert sulla chiave `(source, external_id)`. Lo stesso documento inviato due volte aggiorna la riga e non la duplica mai. Per date e stati si applica una sola regola, scritta nella funzione pura: un campo vuoto in arrivo non cancella un valore già salvato.
- **Aggiornamenti successivi:** basta mandare lo stesso `external_id` con `in_carico_at` o `consegna`, anche senza righe. Se le righe mancano, restano quelle precedenti.

**Risposte:**
| Codice | Quando |
|---|---|
| `401 {error:"chiave_non_valida"}` | chiave mancante o sbagliata |
| `400 {error:"dati_non_validi", details:[...]}` | dati che non passano il controllo |
| `200 {status:"collegato", order_number}` | documento collegato a un ordine |
| `202 {status:"da_controllare", reason}` | documento salvato ma non collegabile |
| `503` | collegamento non attivo |

Il collegamento si accende solo quando entrambi i segreti sono impostati e `TREVI_INCASSI_ENABLED=true`. Finché non lo dici tu, quel valore non viene impostato.

## 4. Barra dei passi
`orderTimeline` resta l'unico punto di verità. Riceve i fatti dal documento collegato più recente:
- passo 4 = `prepared_at`;
- passo 5 = `in_carico_at`;
- passo 6 = `consegna_at`, solo se `consegna_stato = consegnato`.

Con `non_consegnato` il passo 6 resta grigio e compare la scritta «Non consegnato», visibile sulla card e sul dettaglio.

Senza un documento collegato i passi restano grigi. La lista e il dettaglio leggono questi documenti solo in lettura.

## 5. Unità delle righe
Una funzione pura `normalizeIncassiUnit`:
- `pz`, `pezzo`, `pezzi` e `PZ` diventano `pz`;
- l'unità diventa `kg` solo se nel testo c'è esattamente «kg»;
- le altre unità note vengono prese dalla tabella `units_of_measure` del fornitore, confrontando i codici.

Un'unità vuota o sconosciuta dà `needs_review = true`: la riga resta «da controllare» e non viene mai convertita a caso.

## 6. Seconda fase (solo progetto, non la costruisco)
Lo scopo è trasformare le righe del documento nella consegna dichiarata che già riempie la colonna «Arrivato».
- Una nuova funzione DB «adattatore» chiama le funzioni di oggi, senza modificarle: `_delivery_open_core`, poi `_delivery_set_item_core` per ogni riga, poi `_delivery_submit_core`. L'origine è «fornitore_b2b» e il tutto avviene in una sola transazione.
- Ogni riga del documento si abbina alla riga d'ordine tramite il codice articolo del collegamento. Se l'abbinamento non è sicuro, oppure la riga ha `needs_review`, non si dichiara niente e il documento resta da controllare.
- Il dichiarato resta distinto dal verificato. Giacenza e provenienze continuano a nascere solo da «Conferma carico».

## Test (solo logica pura)
- **Collegamento:** un solo ordine, nessun ordine, più ordini, codice cliente mancante, nessun ORD nelle note, due ORD diversi nelle note, stesso ORD con clienti diversi.
- **Idempotenza:** documento inviato due volte (stesso risultato), aggiornamento successivo che non cancella i valori già salvati.
- **Passi:** 4, 5 e 6 accesi dai campi del documento, `non_consegnato` che non accende il 6, nessun documento = tutto grigio.
- **Unità:** pz e pezzo uguali, unità vuota o sconosciuta da controllare.

Le prove reali le fai tu su 3 EMME. Io non modifico nessun dato reale.

## Cosa dare a Incassi
```text
POST https://suitefficio.com/api/public/integrations/trevi-incassi/documents
Content-Type: application/json
X-Incassi-Key: <chiave segreta>
```
```json
{
  "external_id": "INC-DDT-2026-000123",
  "doc_type": "ddt",
  "doc_number": "123",
  "doc_date": "2026-11-26",
  "customer_code": "C0042",
  "notes": "Rif. ORD-2026-00026",
  "prepared_at": "2026-11-26T07:30:00+01:00",
  "in_carico_at": null,
  "consegna": { "stato": null, "at": null },
  "lines": [
    { "code": "AGL01", "description": "Aglio bianco", "qty": 2, "um": "kg", "price": 3.5, "total": 7.0 }
  ]
}
```
- `doc_type` vale `ddt` oppure `preventivo`.
- `consegna.stato` vale `consegnato`, `non_consegnato` oppure `null`.
- Per gli aggiornamenti successivi si manda lo stesso `external_id` con i soli campi cambiati. `lines` si può omettere.

## File che toccherò
- Una migrazione: tabella, accessi e funzione di lettura con il prezzo filtrato.
- Nuovi file: `src/lib/incassi/incassi-link.ts` con il relativo test, e la route `src/routes/api/public/integrations/trevi-incassi/documents.ts`.
- File modificati: `order-list-presentation.ts` per «Non consegnato» e i suoi test, `purchase-orders-panel.tsx` e `purchase-order-detail.tsx` per la sola lettura dei fatti, e AGENTS.md.
