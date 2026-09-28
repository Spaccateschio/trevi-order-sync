# Inventario → Prodotti da valutare → Lista della Spesa (piano definitivo)

## Flusso finale
```text
Termina inventario (chiude la sessione, come oggi)
  → Lista della Spesa
      · c'è una Lista corrente Aperta → avviso "Esiste già una Lista in lavorazione"
        (data/ora, n. prodotti, stato) → "Continua questa Lista e valuta l'inventario"
      · nessuna Lista corrente → "Inventario del 28/09 completato · 6 prodotti"
        → "Crea Lista della Spesa da questo inventario"
  → presa in carico (collega Inventario ↔ Lista)
  → riquadro "Prodotti da valutare" (quantità vuote)
  → scrivo la quantità solo di ciò che compro → "Aggiungi" → riga reale della Lista
  → "Termina valutazione" (conferma se restano vuoti)
  → Lista della Spesa normale → assegnazione fornitori → Conferma Lista → Ordini
```

## 1. Campi da aggiungere (tabella `inventory_sessions`)
| Campo | Tipo | Nullable | Note |
|---|---|---|---|
| `purchase_list_id` | uuid | sì | FK → `shopping_lists.id`, ON DELETE SET NULL (le liste oggi non si cancellano; se accadesse l'inventario torna "da valutare") |
| `purchase_evaluated_at` | timestamptz | sì | data/ora termine valutazione |
| `purchase_evaluated_by` | uuid | sì | utente; nessuna FK verso gli utenti (come `created_by`), il nome resta visibile anche se l'utente viene disattivato |

Nessun'altra tabella cambia. Nessun dato esistente viene aggiornato.

## 2. Operazione server `manage_inventory_purchase_evaluation`
Funzione DB `SECURITY DEFINER`, `search_path = public`, eseguibile dagli utenti autenticati; chiamata da una server function con la sessione dell'utente (mai client privilegiato). L'azienda si verifica con `is_company_member(auth.uid())`, mai fidandosi del browser.

**Prendi in carico (`take`)** — rifiuta se:
- l'utente non è membro dell'azienda;
- l'inventario non appartiene all'azienda o non è `completata`;
- l'inventario non è l'ultimo completato dell'azienda (gli inventari vecchi non si propongono);
- la valutazione è già terminata;
- la Lista non appartiene alla stessa azienda o non è `aperta`;
- l'inventario è già collegato a un'altra Lista ancora Aperta o Confermata (punto 3).
Se è già collegato alla stessa Lista: nessun errore, nessuna modifica.

**Termina valutazione (`finish`)** — rifiuta se:
- utente/azienda/inventario non validi come sopra;
- l'inventario non è preso in carico, oppure la sua Lista è Annullata o Chiusa;
- la valutazione è già terminata.
Registra solo data/ora e utente. Non crea righe, non scrive 0, non tocca giacenze né conteggi.

## 3. Inventario già collegato
Una sola Lista per volta. Il collegamento a una Lista B è rifiutato finché la Lista A è Aperta o Confermata.

## 4. Lista annullata (regola proposta)
Se la Lista A viene **Annullata** prima di "Termina valutazione", il collegamento è considerato **decaduto**: l'inventario torna "da valutare" e può essere preso in carico in una nuova Lista. Il riferimento ad A resta registrato fino al nuovo collegamento, così si vede cosa è successo. Stessa regola se A viene **Chiusa** senza terminare la valutazione.

## 5. Lista chiusa (o confermata)
Il riquadro "Prodotti da valutare" permette l'aggiunta solo con Lista **Aperta** (la funzione di aggiunta esistente già lo impone). Con Lista Confermata si può solo "Termina valutazione"; con Chiusa/Annullata vale il punto 4.

## 6. Termina valutazione
Pulsante esplicito nel riquadro. Se restano vuoti:
"4 prodotti non hanno una quantità di acquisto. Confermi di averli valutati e di non inserirli nella Lista della Spesa?" → [Torna alla valutazione] [Conferma e termina]. Se non ne restano, conferma semplice.

## 7. Dopo il termine
Il riquadro sparisce per tutti (refresh, altro dispositivo, altro utente). L'inventario resta nello storico Inventari, invariato.

## 8. Inventari precedenti e 28/09
Nessuna modifica automatica. Si propone **solo l'ultimo inventario completato** non valutato: oggi è il 28/09, che quindi comparirà da valutare. Il 27/09 e il 22/09 restano con i campi vuoti ma non vengono mai proposti. Se in futuro si chiude un inventario nuovo senza aver valutato il precedente, si propone solo il nuovo.

## 9. Interfaccia (Lista della Spesa)
- Selezione automatica solo della Lista corrente (Aperta o Confermata); Chiuse/Annullate in "Storico".
- Senza Lista corrente e senza inventario da valutare: "Nessuna Lista in lavorazione" + "+ Nuova lista" + "Storico".
- Riquadro "Prodotti dall'Inventario del 28/09": foto, codice, descrizione, categoria, quantità contata + U.M., giacenza risultante, campo "Da acquistare" vuoto, "Aggiungi". Esclude i prodotti già presenti nella Lista.

## Non cambia
Inventario chiuso, conteggi, giacenze, Fabbisogno, assegnazioni, conferma Lista, ordini.

## Dettagli tecnici
- Migrazione: 3 colonne + funzione `manage_inventory_purchase_evaluation(_company_id, _session_id, _action, _list_id)`.
- `src/lib/inventory-evaluation.functions.ts`: server function con `requireSupabaseAuth` → `context.supabase.rpc(...)`.
- `inventory-count-panel.tsx`: dopo la chiusura naviga a `/acquisti/lista-spesa?daInventario=<id>` (solo per mostrare l'avviso).
- `acquisti.lista-spesa.tsx`: `validateSearch` per `daInventario`.
- `shopping-list-panel.tsx`: selezione Lista corrente/Storico, avviso, creazione lista + presa in carico.
- Nuovo `inventory-to-evaluate.tsx`: letture su sessione + `inventory_count_entries` + giacenza esistente; aggiunta con `addShoppingListItems` (quantità > 0).
