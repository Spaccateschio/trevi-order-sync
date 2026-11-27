# Ordini fornitore: pagina compatta, stati unici e vista di partenza

Solo presentazione e ordinamento. Nessuna modifica a database, RPC, Danea, invio ordini, ricezione merce.

## Da dove arrivano i dati (verificato nel codice)

| Dato | Fonte |
|---|---|
| Elenco ordini | funzione di lettura `purchase_order_overview` (status, send_status, delivery_date, destination_name, sent_at…) |
| Passi 1-3 e 7 | `purchase_orders.sent_at`, `seen_by_supplier_at`, `danea_exported_at`; 7 = status `consegnato`/`chiuso` |
| Passi 4-6 | `order_delivery_progress` (documenti Trevi Incassi: prepared_at, in_carico_at, consegna_at) |
| Contestato | `purchase_deliveries.status = 'in_contestazione'` |
| Data di consegna | `purchase_orders.delivery_date` (scelta nell'invio dal Carrello) |
| Destinazione | `purchase_orders.destination_location_id` → `inventory_locations.name`. Oggi serve solo come magazzino di ricezione: in `create_purchase_orders_from_list` se vuota si usa il magazzino predefinito; si cambia con `manage_purchase_order('set_destination')` |
| Lista confermata | `shopping_lists` con `status = 'confermata'`. Il menu è vuoto perché oggi gli ordini nascono dal Carrello della Lista, che porta la lista a `chiusa` senza fermarsi in `confermata`. Lo confermo con una lettura dei conteggi su 3 EMME come primo passo |
| Conteggi filtri | calcolati nel browser: «In attesa» = inviati non ancora ricevuti del tutto; «Acquisti diretti» = numero di documenti AD letti a parte |

## Cosa cambia

1. **Titolo**: la frase sulla giacenza esce dalla pagina e va in un'icona (i) accanto a «Ordini fornitore» (popover al tocco).
2. **Avviso verde** «Ordine … inviato a …»: su questa pagina sparisce da solo dopo 6 secondi. Lista della Spesa e Inventario restano come oggi.
3. **Genera ordini**: pulsante che apre un pannello con Lista confermata e Destinazione (stessi campi, stessa generazione). Senza liste: «Nessuna Lista della Spesa confermata», collegamento alla Lista della Spesa, Genera disabilitato.
4. **Filtri**: desktop in riga. Telefono: un pulsante ocra con tre puntini che apre l'elenco; accanto sempre «filtro attivo · N ordini». Filtri: Oggi, Da inviare, In attesa merce, Ricevuti, Tutti, Acquisti diretti. Destinazione è un dato dell'ordine: aggiungo il filtro Destinazione nello stesso pannello, mostrato solo se l'azienda ha più di una destinazione.
5. **Vista card/riga** con interruttore: card come oggi; riga compatta con freccia che apre righe, quantità, «Registra arrivo merce» e menu ⋮. Telefono parte da riga, desktop da card (scelta solo locale, nulla salvato).
6. **Stati unici** da orderTimeline: Da inviare · Inviato (passi 1-2) · In lavorazione (3) · Pronto per la consegna (4) · In consegna (5) · Consegnato (6) · Completato (7). Rinomino «Ordine ricevuto» → «In lavorazione», «Ordine preparato» → «Pronto per la consegna» anche nella barra dei 7 passi. Restano «Ricevuto in parte», «Contestato», «Non consegnato».
7. **Ordine**: Da inviare, In consegna, Pronto per la consegna, In lavorazione, Inviato; a parità, consegna più vicina. Ricevuto in parte lo metto con In consegna (merce in arrivo); poi Consegnato, Completato, Annullato (visibili solo in Tutti/Ricevuti).
8. **Vista di partenza**: se ci sono ordini Da inviare → filtro «Da inviare»; altrimenti «Oggi» = non completati con consegna oggi (data italiana) **più** quelli con consegna passata non consegnati, marcati «In ritardo». Consegnato/Completato/Annullato nascosti all'avvio.
9. **Acquisti diretti** invariati nel loro filtro.

## Dettagli tecnici

- File: `order-list-presentation.ts` (funzioni pure: `orderStage`, `compareOrderStage`, `isLate`, `initialOrderFilter`, filtro `oggi`, rinomina etichette), `order-list-presentation.test.ts`, `purchase-orders-panel.tsx`, `order-timeline-bar.tsx` (solo etichette se le legge da qui), `routes/_authenticated/acquisti.ordini.tsx` (titolo con (i)), `sent-orders-banner.tsx` (nuova prop facoltativa `autoHideMs`, default invariato).
- Il filtro iniziale si sceglie una volta sola dopo il primo caricamento; poi decide l'utente.
- «In ritardo» = `delivery_date` < oggi (Europe/Rome) e stato non consegnato/chiuso/annullato.
- Test sulla logica pura: stati, ordine, vista di partenza, ritardi.
- Prova a schermo 390 px e desktop su 3 EMME in sola lettura (nessun clic su Genera, Invia o Conferma).
