# Avanzamento ordine a 7 passi (lista e dettaglio)

## Verifiche fatte (sola lettura)

| Passo | Tabella e campo | Note |
|---|---|---|
| 1 Inviato | `purchase_orders.sent_at` | confermato |
| 2 Visto dal fornitore | `purchase_orders.seen_by_supplier_at` | confermato |
| 3 Ordine ricevuto | `purchase_orders.danea_exported_at` | vedi sotto |
| 4-6 Preparato / In consegna / Consegnato | nessun campo | restano grigi, fatti assenti |
| 7 Completato | `purchase_orders.status` in `consegnato`, `chiuso` | `parzialmente_consegnato` = scritta "Ricevuto in parte", passo 7 non pieno; data = `updated_at` non affidabile, quindi passo 7 senza data se non c'è un campo dedicato |
| Contestato (laterale rosso) | `purchase_delivery_disputes.status = 'aperta'` sulle consegne dell'ordine | |

**Accesso:** l'acquirente legge `purchase_orders` con la regola `orders_read_buyer` (`is_company_member(company_id)`) e `purchase_delivery_disputes` con `disputes_read_buyer` (stessa regola). I campi sopra stanno già sulla riga dell'ordine dell'acquirente: leggo solo date e stato, mai `danea_export_id`, `danea_exported_station_id` o tabelle del fornitore (`danea_order_exports`, `danea_stations`), che restano invisibili.

**Cosa significa `danea_exported_at`:** è il momento in cui il gestionale del fornitore ha scaricato l'ordine. Viene scritto solo da `danea_mark_orders_exported` (eseguibile solo dal server, chiamata dalla postazione del fornitore): mette `now()` e, se vuoto, valorizza anche `seen_by_supplier_at`. Torna vuoto solo con `danea_requeue_order` (amministratore del fornitore che rimette l'ordine in scarico): in quel caso il passo 3 si spegne di nuovo.

## Cosa cambia

- `order-list-presentation.ts`: nuova funzione pura `orderTimeline(fatti)` che restituisce i 7 passi (etichetta, colore, data raggiunta, attuale sì/no) più l'indicatore "Contestato"; `orderStateDot` e la scritta della card derivano da lì (unico punto di verità). Colore distinto per passo con token del tema, sempre accompagnato dalla scritta. I fatti 4-6 sono campi opzionali oggi sempre assenti. Bozza: "Da inviare"; annullato: "Annullato" grigio.
- Lista (`purchase-orders-panel.tsx`): la card mostra pallino + scritta del passo attuale (es. "Ordine ricevuto"), più "Contestato" in rosso se c'è una contestazione aperta. La lettura aggiunge solo `sent_at`, `seen_by_supplier_at`, `danea_exported_at` e il conteggio delle contestazioni aperte.
- Dettaglio (`purchase-order-detail.tsx`): sotto il numero ORD la barra dei 7 passi, attuale evidenziato, raggiunti pieni con data e ora, non raggiunti grigi; su telefono la barra va a capo/verticale senza scorrimento orizzontale.
- Testi in italiano semplice: nessuna parola tecnica (Danea, send_status).
- Test in `order-list-presentation.test.ts`: solo inviato; visto; ricevuto; consegnato/chiuso → passo 7; parziale → "Ricevuto in parte"; passi 4-6 sempre grigi; contestazione aperta; ordine rimesso in scarico (passo 3 spento).

Nessuna modifica a database, funzioni, Danea, invio ordini, ricezione merce. Prova a schermo solo su 3 EMME in sola lettura.

## Diagnosi data di consegna (solo lettura, nessuna correzione)

- ORD-2026-00002 (ALDER): creato 25/11 21:32 UTC = 22:32 ora di Roma, `delivery_date` 25/11. ORD-2026-00001: creato 24/11 22:09 Roma, consegna 24/11. Entrambi copiano la data della propria Lista (`shopping_lists.delivery_date`).
- Origine: il browser propone la data da `company_settings.default_delivery_day`; per ALDER vale **"oggi"** (nessun orario predefinito). Quindi la data proposta è "oggi" nel fuso dell'azienda (`localToday`, in `list-delivery-date.tsx`, `shopping-list-panel.tsx`, `supplier-orders-dialog.tsx`) e `close_shopping_list` la salva così com'è (`_delivery->>'date'`), senza controllare né l'ora né il tempo di consegna del fornitore.
- Perché cade nel passato: alle 22:32 "oggi" è già praticamente finito, e la data resta fissa sulla Lista anche nei giorni dopo; nessun controllo impedisce una data uguale a oggi a fine giornata o già passata quando la Lista viene chiusa più tardi.
