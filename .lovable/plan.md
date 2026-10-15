# Prezzi variabili fino allo scarico in Danea — piano definitivo

## Decisioni confermate
- Prezzo definitivo = listino assegnato al cliente (stesso archivio Danea) in vigore al momento dello scarico. Mai un altro listino, mai 0, mai inventato.
- Prezzo visto dal cliente all'invio conservato e mai modificato.
- Rapporto sospeso/revocato allo scarico → ordine scaricato comunque, righe senza prezzo con nota «Prezzo da verificare», ordine segnalato nella pagina Danea.
- Articolo non più pubblicato dopo l'ordine → prezzo comunque preso dal listino corretto del cliente (vale solo per ordini già ricevuti).
- «Ultimo aggiornamento listino» = solo importazioni completate che hanno scritto almeno un prezzo, o modifiche manuali effettive. Fallite, senza prezzi o di soli prodotti non contano.
- Riscarico dello stesso ordine → stessi prezzi già registrati, nessun ricalcolo.
- Ordini già scaricati (incluso ORD-2026-00004) non modificati né rimessi in scarico.
- Avviso «Listino non ancora aggiornato oggi» solo nella pagina Danea di Trevi Fruit, senza bloccare lo scarico.
- Nessun nuovo passaggio obbligatorio di preparazione o sblocco.

## Fasi (nell'ordine)

**Fase 1 — Ultimo aggiornamento reale e orario abituale**
- Migrazione A:
  - `company_settings.price_list_updated_at` (nullable) e `price_info_text` (testo personalizzabile, nullable).
  - Nuovo tipo `aggiornamento_listino` in `company_operational_schedules` (orario facoltativo, informativo) via `manage_company_operational_schedule`.
  - Funzione `_touch_price_list_updated(company_id)`; chiamata a fine importazione listino Danea solo se esito completato e prezzi scritti > 0, e dalle modifiche manuali dei prezzi (trigger su `product_prices` solo se netto/lordo cambiano davvero, escluso durante l'importazione che aggiorna una sola volta alla fine).
  - Nessun valore inventato: per i dati esistenti il campo resta vuoto fino al prossimo aggiornamento reale (oppure, se approvi, ricavato dall'ultima importazione completata con prezzi).
- Codice: `src/lib/danea-import.server.ts` (chiamata a fine importazione), Impostazioni → Azienda (orario + testo).

**Fase 2 — Messaggio al cliente**
- Migrazione B: funzione `seller_price_info(seller_id)` (SECURITY DEFINER, solo clienti collegati attivi o il venditore stesso) → ultimo aggiornamento, orario, testo.
- Codice: componente unico del messaggio in Catalogo fornitore, riepilogo prima dell'invio e stampa dell'ordine. Senza orario la parte relativa è omessa; nessuna percentuale o promessa.

**Fase 3 — Prezzo definitivo allo scarico**
- Migrazione C:
  - Tabella `danea_order_export_lines` (export_id, order_id, item_id, prezzo scelto, U.M. prezzo id+codice, numero listino, archivio, `price_list_updated_at` usato, prezzo e U.M. visti dal cliente, motivo assenza). GRANT + RLS (lettura solo azienda venditrice), scrittura solo servizio, righe immutabili (trigger anti-modifica).
  - Funzione `_order_line_export_price(seller, buyer, product)`: stessa regola di `applicable_b2b_price` ma senza il controllo «articolo pubblicato», con rapporto attivo obbligatorio; restituisce anche U.M. del prezzo. `applicable_b2b_price` resta invariata (usata da Lista/Ordini).
  - Nuova funzione `danea_export_orders_priced(station, ids)`: in una sola transazione prende un lock condiviso sul listino del venditore (l'importazione listino prende lo stesso lock in esclusiva), calcola i prezzi di tutte le righe, scrive esportazione + righe, segna gli ordini e restituisce i prezzi. Così tutto lo scarico usa una sola versione del listino. Per ordini già esportati restituisce i prezzi salvati.
  - Le funzioni attuali restano per compatibilità con l'app pubblicata.
- Codice: `danea-orders-export.server.ts` (usa la nuova funzione, l'XML si genera dai prezzi restituiti); `danea-orders-xml.ts` (Price solo con U.M. uguale e prezzo > 0; note «Prezzo su richiesta», «U.M. prezzo diversa – da pesare», «Prezzo da verificare»; prezzo cliente in nota se diverso).
- Ordini scaricati prima di questa fase (ORD-2026-00004): nessuna riga di storico creata a posteriori; se Danea li richiede di nuovo per numero escono con il prezzo dell'ordine come oggi.

**Fase 4 — Pagina Danea**
- Riquadro «Scarico ordini»: ultimo aggiornamento listino, orario abituale, avviso «Listino non ancora aggiornato oggi» (ultimo aggiornamento completato precedente all'orario di oggi, ora di Roma), avviso salvato nello storico scarico (campo `warnings` in `danea_order_exports`, migrazione C); elenco ordini con «Prezzo da verificare»; dettaglio prezzi esportati per ordine.

## Prove
- Test automatici (node:test): prezzo nuovo in XML; prezzo cliente invariato; mai 0; U.M. diversa → nota; rapporto sospeso → «Prezzo da verificare»; articolo nascosto → prezzo del listino corretto; nessun prezzo da altri listini; riscarico → stessi prezzi; avviso orario (prima/dopo, senza orario).
- Prove DB solo in transazioni annullate con dati finti: importazione fallita/senza prezzi non aggiorna la data; lock: scarico e importazione contemporanei non mischiano listini; storico immutabile.
- Compatibilità Danea: XML confrontato con il formato attuale (stessi campi, Number, filtri firstnum/lastnum, riscarico per numero); scarico senza ordini nuovi invariato.

## Condizioni di arresto
Mi fermo e ti avviso senza proseguire se: una migrazione fallisce; un test esistente o nuovo non passa; l'XML cambia oltre ai campi previsti; una prova tocca dati reali; trovo ordini già scaricati che verrebbero modificati.

## Protezione dei dati esistenti
- Solo aggiunte: nessuna colonna rimossa o cambiata, nessun dato operativo modificato, `purchase_order_items` mai riscritta.
- Nessun ordine rimesso in scarico; nessuna pubblicazione senza tuo permesso.

## File toccati
Migrazioni A, B, C; `src/lib/danea-import.server.ts`, `src/lib/danea-orders-export.server.ts`, `src/lib/danea-orders-xml.ts` (+ test), `src/components/danea/order-download-panel.tsx`, Impostazioni → Azienda (`operational-schedules-form.tsx`), Catalogo fornitore, finestra di invio ordine, stampa ordine, nuovo componente del messaggio, `AGENTS.md`.
