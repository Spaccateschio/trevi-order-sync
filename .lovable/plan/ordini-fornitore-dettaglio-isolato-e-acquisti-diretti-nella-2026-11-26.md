# Ordini fornitore: dettaglio isolato e acquisti diretti nella lista unica

## Verifiche (stato attuale)
- **Stato del dettaglio ordine**: `selected` (useState) dentro `PurchaseOrdersPanel` (purchase-orders-panel.tsx r.43). La route non lo conosce, quindi banner e `DirectPurchasesSection` restano visibili sotto.
- **Riquadro «Genera»**: è dentro `PurchaseOrdersPanel` e già sparisce aprendo un ordine (il pannello rende solo il dettaglio).
- **Acquisti diretti**: `DirectPurchasesSection` legge `direct_purchases` → `id, number` (AD), `status` (bozza/confermato/annullato), `purchase_date` (o `created_at`), `buyer_label` (chi acquista), `shopping_list_id`, e `direct_purchase_items(id)` solo per contare i prodotti. Il dettaglio si apre in `DirectPurchaseDraftDialog`; per le bozze legate a una Lista legge prima le quote con `getGenerationPreview`.
- **Legame con purchase_orders**: nessuno. `direct_purchases` / `direct_purchase_items` non hanno colonne verso `purchase_orders`; l'unico punto in comune è `shopping_list_id` (stessa Lista d'origine) e `company_id`.

## Cosa cambia
1. Lo stato «cosa è aperto» sale nel pannello come unico valore: ordine oppure acquisto diretto. Il pannello avvisa la route (`onDetailChange`) e la route nasconde il banner ordini inviati quando c'è un dettaglio aperto. Restano solo «Torna agli ordini» e il dettaglio.
2. Nuovo filtro **«Acquisti diretti (N)»** accanto a Tutti / Da inviare / In attesa / Ricevuti. In **Tutti** compaiono anche le card AD, stesso stile delle card ordine: numero AD, badge Bozza/Confermato/Annullato, data, chi acquista, numero prodotti, pulsante principale **Apri**. Ordinamento in Tutti: prima gli ordini in attesa merce, poi tutto per data.
3. Tolta la sezione «Acquisti diretti» in fondo alla pagina (la route non la monta più). Il file resta, riusato per lettura e apertura.
4. Aprendo un AD: la lista sparisce, resta «Torna agli ordini» e si apre il suo dettaglio con lo stesso `DirectPurchaseDraftDialog` di oggi (stesse azioni, stessa lettura delle quote). Chiudendolo si torna alla lista.

Nessuna modifica a database, RPC, Danea, carico merce, Lista della Spesa, Carrello. AD e ordini restano documenti separati: solo affiancati in presentazione.

## Dettagli tecnici
- `direct-purchases-section.tsx`: estrarre hook `useDirectPurchases(companyId)` (stessa query/queryKey) e componenti `DirectPurchaseCard` + `DirectPurchaseOpener` (quote + dialog); `DirectPurchasesSection` resta esportato ma non più usato dalla route.
- `order-list-presentation.ts`: filtro `acquisti_diretti`; helper puro per unire in Tutti righe tipizzate `{kind:'order'|'direct'}` con ordinamento; test aggiornati.
- `purchase-orders-panel.tsx`: stato `open: {kind:'order',id} | {kind:'direct',id,listId,status} | null`, callback `onDetailChange`.
- `acquisti.ordini.tsx`: rimuove `DirectPurchasesSection`, nasconde `SentOrdersBanner` con dettaglio aperto.
- Assunzione: il dettaglio AD resta la finestra attuale (non una pagina nuova), con la lista nascosta dietro.
