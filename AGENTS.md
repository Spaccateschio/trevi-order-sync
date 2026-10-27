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
- Shared quantity editor and non-B2B sharing rules: src/components/shopping/AGENTS.md.
- Missing-quantity bulk completion selects visibly empty fields through the shared pure predicate and reuses existing exclusion/evaluation commands; generation waits for refreshed rows so pending numeric drafts are never silently excluded or confirmed.

- Operational pages show only current work; when the purchase cycle is not red, past counts and closed lists are reachable only via history views (no data deleted).
- Sent order edits use customer_update_order_full, request/decide_order_change or supplier_cancel_order: DB order/supplier locks decide concurrency; every change logs purchase_order_changes.
- Conversione U.M. acquisto fornitore → U.M. di magazzino: solo `product_supplier_link_units.stock_conversion_factor` + verified_stock_unit_id/verified_package_version, letta solo da `effective_supplier_conversion`; il vecchio `conversion_factor` resta del sistema attuale: nessuna conversione superata viene usata in silenzio.
- U.M. di magazzino, confezioni e conversioni si scrivono solo con set_product_stock_unit / manage_product_stock_package / set_supplier_unit_conversion (flag app.unit_config_rpc nei trigger): il browser non le scrive direttamente.

- Recurring schedules: company_operational_schedules, unique company+schedule_type; writes via manage_company_operational_schedule (DB admin check), separate from delivery preferences.
- Funzioni DB che scrivono: un RETURN senza modifiche è ammesso solo prima della prima scrittura; dopo, ci si ferma solo con RAISE EXCEPTION: nessuno stato a metà.
- Codici interni 00-xxx: generazione sotto pg_advisory_xact_lock per azienda ('internal_product_code:'||company_id) in tutte le funzioni che creano prodotti interni; il vincolo products_archive_code_unique resta la protezione definitiva.

- Regole B2B Catalogo/preferiti/collegamenti: vedi src/components/catalog/AGENTS.md.
- Per prodotti a peso variabile il totale economico non nasce dall'ordine. Il valore reale viene determinato al carico sulla quantità/peso effettivamente ricevuto.
- Prezzo riga d'ordine B2B: solo applicable_b2b_price (netto, listino assegnato, articolo pubblicato) sull'articolo del collegamento usato, letto prima di ogni scrittura in close_shopping_list / create_purchase_orders_from_list; nessun fallback: senza prezzo «Prezzo su richiesta».
- Regole U.M. di vendita: vedi src/components/products/AGENTS.md.
- Regole Inventario (zone abituali, aggiunte al conteggio, inventario completo): vedi src/components/inventory/AGENTS.md.
- Inventory reset/cache and scroll thresholds use pure helpers; DB guards remain authoritative.
- Never alter real operational data in tests, even temporarily. Writes require rollback or explicitly authorized test data.
- 3 EMME ROMA SRL è l'azienda di prova: Andrea può fare collaudi manuali dall'app in anteprima. Mai prove su trevi srl o su altre aziende reali. Nessun invio reale ai fornitori durante i collaudi.

- Read nested AGENTS.md before edits, including src/lib/AGENTS.md for server logic. Shopping banner untilPickup polls receipt-open orders and syncs panel cache; other pages stay recent/dismissible.
- Product row navigation is local presentation state owned by ProductsWorkspace, with pure adjacent-row calculations and keyboard focus handled by ProductGrid; it never persists preferences or changes product data. See src/components/products/AGENTS.md.
- Customer/supplier detail panels: on ≥1280 px the record form renders in a sticky right aside (same detailForm JSX as the mobile Dialog); row click and ↑/↓ switch records within the filtered list, unsaved edits ask before discarding (including New, with supplier delivery changes), and switching never writes data. New clears the panel selection before resetting the shared form so an existing-record aside can never expose a create action.

- Ordini: mai totali in euro; prezzo indicativo fino allo scarico Danea (listino del cliente in quel momento).
- Area piattaforma (/piattaforma): team interno in platform_team_members con permessi per sezione; super admin gestisce il team via manage_platform_team_member; letture cross-azienda solo in sola lettura via supabaseAdmin dopo is_platform_admin; ogni azione va in platform_audit_log; mai modificare dati delle aziende clienti.
- Tests require real roles/paths (app authenticated; Danea public endpoint/station), never privileged SQL. Real Danea calls require explicit authorization.
- Ordini già scaricati da Danea intoccabili: niente ricalcolo prezzi, storico retroattivo o cambio stato; il riscarico senza storico usa la logica precedente (test con danea-orders-xml.legacy.ts).
- Clarify closed-list undo errors via RLS reads after RPC rejection; SQL guards remain unchanged.
- Mockups: isolated React state only. Platform bell uses caller-owned items/actions; read state never changes request status.
- Product purchase units are persisted separately in product_purchase_units through saveProductPurchaseUnits using context.supabase and the authenticated-only three-argument save_product_purchase_units: DB identity comes exclusively from auth.uid() with a company-admin check; no actor/company parameter or privileged client. The legacy four-argument signature has no application-role EXECUTE grants. This keeps authorization bound to the caller's session. Direct purchase reads these units, stars remain in product_direct_purchase_preferences, new manual links only propose units, existing manual/B2B links and document snapshots never change implicitly.
- Destination stars: new UI toggles stars only via toggle_product_destination_star (adds/removes without clearing others); set_preferred_product_supplier and the sole-preferred trigger stay untouched for the published app. With 2+ stars (suppliers and/or direct) chooseListDestinations proposes them as «da_ripartire» with no automatic quota, unless the last-list memory uses only still-starred destinations; one star behaves as before.
- Delivery summaries and late causes share pure delivery-schedule helpers; starred direct-purchase proposals render checked without starting quota editing or saving, keeping presentation separate from explicit purchase quantities.
- External non-B2B delivery URLs are built and normalized only through order-share-url, preserving token and expiry while using the canonical public origin; editor origins require sign-in and must never enter supplier messages.
- Delivery-day supplier choice applies only to shopping rows without destinations and no explicit choice; existing quotas only get a warning or an explicit one-tap switch, never a block; a link with no days set counts as delivering every day (lead time only), so manual choices are never overwritten and uncompiled suppliers stay usable.
