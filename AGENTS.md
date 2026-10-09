<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- manage_unit_of_measure / apply_product_sale_unit_batch: EXECUTE solo service_role, chiamate da sales-units.functions.ts dopo is_company_admin: niente company_id arbitrario dal client.
- Consegne fornitore: RPC interne con context.supabase; link esterno solo external_* (service_role), il token decide l'ordine: niente accessi cross-azienda/ordine.
- Acquisti (shopping-list/purchase.functions.ts): RPC sempre con context.supabase, mai client privilegiato: il DB autorizza con auth.uid().
- Giacenza: espressa solo nella U.M. di magazzino del prodotto (products.stock_unit_id, inizializzata da danea_um e mai scritta da Danea); documenti e movimenti fotografano U.M., fattore e modo di conversione: nessun ricalcolo dalla configurazione.
- Semaforo Inventario→Lista→Ordini: solo inventory_purchase_cycle_status / manage_inventory_purchase_evaluation; un solo ciclo aperto.
- Acquisti: dato d'ordine = quantità + U.M. d'acquisto + fornitore; *_quantity in U.M. magazzino solo equivalente (NULL senza conversione, mai 0): non confondere cassette e kg.
- U.M. prezzo: config FK (links.price_unit_id non B2B; B2B dal prodotto venditore), documenti fotografano id+codice (+price_quantity sul carico); stock_lots.unit_cost NULL senza base: prezzo mai senza U.M.
- Regole Lista della Spesa: vedi src/components/shopping/AGENTS.md.

- Operational pages show only current work; when the purchase cycle is not red, past counts and closed lists are reachable only via history views (no data deleted).
- Customer order edits after sending go only through DB RPCs that lock the order row and re-check the supplier lock (customer_update_order_full, request/decide_order_change, supplier_cancel_order); every change is logged in purchase_order_changes: concurrency is decided by the database, not the UI.
- Conversione U.M. acquisto fornitore → U.M. di magazzino: solo `product_supplier_link_units.stock_conversion_factor` + verified_stock_unit_id/verified_package_version, letta solo da `effective_supplier_conversion`; il vecchio `conversion_factor` resta del sistema attuale: nessuna conversione superata viene usata in silenzio.
- U.M. di magazzino, confezioni e conversioni si scrivono solo con set_product_stock_unit / manage_product_stock_package / set_supplier_unit_conversion (flag app.unit_config_rpc nei trigger): il browser non le scrive direttamente.
- Inventario: U.M. sono solo etichette; chi conta sceglie tra product_inventory_units (scritte solo da manage_product_inventory_unit / set_product_stock_unit), stock_unit_id = principale; conteggi con fattore 1, nessuna conversione; giacenza NULL senza conteggio valido; prodotti senza U.M. hanno la card bloccata ma non bloccano la chiusura; allows_decimals non usato.

- Inventory card edits use a per-row UI unlock state: successful saves relock, failed saves remain editable, and all quantity/unit commands share a guard; existing cycle authorization and server validation remain authoritative.
- Recurring company operational schedules (e.g. shopping-list reminder) live only in company_operational_schedules, one row per company+schedule_type, written only via manage_company_operational_schedule (admin check in DB): kept separate from company_settings delivery preferences.
- Copia/collegamento B2B: prodotto interno e collegamento si creano solo con copy_b2b_item_to_own_product (copia esplicita) o add_catalog_product_to_own_products (aggiunta da catalogo); l'origine sta solo in products.created_from_product_id/created_from_company_id, mai nelle note.
- Identità B2B di un collegamento = product_supplier_links.b2b_item_id (+ supplier_company_id), garantita da guard_supplier_link_b2b_item e dall'indice unico sugli attivi; il solo codice articolo non stabilisce l'identità; collegamenti senza codice né articolo, o importati da Danea senza articolo, sono "identità incerta" e non vengono mai compilati, riattivati o duplicati automaticamente.
- Funzioni DB che scrivono: un RETURN senza modifiche è ammesso solo prima della prima scrittura; dopo, ci si ferma solo con RAISE EXCEPTION: nessuno stato a metà.
- Codici interni 00-xxx: generazione sotto pg_advisory_xact_lock per azienda ('internal_product_code:'||company_id) in tutte le funzioni che creano prodotti interni; il vincolo products_archive_code_unique resta la protezione definitiva.
- Preferito B2B (buyer_product_favorites, id articolo venditore) e collegamento al prodotto interno sono indipendenti: la stella si salva sempre, il collegamento mancante è segnalato "Collegamento da completare".
- PUNTO APERTO Fase 5: "Nuova lista → Solo preferiti" legge solo company_product_favorites. Comportamento voluto: un articolo B2B preferito e collegato rende preferito anche il prodotto interno collegato (una sola card, nessun duplicato); un articolo B2B preferito non collegato non crea prodotti né card.
- Preferiti B2B non acquistabili si leggono solo con buyer_unpublished_favorites (membro dell'azienda cliente; precedenza rapporto_cessato > rapporto_non_attivo > non_pubblicato > fornitore_in_pausa; cessato/non attivo solo come riepilogo per fornitore, senza articoli).
- Rimozione di tutti i preferiti di un fornitore solo con remove_seller_favorites: amministratore, rapporto né operativo né in pausa, numero confermato (count_changed se diverso), blocco consultivo della coppia + FOR SHARE sul rapporto + FOR UPDATE sulle stelle, audit. Rischio residuo noto: un rapporto inesistente creato durante la rimozione non viene bloccato (soluzione completa rinviata: stesso blocco nelle 7 funzioni dei rapporti e revisione delle 3 policy di scrittura); le operazioni manuali dalla console di amministrazione sono fuori da queste garanzie.
