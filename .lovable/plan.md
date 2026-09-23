# Controllo andamento prezzo — piano tecnico definitivo (rev. 2)

Registro storico dei prezzi per **azienda monitorante + fornitore + referenza**, con il prodotto interno collegato solo dopo l'adozione. Nessuna modifica a Inventario, Fabbisogno, Lista della Spesa, ordini, Danea o B2B oltre agli agganci necessari a registrare le osservazioni.

## Cosa vedrai

Una piccola icona € accanto al prodotto: nel Catalogo Acquisti per gli articoli preferiti/monitorati e nell'Inventario per i prodotti adottati. Al clic (o tap) si apre un riquadro con prezzo attuale, prezzo precedente, differenza in euro e in percentuale con freccia rossa in su / verde in giù / uguale giallo ocra, provenienza del prezzo, data dell'ultimo aggiornamento e ultime osservazioni. Nessun grafico, nessuna modifica di prezzo dal riquadro.

## Correzioni applicate in questa revisione

1. **Aprire il catalogo non scrive nulla.** Le osservazioni nascono solo da un cambio reale del dato sorgente; il Catalogo legge.
2. **Adozione senza riscrivere il passato.** Il nuovo prodotto si collega alla serie, le osservazioni già registrate restano intatte.
3. **Nessuna tolleranza artificiale.** `equal` solo a prezzo identico alla precisione memorizzata: 0,900 → 0,905 è un aumento.
4. **Storico non scrivibile dal client.** Lettura via RLS, scrittura solo tramite funzione autorizzata, nessuna cancellazione.
5. **Backfill senza cronologia inventata.** Al massimo la prima osservazione conosciuta per serie e fonte, contrassegnata come dato iniziale.
6. **Identità della serie robusta** anche senza fornitore registrato o senza articolo di catalogo.

## 1. Nuove tabelle

### `supplier_price_observations` (append-only)
- Serie: `company_id` (chi monitora), `supplier_company_id` (nullable), `supplier_record_id` (nullable, anagrafica fornitore interna), `supplier_product_id` (nullable, articolo del catalogo del fornitore), `supplier_reference` (codice referenza, obbligatorio quando manca `supplier_product_id`).
- `series_key` testo **generato** dalla funzione di scrittura (non `GENERATED ALWAYS`, così non entra mai negli INSERT dal codice): concatenazione normalizzata di `company_id`, identità fornitore (`supplier_company_id` oppure `rec:<supplier_record_id>`), identità referenza (`prod:<supplier_product_id>` oppure `ref:<referenza normalizzata>`). Mai la descrizione del prodotto come identità. Lo stesso codice referenza presso due fornitori genera due serie distinte.
- Prezzo: `kind` enum `price_observation_kind` = `observed_price` | `actual_purchase_cost`; `net_price`, `gross_price` (almeno uno valorizzato), `currency` default `EUR`, `price_basis` enum = `netto` | `lordo`.
- U.M.: `price_unit_code`, `conversion_factor`, `conversion_reference_um` — congelati nell'osservazione, nulli se nessuna conversione esplicita.
- Provenienza: `source` enum = `danea_supplier_cost` | `danea_price_list` | `b2b_price_list` | `manual_cost` | `supplier_confirmation` | `goods_receipt` | `backfill_initial`; `price_list_number`, `price_list_id`, `source_event_key`, `source_ref_table`, `source_ref_id`.
- Tempi: `observed_at`, `last_seen_at`, `created_at`, `updated_at`.
- `notes`.

