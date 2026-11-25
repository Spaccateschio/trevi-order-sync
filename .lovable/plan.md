# Scheda «Catalogo fornitori collegati» in Acquisti → Prodotti

## 1. Da dove arrivano i dati

Nota: nel database non esiste una tabella `b2b_items`. L'«articolo B2B» è una riga di `products` che appartiene all'azienda del fornitore; `product_supplier_links.b2b_item_id` punta a quella riga.

**Prodotti (dati tuoi, azienda attiva)**
- `products`: code, description, category, subcategory, danea_um, stock_unit_id, publish_status, b2b_visible, supplier_code/supplier_name (dati da Danea), ecc. Filtro `company_id = tua azienda`.
- `product_prices`: listini di vendita tuoi (list_number, net_price, gross_price).
- `product_supplier_links` (tuo): product_id → tuo prodotto, supplier_record_id → `supplier_records`, supplier_product_code, is_preferred, sourcing_priority, manual_cost, is_active; per i B2B anche supplier_company_id e b2b_item_id.
- `supplier_records` (tua anagrafica fornitore): legal_name.
- `product_supplier_costs`: ultimo costo da Danea.
- Colonna «prezzo fornitore»: `supplier_customer_relations` (supplier_record_id → seller_company_id) + `products` del fornitore + `buyer_catalog_prices` (listino che il fornitore ti ha assegnato).

**Catalogo (dati del fornitore)**
- Fornitori visibili: `supplier_customer_relations` con rapporto operativo (buyer_company_id = tu).
- Articoli: `products` del fornitore con publish_status = pubblicato e b2b_visible = true (fetchSellerCatalogue), filtrati dal DB per archivio (buyer_visible_archive).
- Prezzi: `buyer_catalog_prices` (listino del fornitore assegnato a te). Immagini: `product_images` del fornitore.
- Stelle: `buyer_product_favorites` (dato tuo, id articolo del fornitore). Preferenze U.M.: `customer_product_unit_preferences` (tue).

## 2. Come nasce il collegamento oggi
- Dal Catalogo: «Aggiungi ai miei prodotti» (`add_catalog_product_to_own_products`) oppure copia esplicita (`copy_b2b_item_to_own_product`): creano il tuo prodotto e il collegamento con b2b_item_id.
- Dalla scheda prodotto: gestione fornitori, scegliendo l'articolo dal catalogo.
- Se manca: il prodotto resta tuo ma il fornitore B2B non è legato a quell'articolo; nessun collegamento automatico; la stella resta, con «Collegamento da completare».
- PRUGNE IT su 3 EMME (00-048): ha già 1 collegamento attivo con articolo B2B. Su trevi srl (0060) il collegamento non è B2B.

## 3. Dove va la scheda
- Accanto ai pulsanti «Acquisti / Vendite» in alto, solo nella vista Acquisti: terzo pulsante «Catalogo fornitori collegati».
- Aprendolo, sotto compare la stessa schermata del Catalogo (vetrine/prodotti, ricerca, fornitore, categoria, preferiti, con prezzo), riusando il componente esistente.
- I filtri e le colonne della tabella Prodotti restano salvati come sono e non si applicano al Catalogo; il Catalogo ha i suoi filtri, che si azzerano chiudendo la scheda (stato solo locale).
- Menu laterale invariato: «Prodotti» resta evidenziato.

## 4. Cosa non tocco
Database, funzioni, regole di accesso, collegamenti, preferiti, prezzi, ordini, Lista della Spesa, pagina Vendite → Prodotti. Nessuna scrittura nuova: i pulsanti del Catalogo (stella, aggiungi ai miei prodotti) restano quelli di oggi.

## 5. Rischi e menu
- La schermata Catalogo oggi è scritta dentro la pagina: per riusarla va spostata in un componente condiviso, senza cambiarne il comportamento (rischio di piccole differenze: lo verifico con le due pagine affiancate).
- Lettura pesante: carica tutti i cataloghi dei fornitori; la carico solo quando apri la scheda.
- Incoerenza esistente da segnalare (non la correggo ora): la colonna prezzo fornitore in Prodotti abbina l'articolo per codice, non per b2b_item_id.
- Voce «Catalogo fornitori» nel menu: consiglio di tenerla per ora (link e dettaglio articolo /acquisti/catalogo/... la usano); la togliamo dopo il collaudo.

## Dettagli tecnici
- Nuovo `src/components/catalog/supplier-catalog-view.tsx` con il corpo di `acquisti.catalogo.index.tsx` (senza AppShell); la route lo usa così com'è.
- `products-workspace.tsx`: terzo pulsante e stato locale `showCatalog` solo con view="acquisti"; con scheda aperta nasconde griglia e filtri Prodotti e rende la vista Catalogo.
- Verifica: build, Playwright in sola lettura su 3 EMME.
