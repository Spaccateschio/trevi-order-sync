# U.M. semplificate: ordinabili in vendita, più U.M. d'acquisto per referenza

## Verifica di quanto già implementato

| Cosa esiste oggi | Esito |
| --- | --- |
| `units_of_measure.usage` (acquisto/vendita/entrambi) | **Si mantiene**: serve proprio a proporre le U.M. giuste nei due lati |
| `products.price_unit_id` (U.M. del prezzo, normalmente KG da Danea) | **Si mantiene**: è il cardine del modello ("€2,00/kg") |
| `product_sale_units` = U.M. ordinabili dal cliente, con + | **Si mantiene**: già oggi `conversion_factor` è **facoltativo** (nullable) |
| `product_sale_units.conversion_type` (esatta/indicativa) | **Diventa opzionale** e usato solo se la conversione è compilata |
| `product_supplier_links.purchase_unit_id` (una sola U.M. per referenza) | **Unico vero limite da superare** |
| Giacenza/inventario sull'U.M. base del prodotto | **Invariato**: nessuna somma fra U.M. diverse |
| `shopping_list_item_suppliers.purchase_unit_id/_code/conversion_factor` | **Invariato**: l'assegnazione continua a registrare la singola U.M. scelta |
| `purchase_order_items.purchase_unit_id/_code/conversion_factor` | **Invariato** |

Nessuna conversione è oggi obbligatoria a livello di database: l'obbligo percepito è solo nell'interfaccia (campo sempre in evidenza, tipo conversione sempre chiesto). Quindi la vendita si risolve con un intervento di sola interfaccia.

## Interventi