### `supplier_price_series` (stato corrente, una riga per serie + `kind`)
`series_key`, le colonne di identità, `kind`, `product_id` nullable, `product_supplier_link_id` nullable (**qui** si registra l'adozione), `current_observation_id`, `previous_observation_id`, valori correnti e precedenti (prezzo, U.M., basis, valuta, fonte, listino), `comparable`, `delta_amount`, `delta_percent`, `direction` (`up`|`down`|`equal`|`not_comparable`), `last_seen_at`, timestamp. Aggiornata dalla stessa funzione che inserisce l'osservazione, così le liste non fanno calcoli pesanti.

## 2. Chiavi e indici
- Unico su `supplier_price_observations(company_id, source, source_event_key)` quando `source_event_key` non è nullo → idempotenza.
- Indice `(series_key, kind, observed_at DESC)`.
- Unico su `supplier_price_series(series_key, kind)`.
- Indice `supplier_price_series(company_id, product_id, kind)` per l'Inventario e indice su `(company_id, supplier_company_id, supplier_product_id)` per il Catalogo.

## 3. RLS e permessi
- `supplier_price_observations`: `GRANT SELECT ON ... TO authenticated`, `GRANT ALL ... TO service_role`. Nessun INSERT/UPDATE/DELETE al client. RLS abilitata, lettura solo se `is_company_member(company_id)`.
- `supplier_price_series`: `GRANT SELECT ON ... TO authenticated`, `GRANT ALL ... TO service_role`; stessa policy di lettura. L'aggancio del prodotto adottato passa da RPC, non da UPDATE diretto.
- Scrittura esclusiva tramite `record_price_observation(...)` e `link_price_series_to_product(...)`, entrambe `SECURITY DEFINER` con `search_path = public`, che verificano appartenenza e ruolo con le funzioni già usate nel progetto (`is_company_member`, `has_company_role`).
- Trigger `deny_history_write` sullo stile già presente nel progetto: `UPDATE` ammesso solo su `last_seen_at`, `DELETE` vietato.

## 4. Eventi che scrivono lo storico
Solo cambi reali del dato sorgente, tutti server-side:
1. **Import Danea — costo fornitore**: in `danea-import.server.ts`, dopo l'aggiornamento di `product_supplier_costs` (`danea_supplier_cost`, chiave evento con l'id della sincronizzazione).
2. **Import Danea — listini**: dopo la riscrittura di `product_prices`, una osservazione per ogni listino effettivamente applicabile a una relazione cliente reale (`danea_price_list`, con numero listino).
3. **Cambio del listino assegnato** (`set_customer_price_list`, `apply_invitation_price_list`): osservazione `b2b_price_list` solo se il prezzo applicabile all'azienda acquirente cambia davvero.
4. **Costo manuale** del collegamento fornitore, alla conferma in `manage_product_supplier_link` (`manual_cost`).
5. **Conferma carico merce** (`confirm_goods_receipt`): `kind = actual_purchase_cost`, `source = goods_receipt`, mai usato per la freccia principale.
6. **`supplier_confirmation`**: enum predisposto, nessun aggancio ora; il modulo del fornitore non viene toccato.

