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
