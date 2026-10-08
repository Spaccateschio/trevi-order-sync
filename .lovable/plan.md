# Valutazione persistente Inventario → Lista della Spesa

## Punto da decidere prima (richiesto dal documento)
Il campo `origin` delle righe Lista accetta oggi solo `manuale` e `fabbisogno` (enum `shopping_list_item_origin`). Per usare `inventario` serve aggiungere il valore all'enum (modifica additiva, nessun dato esistente toccato). Approvando il piano autorizzi anche questa aggiunta.

## Cosa costruisco
1. **Tabella `inventory_purchase_evaluation_items`**: id, company_id, session_id, product_id, decided_quantity (numeric NULL), status (text con CHECK `da_valutare` / `da_acquistare` / `non_acquistare`), updated_by, created_at, updated_at. UNIQUE (company_id, session_id, product_id). CHECK coerenza: `da_acquistare` → quantità > 0; `non_acquistare` → quantità NULL o 0.
2. **Sicurezza**: RLS attiva; lettura ai membri dell'azienda (`is_company_member`); nessuna scrittura diretta dal browser. GRANT SELECT ad authenticated, ALL a service_role.
3. **Funzione `set_inventory_purchase_evaluation(_session_id, _product_id, _status, _quantity)`** (SECURITY DEFINER, search_path=public): ricava company_id dalla sessione, verifica membro dell'azienda, che il prodotto sia contato in `inventory_counts` di quella sessione e che la valutazione non sia terminata; upsert della riga. Le righe `da_valutare` non ancora toccate sono implicite (prodotto contato senza riga = da valutare), quindi non serve crearle in anticipo.
4. **Enum**: `ALTER TYPE shopping_list_item_origin ADD VALUE 'inventario'`; aggiornata la validazione in `shopping-list.functions.ts` per accettarlo.
5. **`InventoryEvaluation`** (`inventory-to-evaluate.tsx`) e l'uso in `shopping-list-panel.tsx`:
   - digitando una quantità e uscendo dal campo → salva `da_acquistare` + quantità; campo svuotato → `da_valutare`;
   - comando «Non acquistare» per riga → `non_acquistare`, quantità NULL; il prodotto resta visibile come valutato, con «Ripristina» per tornare a da valutare o digitare una quantità;
   - «Aggiungi alla Lista (n)» conta le righe salvate `da_acquistare` con quantità > 0, esclusi i prodotti già nella Lista;
   - al clic crea le righe in `shopping_list_items` con la quantità salvata e `origin = 'inventario'` tramite la funzione esistente `add_shopping_list_items`; la riga di valutazione non viene cancellata. «Già trasferito» si ricava dalla presenza del prodotto nella Lista (nessun nuovo stato).
   - contatori: «21 contati · 12 da valutare · 6 da acquistare · 3 non acquistare».

## Non tocco
inventory_counts, conteggi, giacenza, ordini, carico merce, U.M., conversioni, Fabbisogno, chiusura ciclo.

## File
- migrazione nuova (tabella, enum, funzione)
- `src/lib/shopping-list.functions.ts` (solo enum origin accettato)
- nuovo `src/lib/inventory-evaluation.functions.ts` (chiamata RPC con utente autenticato)
- `src/components/shopping/inventory-to-evaluate.tsx`
- `src/components/shopping/shopping-list-panel.tsx` (rimozione stato locale delle quantità)
- test per regole status/quantità
