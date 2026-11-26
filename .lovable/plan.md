# Riorganizzazione pagina «Ordini fornitore»

Solo presentazione. Nessuna modifica a database, funzioni del database, esportazione Danea, Lista della Spesa, Carrello o logica del carico merce.
File: `acquisti.ordini.tsx`, `purchase-orders-panel.tsx`, `order-receiving-panel.tsx`, `purchase-order-detail.tsx` (+ un piccolo file helper con il suo test, se lo approvi).

## Da dove arrivano i dati (verificato)

- **Visto dal fornitore**: `purchase_orders.seen_by_supplier_at`, letto oggi dal pannello con una lettura diretta della tabella.
- **Preso in carico**: oggi nell'app NON usa `danea_exported_at`. La scritta «Ordine preso in carico dal fornitore» e il blocco di «Modifica» si basano su `seen_by_supplier_at` (ordine B2B con `relation_id` e stato `inviato`).
  `purchase_orders.danea_exported_at` esiste ed è valorizzato (ORD-00021…00026 sì). L'acquirente può leggere la riga intera (regola `orders_read_buyer`: membro dell'azienda), quindi tecnicamente lo vede; oggi l'app non lo legge. Propongo di **mantenere la regola attuale** (`seen_by_supplier_at`) per «Modifica disattivata»; dimmi se vuoi passare a `danea_exported_at`.
- **Invio**: `purchase_orders.send_status`. La funzione `purchase_order_overview` NON restituisce il valore grezzo: se l'ordine non è in bozza e `send_status` è `da_inviare` (o vuoto), restituisce **`inviato`**; altrimenti il valore salvato.

## 1. Una sola lista
- Tolte le schede «Ordini / Da ricevere».
- Filtri sopra (stato locale): **Tutti**, **Da inviare**, **In attesa merce (N)**, **Ricevuti**. Gli annullati restano visibili solo in «Tutti», in fondo.
- Ordinamento: prima gli ordini in attesa merce, poi per data (consegna prevista, poi creazione).
- Un solo helper `isAwaitingGoods(o)` = `send_status === "inviato"` e stato `inviato` o `parzialmente_consegnato`, usato al posto delle due copie attuali (pagina e pannello ricezione).
- «Ricevuti» = stato `consegnato` o `chiuso`. «Da inviare» = gruppi attuali «da inviare» + «errore invio».

## 2. Card
Fornitore, numero ORD, consegna prevista, righe con quantità e U.M. d'acquisto, pallino di stato (solo grafico):
grigio bozza · rosso errore invio · blu inviato · ocra parziale · verde ricevuto/chiuso · grigio barrato annullato. Lettura righe: una sola query su `purchase_order_items` per gli ordini visibili.

## 3. Pulsante principale + menu ⋮
- Bozza → **Invia** (apre il dettaglio con l'invio di oggi).
- Inviato → **Registra arrivo merce**; Parziale → **Continua ricezione** (aprono il carico merce attuale).
- Consegnato/chiuso/annullato → **Visualizza**.
- Menu ⋮: Visualizza ordine, Rimanda ordine, Modifica, Chiedi modifica, Chiama, Nuovo ordine, con le stesse condizioni di oggi (Modifica disattivata se preso in carico; Chiedi modifica nascosta se una richiesta è in attesa).

## 4. Dettaglio
- «Torna alla ricezione» diventa **«Torna agli ordini»** e torna alla lista unica.
- Tolti i testi che rimandano alla pagina «Ricezione ordini».

## 5. Scritta «Incoerenza»
Tolta dal dettaglio (e la lettura che la alimenta). Nessuna correzione dei dati.

**Diagnosi (solo lettura, nessuna correzione):** ORD-2026-00021…00026 di 3 EMME hanno `status=inviato`, `sent_at` valorizzato, `send_channel=piattaforma`, `relation_id` presente, ma `send_status=da_inviare`.
Causa: l'azione `send` di `manage_purchase_order` per gli ordini B2B aggiorna solo `status='inviato'`, `sent_at` e `send_channel='piattaforma'`, **senza mai scrivere `send_status='inviato'`**. Il valore `inviato` viene scritto solo dal percorso non B2B (`confirm_non_b2b_order_share`). La lista non se ne accorge perché `purchase_order_overview` lo trasforma in `inviato`; il dettaglio invece leggeva il campo grezzo e mostrava l'incoerenza. La correzione (modifica alla funzione e riallineamento dei dati) richiede un piano separato.

## Cosa non cambia
Database, funzioni, Danea, Lista, Carrello, carico merce, «Acquisti diretti» e banner ordini (restano sotto la lista).

## Verifica
Test del helper (in attesa merce, ricevuti, ordinamento), build, controllo a schermo in sola lettura su 3 EMME se disponibile un accesso consentito.