### 1. Vendita — nessuna conversione richiesta (solo interfaccia)
- Scheda prodotto: "U.M. del prezzo" resta in cima (precompilata dall'U.M. Danea quando presente), poi l'elenco delle **U.M. ordinabili** aggiungibili con `+`.
- La conversione diventa un riquadro richiudibile "Conversione (opzionale)": vuota per definizione, con nota "Compila solo se l'equivalenza è certa (es. 1 cartone = 6 bottiglie). I prodotti che si pesano non richiedono conversione".
- Il selettore esatta/indicativa appare **solo** se la conversione è compilata.
- Catalogo cliente: "POMODORI — €2,00/kg · Puoi ordinare: KG · CASSA · PEZZO" + nota "Peso e importo definitivo determinati in preparazione". L'etichetta "1 cassa ≈ 8 kg" compare solo se la conversione esiste. Nessun totale teorico calcolato da una conversione.

### 2. Acquisto — più U.M. per la stessa referenza fornitore (database)
Nuova tabella `product_supplier_link_units`: una riga per ogni U.M. con cui si può acquistare quella referenza.

- Colonne: `link_id`, `unit_id`, `is_default`, `conversion_factor` (nullable), `conversion_type`, `is_active`, `company_id`, timestamp.
- Unicità `(link_id, unit_id)`; **al massimo una** predefinita per referenza, ma anche **zero**: la predefinita è facoltativa.
- `product_supplier_links.purchase_unit_id` **resta** per compatibilità con FASE C/D e significa "U.M. preferita, se configurata": **può essere NULL**. Un trigger la allinea alla riga `is_default` e la porta a NULL quando quella riga viene rimossa o disattivata, senza obbligare a scegliere subito un'altra U.M.
- Migrazione dati: per ogni referenza con `purchase_unit_id` valorizzata si crea la riga corrispondente come predefinita, con la conversione già presente. Nessun dato perso, nessuna conversione inventata, nessuna predefinita creata dove non c'era.

### 3. Interfaccia acquisto
- Scheda prodotto → Prezzi/Referenze fornitori: al posto del singolo selettore "U.M. d'acquisto", l'elenco a pulsanti delle U.M. acquistabili con `+` (filtrate su uso acquisto/entrambi), stella per l'eventuale predefinita (attivabile e disattivabile, "nessuna" è uno stato valido), conversione opzionale per singola U.M.
- Stessa modifica nella vista fornitore → prodotti.
- Lista della Spesa (ripartizione fra fornitori): per ogni referenza si scelgono **U.M. e quantità** fra le U.M. dichiarate dal fornitore; se esiste una predefinita viene proposta inizialmente e resta modificabile, se non esiste l'operatore scegle liberamente.
- **Nessuna falsa equivalenza**: fabbisogno/quantità decisa (62 KG) e decisione d'acquisto (5 SACCHI) restano due dati separati. Senza conversione esplicita non si calcola equivalente, copertura, percentuale, residuo convertito o eccedenza, e non si propone nessuna traduzione a confezioni; l'operatore conferma consapevolmente nell'U.M. scelta, senza che l'assenza di conversione blocchi la conferma. Con conversione esplicita (1 cartone = 6 bottiglie) equivalenza, copertura, confezioni ed eccedenza funzionano come oggi.

### 4. Inventario e formule
Invariati: una riga per prodotto, giacenza nell'U.M. base, fotografia immutabile, formula `max(0, needed+min−disponibile)` con multiplo. Nessuna somma automatica fra U.M. diverse.

## Dettagli tecnici

- Migrazione: `CREATE TABLE public.product_supplier_link_units` + GRANT (`authenticated`, `service_role`) + RLS `company_id = get_user_company_id()`-equivalente del progetto + policy allineate a `product_supplier_links`; indice unico `(link_id, unit_id)`; indice unico parziale `(link_id) WHERE is_default`; trigger `sync_supplier_link_default_unit` che aggiorna `purchase_unit_id`/`conversion_factor` della referenza; trigger `updated_at`.
- RPC `manage_product_supplier_link_unit(_company_id,_link_id,_unit_id,_action,_conversion_factor,_conversion_type,_actor_user_id)` con azioni `add | remove | set_default | set_conversion | activate | deactivate`; SECURITY DEFINER, `search_path = public`, solo amministratori; audit su `audit_events`.
- `product_supplier_overview` estesa con l'elenco delle U.M. acquistabili (aggregato jsonb), ordinamento attuale invariato.
- File toccati: `src/components/products/product-suppliers-manager.tsx`, `supplier-products-manager.tsx`, `sales-unit-manager.tsx`, `product-detail-sheet.tsx`, `src/components/shopping/supplier-split-dialog.tsx`, `src/lib/sales-units.functions.ts`, `src/lib/catalog.ts`, `src/lib/shopping-list.ts`, catalogo cliente (`acquisti.catalogo.*`).
- `is_preferred` non viene toccato in questa fase.

## Invariato (nessuna regressione)

FASE A (giacenza = ultimo conteggio + rettifiche append-only), FASE B (sessione generale unica, fotografia immutabile), FASE C (snapshot Lista della Spesa immutabili, split senza ridistribuzione, dedup), FASE D (ordini con una destinazione, movimento solo da ricevuta confermata, identità prodotto product_id+archive_id, nessun FIFO); Danea read-only e limitato a `origin = danea`; listini e `product_prices`; priorità di approvvigionamento e disponibilità commerciale; permessi, route, layout.

## Test (transazionali, con rollback)

1. Referenza fornitore con KG + CASSA + SACCO: tre U.M. acquistabili, una predefinita, `purchase_unit_id` allineata.
2. Rimozione dell'U.M. predefinita: richiesta nuova predefinita, referenza mai senza U.M.
3. Migrazione: ogni referenza esistente ottiene esattamente una U.M. acquistabile con la conversione di prima.
4. POMODORI con U.M. prezzo KG e ordinabili KG/CASSA/PEZZO **senza nessuna conversione**: salvataggio riuscito, catalogo mostra €2,00/kg e le tre U.M., nessun totale teorico.
5. Cartone con conversione esatta 1 = 6 bottiglie: etichetta "= 6" mostrata.
6. Lista della Spesa su referenza con tre U.M. e nessuna conversione: nessuna proposta automatica di confezioni, scelta libera di U.M. e quantità, ordine generato coerente.
7. Fornitore locale/non B2B: stesso comportamento.
8. Inventario: una riga per prodotto, U.M. base invariata, fotografia stabile.
9. Import Danea: nessuna modifica a U.M. acquistabili, U.M. prezzo, unità di vendita, prodotti interni.
10. Nessuna regressione su fabbisogno, ordini fornitore, ricevute, lotti.
