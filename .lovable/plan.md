# Lentezza conferma quantità nell'Inventario — diagnosi e piano

## Diagnosi (codice e database reali)

### 1. Cosa parte alla conferma di una card
Percorso: `confirmQuantity` (InventoryCard) → `onConfirm` → `confirmRow` → `countMutation.mutate` (`src/components/inventory/inventory-count-panel.tsx`).

In fila:
1. Solo se l'U.M. scelta è diversa da quella di magazzino: RPC `inventory_count_conversion` (attesa prima di tutto il resto, anche se la card ha già lo stesso fattore in cache nella query `inventory-count-factor`).
2. Server function `recordCountEntry` (`src/lib/inventory-count.functions.ts`) → RPC `record_inventory_count_entry` (una sola chiamata).
3. `onSuccess`: `lockSavedCard`, pulizia bozza locale, `clearDraftOnServer` (server function `manageCountDraft` `clear_one`, non attesa), poi **`await refresh()`**.
4. `refresh()` invalida e attende in parallelo `inventory-progress` (RPC `inventory_session_progress`) e tutte le query `inventory-rows` (due: `all-session` e `all-favorites`).
5. Ognuna delle due `getInventoryRows` fa sul server, in fila: lettura `inventory_sessions` → RPC `inventory_session_rows` → `getSupplierReferences` (`product_supplier_links`, poi `supplier_customer_relations`) → preferiti (`company_product_favorites` + `buyer_product_favorites` in parallelo).

### 2. Ricarica totale
Sì: dopo ogni conferma viene ricaricata **tutta la sessione due volte** (134 card nella sessione aperta, tutte le righe + solo preferiti), più l'avanzamento. Nessun aggiornamento della sola riga.

### 3. Trigger e funzioni sul salvataggio
- `record_inventory_count_entry` (SECURITY DEFINER) lavora solo sulla card: controlli di appartenenza, `_resolve_session_card`, conversione, `_inventory_card_stock`, 3 insert e 2 update mirati.
- Trigger: `validate_inventory_count` e `set_updated_at` su `inventory_counts`; `deny_history_write` su `inventory_count_entries` (solo blocco modifiche allo storico). Nessun ricalcolo di sessione, nessuna proposta di riordino, nessun audit pesante.

### 4. Input bloccato
Sì, ed è il punto principale: `CardLockContext.pending = countMutation.isPending || ...` vale per **tutte le card**. Poiché `onSuccess` attende `refresh()`, ogni card dell'inventario resta disabilitata (`canEditInventoryCard`) finché salvataggio e doppia ricarica non sono finiti. Non c'è aggiornamento ottimistico.

### 5. Tempi e viaggi di rete
EXPLAIN ANALYZE sui dati reali (sessione aperta, 134 card):
- bozze sessione 1,2 ms; `inventory_sessions` 0,04 ms; `inventory_counts` 0,04 ms; `inventory_session_products` 0,07 ms; `product_supplier_links` 5,5 ms; `company_product_favorites` 1,9 ms.
- Le RPC (`inventory_session_rows`, `record_inventory_count_entry`, `inventory_session_progress`) non sono eseguibili dal ruolo di sola lettura: tempo non misurabile direttamente.
- Nessun indice mancante: il database non è il collo di bottiglia.

Viaggi di rete in fila per una conferma tipica:
- Browser: conversione (solo U.M. diversa) → salvataggio → ricarica = **2–3 giri**, il terzo contiene a sua volta **4–5 giri interni** server→database per ciascuna delle due letture.
- Totale in fila percepito: **circa 6–8**, con tutte le card bloccate per tutta la durata.

## Piano di correzione (modifiche minime, nessuna modifica al database)

1. **Niente blocco globale**: `pending` del contesto delle card non dipende più dal salvataggio della singola card; resta bloccata solo la card in salvataggio (stato per chiave card). «Conferma tutto», «Svuota» e chiusura continuano a bloccare come oggi.
2. **Aggiornamento ottimistico della riga**: alla conferma la card nelle due cache `inventory-rows` riceve subito quantità contata e U.M., e si blocca subito (`lockSavedCard`); in caso di errore si ripristina la riga, la card resta modificabile con la bozza nel campo e compare il messaggio. Riuso di `patchRowQuantity`-stile da `src/lib/shopping-optimistic.ts` (helper puro generico di patch/ripristino per chiave).
3. **Una sola ricarica in sottofondo, non attesa**: `onSuccess` non attende più `refresh()`; si usa `createRefreshBatcher` da `src/lib/shopping-optimistic.ts` per invalidare `inventory-rows` e `inventory-progress` una sola volta quando non restano salvataggi in corso.
4. **Conversione senza attesa extra**: se il fattore è già nella cache `inventory-count-factor` della card, si usa quello; la RPC parte solo se manca.
5. Invariati: una sola `record_inventory_count_entry` per conferma, card esplicita (`_card_explicit`), richiesta della nota per differenze, coda bozze per card, regole di blocco/sblocco, «Conferma tutto».
6. Test puri per patch/ripristino della riga inventario e per il blocco per singola card; esecuzione dei test Inventario esistenti.

Risultato atteso: dopo «Conferma» la card si blocca subito e si può scrivere la successiva senza attesa; giri in fila prima di poter continuare: da circa 6–8 a 0 (il salvataggio prosegue in sottofondo).

## Dettagli tecnici
- File: `src/components/inventory/inventory-count-panel.tsx` (countMutation, confirmRow, CardLockContext), eventuale piccolo helper in `src/lib/inventory-optimistic.ts` con test, riuso di `createRefreshBatcher`; regola in `src/components/inventory/AGENTS.md`.
- Nessuna migrazione, indice o modifica a RPC/trigger.
