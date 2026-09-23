# Controllo andamento prezzo — piano tecnico definitivo

Registro storico dei prezzi per **azienda monitorante + fornitore + referenza**, con prodotto interno collegato solo dopo l'adozione. Nessun cambiamento a Inventario, Fabbisogno, Lista della Spesa, ordini, Danea o B2B oltre ai punti in cui si registra l'osservazione.

## Cosa vedrai

Una piccola icona € accanto al prodotto: nel Catalogo Acquisti per gli articoli preferiti/monitorati e nell'Inventario per i prodotti adottati. Al clic (o tap) un riquadro mostra prezzo attuale, prezzo precedente, differenza in euro e in percentuale con freccia rossa in su / verde in giù / uguale giallo ocra, la provenienza del prezzo, la data dell'ultimo aggiornamento e le ultime osservazioni. Nessun grafico, nessuna modifica di prezzo dal riquadro.

## 1. Nuove tabelle

### `supplier_price_observations` (append-only)
- Chiave di serie: `company_id` (chi monitora), `supplier_company_id` (nullable: fornitore non registrato), `supplier_record_id` (nullable: anagrafica fornitore interna), `supplier_product_id` (nullable: articolo del catalogo del fornitore), `supplier_reference` (codice referenza testuale, sempre valorizzato quando manca `supplier_product_id`).
- Collegamento interno: `product_id` nullable, `product_supplier_link_id` nullable.
- Prezzo: `kind` enum `price_observation_kind` = `observed_price` | `actual_purchase_cost`; `net_price`, `gross_price` (almeno uno non nullo), `currency` default `EUR`, `price_basis` enum `price_basis` = `netto` | `lordo`.
- U.M.: `price_unit_code`, `conversion_factor` e `conversion_reference_um` congelati nell'osservazione (nulli se nessuna conversione esplicita).
- Provenienza: `source` enum `price_observation_source` = `danea_supplier_cost` | `danea_price_list` | `b2b_price_list` | `manual_cost` | `supplier_confirmation` | `goods_receipt`; `price_list_number`, `price_list_id`, `source_event_key` (testo: identità dell'evento, es. `danea:<sync_run_id>:<product>:<kind>`), `source_ref_table`/`source_ref_id`.
- Tempi: `observed_at` (prima volta che questo valore è stato visto), `last_seen_at` (ultima conferma dello stesso valore), `created_at`, `updated_at` (trigger).
- Note: `notes`.

### `supplier_price_series` (stato corrente, una riga per serie e `kind`)
Chiave unica sulla serie + `kind`; contiene `current_observation_id`, `previous_observation_id`, `current_*` e `previous_*` (prezzo, U.M., basis, valuta, fonte), `comparable` boolean, `delta_amount`, `delta_percent`, `direction` (`up`|`down`|`equal`|`not_comparable`), `last_seen_at`. Aggiornata dalla stessa funzione che inserisce l'osservazione: evita query pesanti nelle liste.

## 2. Chiavi e indici
- Unico su `supplier_price_observations(company_id, source, source_event_key)` dove `source_event_key` non è nullo → idempotenza degli import.
- Indice sulla serie: `(company_id, supplier_company_id, supplier_product_id, supplier_reference, kind, observed_at desc)`.
- Indice `(company_id, product_id, kind, observed_at desc)` per l'Inventario.
- Unico su `supplier_price_series(company_id, supplier_company_id, supplier_product_id, supplier_reference, kind)` con `coalesce` su una colonna generata di identità serie.

## 3. RLS e grant
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role` su entrambe le tabelle; nessun accesso `anon`.
- RLS abilitato; lettura e scrittura solo se `is_company_member(company_id)` (scrittura riservata ai ruoli operativi via `has_company_role`), coerente con le altre tabelle dell'app.
- Storico immutabile: trigger che vieta `UPDATE` dei campi prezzo/fonte/U.M. e vieta `DELETE` (solo `last_seen_at` aggiornabile), come già fatto per gli altri storici.

## 4. Eventi che scrivono lo storico
Un'unica funzione `record_price_observation(...)` (SECURITY DEFINER, `search_path = public`) chiamata da:
1. **Import Danea, costo fornitore** — dopo l'aggiornamento di `product_supplier_costs`: `source = danea_supplier_cost`, `source_event_key` con l'id della sincronizzazione.
2. **Import Danea, listini** — solo per il listino effettivamente applicabile: `danea_price_list` con `price_list_number`.
3. **Prezzo B2B applicabile alla mia azienda** — registrato alla lettura del catalogo/listino assegnato (`b2b_price_list`, con numero/id listino), incluso il cambio di listino assegnato.
4. **Costo manuale** del collegamento fornitore, alla conferma (`manual_cost`).
5. **Conferma carico merce** — `kind = actual_purchase_cost`, `source = goods_receipt` (mai usato per la freccia principale).
6. **`supplier_confirmation`** — predisposto ma non attivo: il modulo del fornitore non viene toccato ora.

## 5. Deduplicazione
- Stesso `source_event_key` → nessun inserimento (idempotenza dell'evento).
- Stesso contenuto confrontabile dell'ultima osservazione della serie (prezzo, valuta, U.M., basis, fonte, listino) → nessuna nuova riga, solo `last_seen_at = now()` sull'osservazione corrente e sulla serie.
- Valore diverso → nuova osservazione; la precedente resta intatta e diventa `previous_observation_id`.

## 6. Preferito → prodotto adottato
- Il monitoraggio parte dalla ⭐ (`buyer_product_favorites`) senza creare prodotti: la serie usa `supplier_company_id + supplier_product_id`.
- All'adozione (`add_catalog_product_to_own_products`) si valorizza `product_id` e `product_supplier_link_id` sulle righe esistenti della serie: nessuna copia, nessuna seconda cronologia.
- Togliere la ⭐ non cancella nulla dello storico.
- Un mio prodotto con più fornitori ha una serie distinta per fornitore/referenza: mai uno storico unico indistinto.

## 7. Query/RPC
- `price_trend_for_products(_product_ids uuid[])` → riga di serie per prodotto e fornitore (per Inventario/Fabbisogno).
- `price_trend_for_catalog(_seller_company_id uuid, _supplier_product_ids uuid[])` → per il Catalogo Acquisti e i preferiti.
- `price_observation_history(_series ...)` → ultime N osservazioni, con `actual_purchase_cost` mostrato separatamente.
- Confronto mostrato solo fra osservazioni realmente confrontabili; altrimenti "Confronto non disponibile: unità o natura del prezzo differenti", senza freccia.

## 8. Componenti UI
- `src/components/pricing/price-trend-icon.tsx` — icona € con stato acceso/spento e freccia.
- `src/components/pricing/price-trend-popover.tsx` — contenuto del riquadro (attuale, precedente, Δ €, Δ %, fonte, ultimo aggiornamento, ultime osservazioni, costo effettivo in sezione separata).
- `src/lib/pricing.ts` — tipi, formattazioni, regole di confrontabilità.
- Punti di uso: `catalog-list.tsx` e il dettaglio articolo del catalogo, la `ProductCard` dell'Inventario e la riga/tabella Fabbisogno. Lista della Spesa in un secondo momento.
- Colori solo da token esistenti (rosso destructive, verde, giallo ocra).

## 9. Desktop / smartphone
- Desktop e tablet: hover mostra un riepilogo breve, clic apre il riquadro completo.
- Smartphone: tap apre lo stesso contenuto in un foglio a scomparsa, icona con area di tocco adeguata.

## 10. Migrazione dei dati esistenti
Una sola osservazione iniziale per ogni valore corrente oggi presente, con `observed_at` uguale alla data disponibile (`received_at`, `manual_cost_at`, altrimenti data di creazione) e `source_event_key = 'backfill:<tabella>:<id>'`: da `product_supplier_costs`, `product_supplier_links.manual_cost`, listini applicabili, e come `actual_purchase_cost` da `goods_receipt_items` confermati. Nessuna freccia inventata: con una sola osservazione il riquadro dirà "primo prezzo conosciuto".

## 11. Test
- Serie separate per fornitori diversi sullo stesso prodotto.
- Prima osservazione → nessuna freccia; secondo valore più basso → verde; più alto → rosso; identico entro tolleranza → uguale ocra.
- Stesso prezzo ricevuto due volte → nessuna nuova osservazione, `last_seen_at` aggiornato.
- Stesso evento di import ripetuto → nessun duplicato.
- U.M. o netto/lordo differenti → nessuna freccia, messaggio di non confrontabilità.
- ⭐ su un articolo non adottato → storico visibile nel Catalogo, prodotto non presente in Inventario.
- Adozione successiva → stessa cronologia visibile anche in Inventario, nessuna duplicazione.
- `actual_purchase_cost` da carico confermato non altera la freccia principale.
- RLS: un'altra azienda non vede le osservazioni; tentativo di modifica/cancellazione respinto.
- Verifica in app su Catalogo e Inventario dopo l'implementazione.

## Fuori scope
Grafico dell'andamento, modifica dei prezzi dal riquadro, campo prezzo nel modulo del fornitore, valorizzazione di magazzino, modifiche a formule di giacenza/fabbisogno, Lista della Spesa, ordini e logiche commerciali.
