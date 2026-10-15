# Piano tecnico: Genera e invia, liste da spuntare, pagina Ordini

Solo analisi. Nessun codice, migrazione o dato modificato.

## 1. Cosa esiste già (codice reale)

| File | Funzione | Chiamato da | Riuso |
|---|---|---|---|
| `src/routes/_authenticated/acquisti.lista-spesa.tsx` | Pagina Lista | menu | invariato |
| `src/components/shopping/generate-orders-dialog.tsx` | Finestra «Prima di generare»: anteprima, bozze per fornitore, bozza AD | lista | da modificare |
| `src/lib/order-generation.functions.ts` | `shopping_list_generation_preview`, `generate_supplier_order`, `update_draft_order`, `change_draft_supplier` | finestra | riuso |
| `src/lib/purchase.functions.ts` | `manage_purchase_order` (send/cancel/close), consegne, carico, `create_order_share_link` | Ordini, finestra | riuso |
| `src/components/purchase/send-order-dialog.tsx` | Invio: B2B = piattaforma; non B2B = canale obbligatorio | dettaglio ordine | riuso |
| `src/components/purchase/purchase-orders-panel.tsx` | Acquisti → Ordini: gruppi Da inviare / Errore invio / Inviati / Annullati | `acquisti.ordini.tsx` | da ampliare |
| `src/components/purchase/purchase-order-detail.tsx` | Dettaglio, link condivisi | Ordini | riuso |
| `src/lib/direct-purchase.functions.ts` + `direct-purchase-draft-dialog.tsx` | Bozza/conferma/annullo AD | finestra | da ampliare |
| `src/routes/consegna.$token.tsx` + `src/lib/purchase-external.functions.ts` | Pagina pubblica fornitore: dichiara quantità, peso, lotto, scadenza, note, mancanti | link | base della lista «Listonic» |
| `delivery-comparison-panel.tsx`, `goods-receipt-panel.tsx`, `acquisti.ricezione.tsx` | Confronto, contestazioni, carico (`confirm_goods_receipt` unico punto che muove giacenza) | Ricezione | riuso |

Backend: funzioni in `src/lib/*.functions.ts`; migrazioni in `supabase/migrations` (attive) e una cartella `drizzle/migrations` con file recenti.

## 2. Database coinvolto

- `shopping_lists` / `shopping_list_items` / `shopping_list_item_suppliers` (quote fornitore; FK a prodotto, fornitore, U.M.).
- `purchase_orders` (PK id; UNIQUE company+number; UNIQUE company+generation_key; `status` bozza→inviato→…; `send_status`, `send_channel`, `sent_at`, `seen_by_supplier_at`).
- `purchase_order_items` (FK `source_assignment_id` → quota; U.M. acquisto/prezzo fotografate).
- `purchase_order_share_links` (solo `token_hash` UNIQUE, `expires_at`, `revoked_at`, `access_count`).
- `purchase_deliveries` / `purchase_delivery_items` (dichiarato, accettato, contestato; UNIQUE order+sequence).
- `goods_receipts` / `goods_receipt_items` → carico e lotti.
- `direct_purchases` (UNIQUE company+number, company+generation_key; `buyer_label`) / `direct_purchase_items` (UNIQUE `active_source_item_id`: una quota diretta in un solo AD vivo).
- Isolamento: RLS per azienda + funzioni SECURITY DEFINER che verificano `auth.uid()`; pagina pubblica solo `external_*` via token.

Duplicati impediti da: `generation_key` riusata finché la creazione non riesce (doppio clic/riprova = stesso documento), residuo calcolato sulle quote, `FOR UPDATE` sulla Lista, indice unico sulle righe AD.

## 3. Problemi rilevati

1. Generazione multi-fornitore non atomica: ciclo nel browser, successi parziali possibili (gestiti ma da mostrare meglio).
2. Due percorsi di creazione ordini: `create_purchase_orders_from_list` (pannello Ordini, vecchio) e `generate_supplier_order` (finestra). Da decidere se dismettere il vecchio.
3. Due cartelle migrazioni: va chiarito quale è la fonte ufficiale.
4. Gli AD non compaiono in Acquisti → Ordini; «confermato dal fornitore» non è un gruppo.

## 4. Nuovo percorso «Genera e invia»

```text
Clic → per ogni fornitore: generate_supplier_order (chiave idempotente)
     → B2B: manage_purchase_order('send') subito (canale piattaforma)
     → non B2B: ordine resta «da inviare», si crea il link e si apre il pannello Condividi
               (WhatsApp/email/copia); «inviato» solo quando l'utente conferma il canale
     → AD: generate_direct_purchase_draft + link lista d'acquisto
     → riepilogo esiti per riga: Inviato / Da condividere / Errore (Riprova)
```
Riprova: rifà solo le righe fallite con la stessa chiave. Riapertura: mostra documenti già creati e il loro stato, senza ricrearli. Nessun invio di prova.

## 5. Fasi

**Fase A — Genera e invia (solo finestra)**
- File: `generate-orders-dialog.tsx`, eventuale nuovo `generation-results.tsx`.
- Funzioni: esistenti; nessuna migrazione.
- Rischio: invii B2B reali al clic → serve conferma esplicita prima («Stai per inviare N ordini B2B»).
- Test: unità sul calcolo esiti/riprova; prova in anteprima fermandosi prima del clic finale.
- Vedrai: un solo clic, poi un riepilogo con stato per fornitore e pulsanti Condividi.

**Fase B — Pagina Ordini unica**
- File: `purchase-orders-panel.tsx`, `purchase_order_overview` (migrazione per includere AD e stato «confermato/in preparazione»).
- Vedrai: schede Da inviare / Inviati / Confermati / In preparazione / Acquisti diretti / Completati-annullati; link dalla finestra.

**Fase C — Lista da spuntare fornitore**
- Amplia `consegna.$token.tsx`: spunta «preparato» per riga, salvataggio progressivo.
- Migrazione: colonne `prepared_at`/`prepared` su `purchase_delivery_items` + `external_set_delivery_item` esteso (prezzo).
- La spunta non accetta né carica nulla.

**Fase D — Link e lista AD + PDF**
- Nuova tabella `direct_purchase_share_links` (stesso modello dei link ordine: hash, scadenza, revoca, RLS), funzioni `external_direct_*` service_role, nuova pagina pubblica `acquisto.$token.tsx`.
- Dati proposti (quantità, U.M., prezzo, fornitore effettivo, note) in campi «dichiarati» separati, verificabili prima della conferma.
- Stampa PDF dalla pagina (stampa del browser) e Condividi.

**Fase E — Conferma ricezione AD con carico**
- Collegare `confirm_direct_purchase` a carico/lotti (oggi non muove giacenza). Fase più rischiosa: tocca giacenza.

Sicurezza riusata: token 24 byte casuali, solo hash in DB, scadenza/revoca, accesso al singolo documento, `FOR UPDATE` e registro modifiche (`purchase_delivery_line_events`, `purchase_order_changes`).

## 6. Decisioni da prendere

1. B2B inviati subito al clic, o prima una conferma riepilogativa?
2. Non B2B: link creato automaticamente per tutti, o solo quando premi Condividi?
3. Scadenza dei link (es. 7 giorni)?
4. Dismettere il vecchio «crea ordini da lista» nel pannello Ordini?
5. Il prezzo inserito dal fornitore va solo come informazione o anche come proposta di costo al carico?

Si procede una fase alla volta, partendo dalla A dopo la tua approvazione.
