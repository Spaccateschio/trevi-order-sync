# Ricezione merce in una schermata sola

## Risposte (verificate sul database)

### 1. Stati e transizioni
**purchase_deliveries.status** (`purchase_delivery_status`)

| Da → A | Funzione | Effetti collaterali |
|---|---|---|
| (nuova) → `bozza` | `open_purchase_delivery` / `_delivery_open_core` (link esterno: `external_open_delivery`) | crea le righe `purchase_delivery_items` con `declared_quantity` / `declared_purchase_quantity` = ordinato meno già dichiarato; se esiste già una bozza la riusa |
| riga in bozza | `_delivery_set_item_core` (interno), `external_set_delivery_item` (link) | scrive `declared_*`, `missing_reason`; righe extra/sostituzione con `add_purchase_delivery_extra_item` (`line_type`, `replaces_order_item_id`) |
| `bozza` → `dichiarata` | `_delivery_submit_core` (via `submit_purchase_delivery` / `external_submit_delivery`) | `declared_at`, evento `dichiarata` per riga, **`purchase_orders.status` inviato → `parzialmente_consegnato`** |
| `dichiarata` → `in_contestazione` | `dispute_purchase_delivery_item` | crea `purchase_delivery_disputes` (status `aperta`, `reason`), riga → `contestata` |
| riga contestata → `accettata` / `rettificata` / `rifiutata` | `resolve_purchase_delivery_dispute` | `accepted_quantity` (rifiutata = 0), dispute `risolta_*` |
| `dichiarata`/`in_contestazione` → `accettata` o `chiusa_con_rifiuti` | `accept_purchase_delivery` | bloccata se ci sono contestazioni aperte; righe → `accettata` con `accepted_quantity = COALESCE(accepted, declared)`; `chiusa_con_rifiuti` se almeno una riga `rifiutata` |

**goods_receipts.status** (`goods_receipt_status`: `bozza`, `confermato`)

| Da → A | Funzione | Effetti |
|---|---|---|
| (nuovo) → `bozza` | `open_goods_receipt` (solo da consegna `accettata`/`chiusa_con_rifiuti`) | numero CAR, righe `goods_receipt_items` con `verified_quantity = COALESCE(accepted, declared)`, lotto/scadenza dal dichiarato, prezzo dall'ordine; esclude righe rifiutate o a zero |
| riga in bozza | `set_goods_receipt_item` | `verified_quantity`, lotto, `unit_cost`, `price_unit_*`, `price_quantity` |
| `bozza` → `confermato` | `confirm_goods_receipt` | **unico punto** che crea `stock_lots` e `inventory_movements` (`entrata_acquisto`) e aggiorna lo stato dell'ordine |

### 2. Catena in una sola chiamata
Oggi **no**: ogni passo è una funzione server separata, cioè una transazione separata. Le funzioni esistenti però sono componibili: controllano tutte `auth.uid()` e l'appartenenza all'azienda, e si possono chiamare in sequenza dentro un'altra funzione del database.
**Serve una nuova funzione del database** (wrapper), senza modificare le esistenti: `receive_purchase_order(_order_id, _lines jsonb, _notes)`. Esegue in un'unica transazione: apertura o ripresa della consegna, scrittura del dichiarato per riga, invio, contestazioni e loro risoluzione, accettazione, apertura del carico, `set_goods_receipt_item` e `confirm_goods_receipt`. Basta un errore e si annulla tutto. Serve una sola funzione server nuova che la chiama con `context.supabase`.
È una modifica al database (una funzione nuova), quindi è necessaria la tua approvazione esplicita.

### 3. Esiti rapidi sui campi esistenti
| Esito | Consegna (dichiarato) | Accettazione / carico (verificato) |
|---|---|---|
| OK | `declared_quantity` = residuo ordinato (già precompilato) | accettata; `verified_quantity` = dichiarato |
| Parziale | `declared_quantity` = quantità arrivata | accettata; il resto **resta da ricevere**: l'ordine resta `parzialmente_consegnato` e la consegna successiva parte dal residuo |
| Mancante | `declared_quantity` = 0 + `missing_reason` | nessuna riga di carico (escluse le righe a 0) |
| Danneggiato | quantità arrivata dichiarata | `dispute_purchase_delivery_item` con `reason` scelto da `DISPUTE_REASON_LABEL` (predefinito `qualita`), poi `resolve_purchase_delivery_dispute` `rettificata` (quantità buona) o `rifiutata` (tutto da scartare) |
| Sostituzione (in «Dettagli riga») | riga originale a 0 + `add_purchase_delivery_extra_item` con `line_type='sostituzione'` e `replaces_order_item_id` | come oggi: `confirm_goods_receipt` richiede un collegamento del fornitore al prodotto ricevuto |

