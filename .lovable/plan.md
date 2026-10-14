# Acquisto diretto come documento — Fase 1 (bozza)

Obiettivo: in «Genera ordini» la card «Acquisti diretti» crea una BOZZA di acquisto diretto numerata AD-AAAA-NNNNN con i prodotti e le quantità dirette della Lista. La bozza si modifica liberamente. Nessuna giacenza, nessun fornitore, nessun invio, nessuna notifica. La quota diretta della Lista NON diventa gestita alla creazione della bozza (lo diventerà alla conferma, Fase 2).

## 1. Nuove tabelle (migrazione A)

`direct_purchases` (testata)
- id, company_id (NOT NULL), shopping_list_id (NULL ammesso per usi futuri), number (NOT NULL, UNIQUE per company_id)
- status: nuovo tipo `direct_purchase_status` = bozza | confermato | annullato (in Fase 1 solo `bozza`)
- purchased_where text (negozio/mercato/supermercato), purchase_date date, total_paid numeric(12,2) >= 0, notes text
- generation_key uuid, UNIQUE (company_id, generation_key)
- created_by, created_at, updated_at, confirmed_at/by, cancelled_at/by (vuoti in Fase 1)
- nessun supplier_record_id, nessun campo invio/notifica, nessun campo foto

`direct_purchase_items` (righe)
- id, company_id, direct_purchase_id (FK, nessuna cascata)
- product_id, product_code, product_name (fotografati)
- source_item_id (FK shopping_list_items) — UNIQUE parziale sulle righe di bozze/confermati non annullati: una quota diretta compare in un solo documento vivo
- planned_quantity, planned_unit_id, planned_unit_code (fotografia della quota della Lista, immutabili)
- quantity, unit_id, unit_code (effettivi, modificabili in bozza; NULL ammesso finché non compilati, mai 0)
- unit_price, price_unit_id, price_unit_code (prezzo mai senza U.M.: controllo nella funzione), line_total, notes
- sort_order, created_at, updated_at

Per entrambe: GRANT SELECT a authenticated e ALL a service_role (nessuna scrittura diretta dal browser), RLS attiva, policy SELECT con `company_id = get_user_company_id()` / is_company_member. Trigger updated_at e trigger di blocco: righe e testata modificabili solo se lo stato è `bozza`, e solo con flag di sessione impostato dalle funzioni (come le U.M. di magazzino).

## 2. Numerazione (stessa migrazione)
Estendere `next_document_number` con il ramo `_prefix = 'AD'` sulla tabella `direct_purchases`: stesso advisory lock per azienda+prefisso, progressivo per anno, formato `AD-2026-00001`. Gli altri rami (LS, ORD, carichi) restano byte per byte identici. Il vincolo UNIQUE (company_id, number) resta la protezione definitiva. Un numero si consuma solo se la bozza viene davvero creata (la transazione annullata non lascia buchi persistenti, salvo errori successivi: accettato come per gli ordini).

