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

- Le RPC manage_unit_of_measure e apply_product_sale_unit_batch sono solo server (EXECUTE solo service_role), chiamate da sales-units.functions.ts dopo il controllo is_company_admin: impedisce chiamate dirette dal client con company_id arbitrario.
- Consegne fornitore: le 4 RPC interne (open/set/add_extra/submit delivery) si chiamano con context.supabase (auth.uid()), senza bypass; il link esterno usa solo external_open_delivery/external_set_delivery_item/external_submit_delivery (EXECUTE solo service_role) dove il token decide l'ordine: impedisce accessi cross-azienda e cross-ordine.
- Flusso Acquisti (shopping-list.functions.ts, purchase.functions.ts): le RPC di utenti collegati si chiamano sempre con context.supabase, mai con il client privilegiato: le funzioni DB autorizzano con auth.uid() e senza sessione rispondono "Accesso non consentito".
- Giacenza (inventory_location_stock): usa solo l'ultimo conteggio nella stessa U.M. del prodotto (danea_um); conteggi in U.M. diversa restano nello storico ma non diventano giacenza, perché non si fanno conversioni.
- Ciclo Inventario→Lista→Ordini: colore semaforo e presa in carico decisi solo da inventory_purchase_cycle_status / manage_inventory_purchase_evaluation (colonne purchase_* su inventory_sessions); con rosso start_general_inventory rifiuta nuove sessioni: un solo ciclo aperto alla volta.

- Acquisti: il dato d'ordine è quantità + U.M. d'acquisto + fornitore; assigned_quantity/ordered_quantity/declared_quantity sono solo equivalente in U.M. di magazzino (NULL senza conversione, mai 0); le colonne *_purchase_* non si usano mai per kg: evita di confondere cassette e kg.
- U.M. del prezzo: configurazione = FK (product_supplier_links.price_unit_id, solo non B2B; B2B dal products.price_unit_id del venditore), documenti = fotografia price_unit_id+price_unit_code (ordine, carico) e price_quantity sul carico; stock_lots.unit_cost = price_quantity × unit_cost / quantità caricata, altrimenti NULL; costo Danea senza U.M.: il prezzo non è mai interpretabile senza la sua base.
- Lista della Spesa, U.M. ripartizione: B2B solo U.M. pubblicate dal venditore (product_sale_units del prodotto created_from_product_id), non B2B U.M. referenza o testo manuale (purchase_unit_id NULL, nessuna conversione); controllo in assign_shopping_list_supplier: il browser non può aggirarlo.
- Lista della Spesa: «+ Aggiungi fornitore» nella card crea il collegamento prodotto↔fornitore con manage_product_supplier_link (stesse RPC della scheda Prodotto); nessun abbinamento automatico alla referenza B2B: un solo dato per Prodotto e Fornitore.
- «Togli fornitore» nella Lista usa solo unlink_product_supplier (ripartizione corrente + scollegamento + preferito in un'unica transazione): niente stati a metà, storico intatto.

- Chiusura Lista della Spesa: solo close_shopping_list (atomica, idempotente, stato finale chiusa, numero LS assegnato alla chiusura) e shopping_list_close_preview, entrambe basate su _shopping_list_close_plan; send_status degli ordini separato dallo stato Lista: anteprima e chiusura non possono divergere e la Lista chiusa è fotografia immutabile.