Dichiarato (`purchase_delivery_items.declared_*`) e verificato (`accepted_quantity`, `goods_receipt_items.verified_quantity`) restano campi distinti.

### 4. Se la catena si interrompe a metà (oggi)
- **Giacenza e provenienze:** nessun effetto finché non c'è `confirm_goods_receipt`, perché lotti e movimenti nascono solo lì.
- **Stati intermedi:** però restano salvati. Una consegna può restare `bozza`, `dichiarata`, `in_contestazione` o `accettata`, e un carico in `bozza`. Già dopo l'invio del dichiarato l'ordine passa a `parzialmente_consegnato` anche se in magazzino non è entrato niente.
- **Con la nuova funzione unica:** tutto o niente. Gli stati a metà spariscono per il percorso dell'operatore interno.

## Cosa costruire
1. **Schermata unica** «Registra arrivo merce» nel dettaglio ordine. Ogni riga mostra prodotto, quantità ordinata (o residua) già compilata e i pulsanti **OK / Parziale / Mancante / Danneggiato**:
   - Parziale apre il campo quantità.
   - Mancante apre il motivo.
   - Danneggiato apre il motivo e la quantità buona.
2. **«Conferma tutte come arrivate»**: mette OK solo sulle righe ancora senza esito.
3. **«Dettagli riga ▸»**, richiudibile: lotto, produttore, scadenza, prezzo, U.M. del prezzo, quantità del prezzo, sostituzione.
4. **Nessun «Salva» per riga.** Tutto resta in memoria nella pagina fino a un solo pulsante finale, **«Conferma carico»**, con un riepilogo (N OK, N parziali, N mancanti, N danneggiati).
5. **Consegna già dichiarata dal fornitore** (origine `fornitore_b2b` o `fornitore_link_esterno`): la stessa schermata mostra la colonna **«Dichiarato dal fornitore»** (sola lettura, precompilata). L'esito di chi riceve diventa accettazione o contestazione su quella consegna. Il dichiarato del fornitore non viene sovrascritto.
6. **Percorso vecchio:** «Compila il dichiarato», «Confronto» e «Carico» non compaiono più nel percorso normale. Il codice resta e serve ancora per le consegne a metà già esistenti, che si possono completare.

Nessuna modifica a Danea, Lista della Spesa, Carrello o invio ordini. Le funzioni esistenti del database non cambiano.

## Prove
- **Test sulla logica pura:** traduzione degli esiti nelle righe da inviare, «Conferma tutte» che non tocca le righe già lavorate, riepilogo.
- **Test della nuova funzione:** solo dentro una transazione annullata.
- **Collaudo a schermo:** solo su 3 EMME, da parte tua; da parte mia solo in lettura. Nessun dato reale toccato.

## Dettagli tecnici
- **Migrazione:** `receive_purchase_order` SECURITY DEFINER, `search_path=public`, EXECUTE solo `authenticated`. Lock dell'ordine (`pg_advisory_xact_lock`) e controlli completi **prima della prima scrittura**; dopo, solo `RAISE EXCEPTION`. Riusa `_delivery_open_core`, `_delivery_set_item_core`, `add_purchase_delivery_extra_item`, `_delivery_submit_core`, `dispute_purchase_delivery_item`, `resolve_purchase_delivery_dispute`, `accept_purchase_delivery`, `open_goods_receipt`, `set_goods_receipt_item`, `confirm_goods_receipt`.
- **Se esiste già una consegna** `dichiarata` o `in_contestazione` dal fornitore: si salta l'apertura e la dichiarazione, e si parte da contestazioni e accettazione.
- **Frontend:** nuovo `receive-goods-panel.tsx` e helper puro `receive-outcomes.ts` con test. `purchase-order-detail.tsx` monta il nuovo pannello al posto dei tre passi; nuova funzione server in `purchase.functions.ts`.
- **Domanda aperta:** per «Danneggiato» il motivo predefinito è `qualita`, modificabile nella riga.