## 3. Funzioni nuove (SECURITY DEFINER, search_path = public)
- `generate_direct_purchase_draft(_list_id, _generation_key, _item_ids uuid[] DEFAULT NULL)`
  - auth.uid() obbligatorio, appartenenza e ruolo amministratore/operatore verificati nel DB (stessi controlli di generate_supplier_order)
  - FOR UPDATE sulla Lista; Lista `aperta`
  - stessa chiave → restituisce la stessa bozza (`already_exists: true`), senza scrivere
  - righe candidate: quota diretta presente (manual_purchase_quantity NOT NULL), riga non esclusa, non già registrata (manual_purchase_done_at NULL), non già in un altro documento vivo
  - nessuna riga candidata → RAISE EXCEPTION (nessun RETURN dopo la prima scrittura)
  - fotografa prodotto, quantità e U.M. della quota; quantità effettiva precompilata = quota; prezzo vuoto
  - registra audit_events `direct_purchase.draft_created`
  - NON tocca shopping_list_items, NON chiama _shopping_list_try_complete
  - nessuna tabella temporanea; ogni DELETE con WHERE esplicita (protezione SQL dell'app)
- `update_direct_purchase_draft(_id, _header jsonb, _lines jsonb)`
  - solo in bozza, FOR UPDATE, stessa azienda, righe del documento stesso
  - header: luogo, data, totale, note (chiave assente = invariato, null = svuota)
  - righe: quantità (>0 o null), U.M. (anagrafica aziendale o codice libero), prezzo con U.M., note
  - non modifica la quota della Lista né le quantità pianificate
- `direct_purchase_detail(_id)` lettura (oppure SELECT diretto con RLS)

Riuso di `register_direct_purchase`: si estraggono i suoi controlli (appartenenza, FOR UPDATE, Lista aperta, riga non esclusa, quota presente) in un aiuto interno `_direct_quota_check(item)` usato dalle nuove funzioni; la funzione attuale resta invariata e utilizzabile (nessuna rottura per Fase 2). `shopping_list_direct_purchases` resta la traccia di gestione della Lista: in Fase 2 la conferma vi scriverà la riga (con riferimento al documento) e imposterà manual_purchase_done_at, come oggi.

## 4. Doppie bozze e doppia contabilizzazione
- Chiave di generazione per la card «Acquisti diretti» nel frontend (stesso meccanismo `keys` dei fornitori): clic ripetuto = stessa bozza
- UNIQUE (company_id, generation_key) + UNIQUE parziale su source_item_id dei documenti vivi
- `shopping_list_generation_preview`: piccola modifica di sola lettura per esporre su ogni riga diretta `direct_draft_id/number`, così la card mostra «in bozza AD-…» invece di riproporre la riga
- La quota resta «non gestita» finché non c'è la conferma (Fase 2): la Lista non si chiude da sola con bozze aperte; il completamento non cambia

## 5. Frontend (solo questi file)
- `src/lib/direct-purchase.functions.ts` (nuovo): server function con requireSupabaseAuth e context.supabase
- `src/components/shopping/generate-orders-dialog.tsx`: card «Acquisti diretti» con «Genera bozza acquisto diretto» al posto di «Registra»; righe già in bozza indicate con il numero
- `src/components/purchase/direct-purchase-draft-dialog.tsx` (nuovo): modifica bozza (luogo, data, righe con quantità, U.M., prezzo e U.M. del prezzo, totale, note)
- `src/lib/order-generation.functions.ts`: tipo GenerationPreview esteso (solo campi facoltativi)
- `src/components/shopping/AGENTS.md`, `roadmap.md`
Nessuna modifica a Ordini, Consegne, Carico merce, Inventario, giacenza.

## 6. Compatibilità
Ordini fornitore, consegne, carichi, numerazioni LS/ORD/carichi, notifiche e banner invariati. Nessun dato esistente modificato (shopping_list_direct_purchases oggi ha 0 righe). La vecchia «Registra» resta nel DB ma non più nel dialogo.

## 7. Test
- Unit (bun test): calcolo totale riga/documento, prezzo senza U.M. rifiutato lato client, mappatura header/righe
- DB in transazione annullata con `set_config('request.jwt.claims')` + `SET LOCAL ROLE authenticated`:
  1. bozza creata con numero AD-2026-00001 e righe = quote dirette; Lista e quote invariate
  2. stessa chiave → stessa bozza; chiave diversa sulle stesse righe → rifiutata
  3. utente di altra azienda → rifiutato; ruolo non autorizzato → rifiutato
  4. modifica in bozza OK; prezzo senza U.M. rifiutato; quantità 0 rifiutata
  5. Lista non aperta → rifiutata
  6. nessuna notifica, nessun movimento, nessun ordine
- Prova reale dalla strada dell'app (RPC con token dell'utente) con richiesta che non può creare nulla, per verificare la protezione SQL sulle cancellazioni

## 8. Rischi
- Numerazione: modifica a una funzione condivisa — mitigata lasciando identici i rami esistenti e provando LS/ORD/carichi nella stessa transazione
- Lista con bozze AD aperte non si chiude: comportamento voluto, va segnalato in pagina
- Modifica di sola lettura alla preview della generazione: provata contro il frontend attuale

## Escluso dalla Fase 1
Conferma e annullamento (Fase 2), carico merce e giacenza (Fase 3), storico/stampa (Fase 4), foto dello scontrino (nessun bucket né campo).
