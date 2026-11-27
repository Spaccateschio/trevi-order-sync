# Ordini clienti (lato fornitore): stesso vocabolario di stati del cliente

## Situazione attuale (verificata nel codice)

File: `src/components/sales/received-orders-panel.tsx`, usato da `vendite_.ordini-clienti.tsx`.

- Badge di stato: mappa fissa `STATUS_LABEL` su `purchase_orders.status` (inviato → «Ricevuto», parzialmente_consegnato, consegnato, chiuso → «Chiuso», annullato → «Annullato»). Non usa `orderTimeline`.
- «Scaricato da Danea»: badge separato acceso da `purchase_orders.danea_exported_at`.
- «Annullato dopo lo scarico in Danea: annullare anche in Danea»: badge rosso quando `danea_exported_at` è valorizzato e `status = annullato`.
- Lista: un unico elenco ordinato per `created_at` decrescente, senza schede. Gli annullati mai aperti dal fornitore sono già esclusi.

## Si può usare orderTimeline senza nuove letture?

No, non del tutto. La pagina legge già `status`, `sent_at`, `seen_by_supplier_at` e `danea_exported_at`, quindi i passi Inviato, In lavorazione e Completato. Mancano:
- i passi 4–6 (Pronto, In consegna, Consegnato) e «Non consegnato», che vengono da `order_delivery_progress`. La funzione consente già la lettura ai membri del fornitore;
- «Contestato», che viene da `purchase_deliveries.status = in_contestazione`. La regola di accesso `deliveries_read_supplier` lo consente già al fornitore.

Serve quindi una sola lettura aggiuntiva, in sola lettura, con funzioni e permessi già esistenti: una chiamata a `order_delivery_progress` per gli ID in lista e la lettura dello stato delle consegne nello stesso select degli ordini. Nessuna modifica al database.

## Cosa cambia (solo presentazione)

1. Il badge mostra lo stato unico calcolato da `orderTimeline` con gli stessi fatti del cliente: Inviato · In lavorazione · Pronto per la consegna · In consegna · Consegnato · Completato. Contestato e Non consegnato compaiono come badge rossi aggiuntivi; Annullato sostituisce lo stato. «Ricevuto in parte» resta come oggi per le consegne parziali.
2. «Scaricato da Danea» resta un badge separato, non uno stato. L'avviso «Annullato dopo lo scarico in Danea…» e «Modificato dopo lo scarico» restano invariati.
3. Ordinamento come lato cliente (`orderStageRank` + `compareOrderStage`): prima da lavorare (Inviato, In lavorazione), poi Pronto, poi In consegna, poi Consegnato, Completato e Annullato in fondo; a parità di stato, prima la consegna più vicina.
4. Schede con contatore: **Da lavorare** (Inviato, In lavorazione, Pronto per la consegna) · **In consegna** (In consegna, Ricevuto in parte) · **Consegnati** (Consegnato, Completato) · **Tutti** (annullati compresi). All'apertura parte da «Da lavorare» se ci sono ordini, altrimenti da «In consegna». Su telefono le schede stanno in un menu a tendina.
5. Comandi esistenti (apertura, segna come visto, annulla, richieste di modifica, promemoria Danea) invariati.

## Prove

- Test di logica pura: mappa scheda/stato lato fornitore, scheda iniziale, ordinamento, Contestato/Non consegnato come badge aggiuntivi, Danea mai trattato come stato.
- Prova a schermo in sola lettura su 3 EMME, se ha ordini ricevuti come fornitore. Se non ne ha, lo dirò senza provare su aziende reali. Gli ordini non verranno aperti, perché aprirli segna l'ordine come visto.

## Dettagli tecnici

- Nuovo helper puro `src/components/sales/received-order-presentation.ts` (`sellerOrderFilter`, `initialSellerFilter`, `SELLER_FILTER_LABELS`) che riusa `orderTimeline`, `orderStageRank` e `compareOrderStage` da `order-list-presentation.ts` senza modificarli. Per il fornitore `send_status` viene considerato «inviato».
- `received-orders-panel.tsx`: aggiungere `purchase_deliveries(status)` al select, una query React Query su `order_delivery_progress`, il riuso di `deliveryTimelineFacts`, la rimozione dell'uso di `STATUS_LABEL`/`STATUS_VARIANT` dal badge e le schede shadcn.
