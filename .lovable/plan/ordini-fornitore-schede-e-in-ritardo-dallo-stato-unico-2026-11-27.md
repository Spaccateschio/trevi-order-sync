# Ordini fornitore: schede e «In ritardo» dallo stato unico

## Da dove arrivano i dati oggi
- Riga dell'ordine: `purchase_order_overview` → `status`, `send_status`, `delivery_date`, `created_at` (in `purchase-orders-panel.tsx`).
- Passi 1-3: `purchase_orders.sent_at`, `seen_by_supplier_at`, `danea_exported_at`; contestazione: `purchase_deliveries.status = 'in_contestazione'`.
- Passi 4-6 (ponte Incassi): RPC in sola lettura `order_delivery_progress` → `deliveryTimelineFacts` → `prepared_at`, `shipped_at`, `delivered_at` (da `supplier_delivery_documents`).
- Passo 7: `purchase_orders.status` `consegnato`/`chiuso`.
- `orderTimeline` unisce questi fatti e dà lo stato unico scritto sulla riga.

## Come si decide oggi la scheda
- `matchesOrderListFilter` guarda solo `status`/`send_status`: «In arrivo» = `send_status='inviato'` e `status` `inviato`/`parzialmente_consegnato`; «Ricevuti» = `status` `consegnato`/`chiuso`.
- `isLateOrder` = «In arrivo» (stessa regola) + `delivery_date` < oggi.
- Quindi un ordine con passo 6 Consegnato da Incassi ma `status='inviato'` resta in «In arrivo» e mostra «In ritardo». Lo stato unico non viene usato.

## Modifica (solo presentazione)
In `order-list-presentation.ts`:
- nuova funzione pura `orderUnifiedDelivered(t)`: vero se il passo attuale è Consegnato o Completato.
- `matchesOrderListFilter(o, filter, cancelled, timeline?)`:
  - In arrivo: inviato, non annullato, e stato unico non Consegnato/Completato.
  - Ricevuti: stato unico Consegnato o Completato (oppure `status` consegnato/chiuso come oggi).
  - Da inviare, Tutti, Acquisti diretti: invariati.
- `isLateOrder(o, today, cancelled, timeline?)`: solo se stato unico prima di Consegnato e data passata.
- Senza `timeline` il comportamento resta quello di oggi (la schermata di ricezione non cambia).
- «Registra arrivo merce» resta su un ordine Consegnato con `status='inviato'`: `orderMainAction` lo dà già.

In `purchase-orders-panel.tsx`: passare a filtri, contatori e «In ritardo» la stessa `orderTimeline` usata per la riga.

## Test (logica pura)
- Consegnato da Incassi con `status='inviato'` → Ricevuti, non In arrivo, non In ritardo, azione «Registra arrivo merce».
- Completato → Ricevuti.
- Pronto per la consegna / In consegna con data passata → In arrivo e In ritardo.
- Annullato → nessuna delle due schede; Tutti invariato.

## Verifica
Prova a schermo al telefono (390 px) su 3 EMME, solo in lettura.

Nessuna modifica a database, RPC, Danea, invio ordini, ricezione merce.
