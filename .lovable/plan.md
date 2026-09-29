# Blocco quantità nella Lista della Spesa (come nell'Inventario)

## Cosa vedrai
- Card e Righe della Lista: scrivi la quantità (o usi +1 +3 +5 +10), premi **Conferma**.
- Dopo la conferma la card diventa ocra (come nell'Inventario): quantità, tasti rapidi e U.M. disabilitati; compare un lucchetto con «Confermato da X alle HH:MM».
- Il pulsante matita/lucchetto **Sblocca** riapre la modifica; dopo aver cambiato premi di nuovo Conferma.
- Fornitori e ripartizioni restano modificabili anche con quantità bloccata (il blocco riguarda solo la quantità da acquistare).
- Filtro nuovo «Da confermare / Confermati» accanto agli altri filtri.
- Le liste già esistenti partono tutte sbloccate.

## Non tocco
Inventario, Fabbisogno, Ordini, Consegne, Carico Merce, semaforo, «Prodotti da valutare» (salvo mostrare lo stato bloccato se il prodotto è già in lista).

## Dettagli tecnici
1. Database (1 migrazione):
   - `shopping_list_items`: nuove colonne `quantity_locked_at timestamptz NULL`, `quantity_locked_by uuid NULL` (nessuna colonna GENERATED).
   - Nuova RPC `set_shopping_list_item_quantity_lock(_item_id, _locked boolean)` SECURITY DEFINER, search_path = public: verifica azienda tramite auth.uid() (stessa autorizzazione delle RPC Lista), imposta/svuota i due campi; per bloccare richiede decided_quantity non nulla e > 0.
   - La RPC che salva la quantità rifiuta la modifica se la riga è bloccata («Quantità confermata: sbloccala per modificarla»).
   - La funzione che elenca le righe restituisce anche i due campi.
2. `shopping-list.functions.ts`: nuova server function `setShoppingListItemQuantityLock` con context.supabase.
3. `shopping-list-card.tsx`: pulsante Conferma / Sblocca, stile ocra bloccato, controlli disabilitati (Card e Righe).
4. `shopping-list-panel.tsx`: collegamento del comando e filtro Confermati.

Resta in sospeso la domanda precedente sull'unificazione delle due sezioni: la affrontiamo dopo questo passo.
