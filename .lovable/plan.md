# Prezzi variabili fino allo scarico in Danea (Soluzione B)

## Analisi dello stato attuale (sola lettura)

1. **Dove sono i prezzi**
   - Listino del venditore: `product_prices` (company_id, product_id, list_number, net_price, gross_price, updated_at). U.M. del prezzo: `products.price_unit_id`.
   - Listini Danea: `danea_price_lists` (numero, nome, attivo, archivio).
   - Listino assegnato al cliente: `customer_records.assigned_price_list_number` (+ archive_id), tramite `supplier_customer_relations`.
   - Prezzo dell'ordine (quello visto dal cliente): `purchase_order_items.unit_cost` + `price_unit_id` / `price_unit_code`. Scritto all'invio, oggi è anche quello che va in Danea.
   - Storico prezzi: `supplier_price_observations` / `supplier_price_series` (fonte danea_price_list, b2b_price_list, manual_cost…).
2. **Ora dell'ultimo aggiornamento**: `danea_sync_runs` (finished_at, outcome completato, per azienda/archivio) per le importazioni Danea; `product_prices.updated_at` per le modifiche manuali. Il dato non è oggi salvato in un unico punto affidabile → proposta: nuovo campo per azienda aggiornato da entrambe le vie.
3. **Orario abituale**: nuova riga in `company_operational_schedules` (tipo «aggiornamento listino», facoltativo, solo informativo), gestita con `manage_company_operational_schedule` già esistente; testo informativo personalizzabile salvato nella stessa riga. Schermata: Impostazioni → Azienda, accanto al promemoria Lista della Spesa.
4. **Dove compare il messaggio**: intestazione del Catalogo fornitore lato cliente, riepilogo ordine prima dell'invio (dialogo di invio / finestra Genera ordini per fornitori B2B), stampa dell'ordine. Senza orario abituale la parte relativa viene omessa. Nessuna percentuale né promessa.
5. **`applicable_b2b_price` oggi**: dato venditore+cliente+prodotto, trova il listino assegnato al cliente (rapporto attivo e abilitato da entrambe le parti, listino attivo dello stesso archivio), restituisce netto/lordo da `product_prices`, solo se l'articolo è acquistabile (`b2b_item_purchasable`). Nessun fallback. Limiti per lo scarico: richiede il rapporto ancora attivo e l'articolo ancora pubblicato; non restituisce l'U.M. del prezzo né l'ora del listino.
6. **Esportazione XML**: oggi `danea_orders_export_candidates` passa `unit_cost` della riga. Nuovo: la selezione restituisce per ogni riga il prezzo del listino corrente (stessa regola di `applicable_b2b_price`, con U.M. del prezzo del prodotto venditore). Il resto della regola XML non cambia: Price solo se U.M. riga = U.M. prezzo e prezzo > 0; altrimenti campo omesso e motivo nelle note («Prezzo su richiesta», «U.M. prezzo diversa – da pesare»). Prezzo visto dal cliente indicato solo in nota se diverso.
7. **Storico del prezzo esportato**: nuova tabella `danea_order_export_lines` (export_id, order_id, item_id, prezzo scelto, U.M. prezzo, numero listino, ora aggiornamento listino, motivo assenza, prezzo cliente originale). Sola scrittura dal servizio, lettura per l'azienda venditrice, mai modificata. `purchase_order_items.unit_cost` non viene mai toccato.
8. **Coerenza durante uno scarico**: tutta la lettura prezzi + registrazione avviene in **una sola funzione DB** in una transazione, con lock condiviso per venditore (`pg_advisory_xact_lock_shared`) che l'importazione listino prende in modo esclusivo: uno scarico vede o tutto il listino vecchio o tutto il nuovo. Il server prepara l'XML solo con le righe restituite da quella funzione, che salva anche lo storico prima della risposta.
9. **Migrazioni e codice** (vedi fasi).
10. **Protezione**: gli ordini già scaricati (incluso ORD-2026-00004) non vengono rimessi in scarico né ricalcolati; i riscarichi richiesti da Danea per numero riusano il prezzo già registrato in storico, non il listino nuovo. Nessun nuovo passaggio obbligatorio di preparazione/sblocco. Prove solo in transazioni annullate.

## Fasi

**Fase 1 — Orario e ultimo aggiornamento**
- Migrazione: tipo pianificazione «aggiornamento listino» + testo informativo; campo `companies`/`company_settings.price_list_updated_at` aggiornato da trigger su importazione listini Danea e modifiche manuali di `product_prices`.
- Impostazioni → Azienda: campo orario facoltativo e testo personalizzabile.

**Fase 2 — Messaggio al cliente**
- Componente unico del messaggio usato in Catalogo fornitore, invio ordine e stampa. Lettura tramite funzione DB che espone al cliente collegato solo orario, ultimo aggiornamento e testo.

**Fase 3 — Prezzo definitivo allo scarico**
- Migrazione: tabella `danea_order_export_lines` (GRANT, RLS su company_id venditore); nuova funzione di scarico che in una transazione con lock legge prezzi correnti, registra ordini e righe; importazione listino con lock esclusivo.
- `danea-orders-export.server.ts`, `danea-orders-xml.ts`: uso del prezzo dello scarico; note per prezzo mancante/U.M. incompatibile; riscarichi con prezzo storico.
- Test: prezzo nuovo in XML, prezzo cliente invariato, mai 0, U.M. diversa → nota, riscarico con prezzo registrato.

**Fase 4 — Pagina Danea**
- Riquadro «Scarico ordini»: data/ora ultimo aggiornamento listino; avviso «Listino non ancora aggiornato oggi» se lo scarico avviene prima dell'orario abituale, registrato nello storico dello scarico (senza bloccarlo); dettaglio prezzi esportati per ordine.

## Punti da decidere
- Se il rapporto con il cliente è sospeso o l'articolo non è più pubblicato al momento dello scarico: proposta = nessun prezzo e nota «Prezzo da verificare», mai il prezzo vecchio in automatico.
- Danea vede l'avviso solo nell'app (Danea non mostra messaggi dal file): conferma che va bene.