### 4bis. Propagazione agli articoli solo ⭐ (aggiunta della rev. 3)
Gli eventi 2 e 3 non bastavano: l'attuale `buyer_catalog_prices` calcola il prezzo al momento della lettura e solo per l'utente collegato. Aggiungo quindi:
- `applicable_b2b_price(_seller_company_id, _buyer_company_id, _product_id)`: stessa logica di `buyer_catalog_prices` (relazione attiva, listino assegnato, listino attivo nell'archivio del cliente) ma senza dipendere da `auth.uid()`, così è utilizzabile lato server.
- `propagate_seller_price_change(_seller_company_id, _product_ids uuid[], _event_key text)`: per ciascun articolo trova **tutte** le aziende acquirenti che lo monitorano — chi lo ha fra i preferiti (`buyer_product_favorites`) e chi lo ha già adottato — calcola il prezzo applicabile e registra l'osservazione sulla serie di quell'azienda. Chiamata dall'import Danea del venditore e dai cambi di listino (assegnazione cliente, listino predefinito, invito).
- `seed_price_series_for_favorite(...)`: alla **prima** ⭐, se esiste già un prezzo applicabile, viene registrato come "primo prezzo conosciuto" della serie (idempotente: nulla se la serie esiste già).

Risultato: A mette ⭐ su PATATE a €0,90 → prima osservazione; Trevi aggiorna a €0,85 → l'import del venditore crea l'osservazione sulla serie di A anche se A non apre nulla; quando A torna nel catalogo legge €0,90 → €0,85 ↓ −5,6%.

**Nessuna scrittura dalla lettura di pagine**: catalogo, inventario, fabbisogno e liste eseguono solo letture. Verifica esplicita nei test.

## 5. Deduplicazione
- Stesso `source_event_key` → nessun inserimento.
- Contenuto identico all'ultima osservazione della serie (prezzo, valuta, U.M., basis, fonte, listino) → nessuna nuova riga: solo `last_seen_at = now()` sull'osservazione corrente e sulla serie. Esempio: 20/09 €0,90 → 21/09 €0,90 aggiorna solo la data di ultima verifica; 23/09 €0,85 crea una nuova osservazione.
- Confronto del prezzo alla precisione memorizzata (numeric), senza tolleranze.

## 6. Preferito → prodotto adottato
- Il monitoraggio parte dalla ⭐ senza creare prodotti: serie su fornitore + articolo di catalogo.
- All'adozione, `link_price_series_to_product` valorizza `product_id` e `product_supplier_link_id` **sulla serie**; le osservazioni non vengono toccate.
- Togliere la ⭐ non cancella nulla.
- Un mio prodotto con più fornitori ha una serie per fornitore/referenza: nessuno storico unico indistinto.

## 7. Query/RPC di lettura
- `price_trend_for_products(_product_ids uuid[])` → serie per prodotto e fornitore (Inventario/Fabbisogno).
- `price_trend_for_catalog(_seller_company_id uuid, _supplier_product_ids uuid[])` → Catalogo e preferiti.
- `price_observation_history(_series_key text, _limit int)` → ultime osservazioni, con il costo effettivo in sezione separata.
- Freccia solo fra osservazioni confrontabili (stessa U.M., stessa natura netto/lordo, stessa valuta); altrimenti "Confronto non disponibile: unità o natura del prezzo differenti".

## 8. Componenti UI
- `src/components/pricing/price-trend-icon.tsx` — icona € accesa/spenta con freccia.
- `src/components/pricing/price-trend-popover.tsx` — attuale, precedente, Δ €, Δ %, fonte, ultimo aggiornamento, ultime osservazioni, costo effettivo separato.
- `src/lib/pricing.ts` — tipi, formattazioni, regole di confrontabilità.
- Usato in `catalog-list.tsx` e dettaglio articolo del catalogo, nella scheda prodotto dell'Inventario e nella riga/tabella Fabbisogno. Lista della Spesa più avanti.
- Colori solo dai token esistenti.

## 9. Desktop / smartphone
Desktop e tablet: riepilogo breve al passaggio del mouse, clic per il riquadro completo. Smartphone: tap apre lo stesso contenuto in un foglio a scomparsa, con area di tocco adeguata.

## 10. Backfill
Una sola osservazione iniziale per serie e fonte, `source = backfill_initial` con la fonte originaria conservata nelle note e `source_event_key = 'backfill:<tabella>:<id>'`, `observed_at` alla data disponibile (`received_at`, `manual_cost_at`, altrimenti creazione). Fonti: `product_supplier_costs`, `product_supplier_links.manual_cost`, carichi merce confermati (come costo effettivo) e — solo per relazioni fornitore↔cliente realmente esistenti con listino assegnato attivo — il prezzo B2B applicabile. Nessuna combinazione artificiale prodotto × azienda × listino, nessuna freccia: con una sola osservazione il riquadro dice "primo prezzo conosciuto".

## 11. Test
- Serie separate per fornitori diversi sullo stesso prodotto; stessa referenza testuale presso due fornitori = due serie.
- Serie corretta con fornitore non registrato (solo anagrafica interna) e con sola referenza testuale.
- Prima osservazione → nessuna freccia; valore più basso → verde; più alto → rosso; identico → uguale ocra; 0,900 → 0,905 → aumento.
- Stesso prezzo ricevuto due volte → nessuna nuova osservazione, `last_seen_at` aggiornato.
- Stesso evento di import ripetuto → nessun duplicato.
- U.M. o netto/lordo differenti → nessuna freccia, messaggio di non confrontabilità.
- ⭐ non adottato → storico nel Catalogo, prodotto assente dall'Inventario; adozione successiva → stessa serie visibile in Inventario, osservazioni precedenti invariate (verifica che nessuna riga storica sia stata modificata).
- `actual_purchase_cost` da carico confermato non altera la freccia principale.
- **Nessuna scrittura da sola visualizzazione**: apertura di Catalogo, Inventario e Fabbisogno con conteggio righe invariato prima/dopo.
- RLS: un'altra azienda non legge le osservazioni; INSERT/UPDATE/DELETE diretti dal client respinti.
- Verifica finale in app su Catalogo e Inventario, desktop e smartphone.

## Fuori scope
Grafico dell'andamento, modifica dei prezzi dal riquadro, campo prezzo nel modulo del fornitore, valorizzazione di magazzino, modifiche a formule, Lista della Spesa, ordini e logiche commerciali.
