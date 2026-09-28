# Ciclo Inventario → Lista della Spesa → Ordini con semaforo

```text
🟢 posso contare → 🟡 sto contando → 🔴 ho contato, devo gestire gli acquisti → 🟢 tutte le decisioni sono diventate ordini
```

## 1. Semaforo nella pagina Inventario
- 🟡 **INVENTARIO IN CORSO**: esiste una sessione `in_corso` ("4/6 controllati · 2 mancanti", anche 6/6 finché non si preme "Termina inventario").
- 🔴 **INVENTARIO COMPLETATO — ACQUISTI DA GESTIRE**: nessuna sessione in corso e l'ultimo inventario completato **non ha il ciclo concluso** (regola al punto 4). Pulsante "Vai alla Lista della Spesa".
- 🟢 **PRONTO PER INVENTARIO**: nessuna sessione in corso e ciclo dell'ultimo inventario concluso, oppure nessun inventario mai fatto.
In tutti gli stati restano visibili ultimo conteggio confermato e giacenza. "Azzera quantità" invariato (solo bozze).
Con 🔴 si può comunque aprire un nuovo inventario, ma prima compare l'avviso "C'è un ciclo acquisti ancora da gestire".

## 2. Modifica al database (piccola)
Tabella `inventory_sessions`, tre colonne nuove, tutte facoltative, nessun dato esistente modificato:
| Campo | Tipo | Note |
|---|---|---|
| `purchase_list_id` | uuid, null | FK → `shopping_lists.id`, ON DELETE SET NULL (se la Lista sparisse, l'inventario torna da valutare) |
| `purchase_evaluated_at` | timestamptz, null | termine valutazione |
| `purchase_evaluated_by` | uuid, null | utente; senza FK (come `created_by`), resta leggibile anche se l'utente è disattivato |

Funzioni DB nuove (`SECURITY DEFINER`, `search_path = public`, autorizzazione con `auth.uid()` + `is_company_member`), chiamate da server function con la sessione dell'utente:
- `manage_inventory_purchase_evaluation(_company_id, _session_id, _action, _list_id)` con azioni `take` e `finish`.
- `inventory_purchase_cycle_status(_company_id)`: restituisce colore + dettagli (inventario, lista, prodotti da valutare, acquisti senza ordine).

## 3. Controlli delle operazioni
**Prendi in carico (`take`)** rifiuta se: utente non dell'azienda; inventario di altra azienda o non `completata`; non è l'ultimo completato; valutazione già terminata; Lista di altra azienda o non `aperta`; inventario già collegato a un'altra Lista ancora Aperta/Confermata. Stessa Lista = nessuna modifica.
**Termina valutazione (`finish`)** rifiuta se: controlli azienda/inventario come sopra; non preso in carico; Lista Annullata o Chiusa; già terminata. Registra solo data/ora e utente: nessuna riga, nessuno 0, nessuna giacenza toccata.
**Lista Annullata prima del termine**: il collegamento decade, l'inventario torna da valutare e si può prendere in carico in una nuova Lista (il riferimento resta fino al nuovo collegamento).
**Lista Chiusa**: nessuna aggiunta dal riquadro (la funzione esistente già blocca le liste non aperte).

## 4. Regola ROSSO → VERDE (verificata sul codice attuale)
Oggi gli ordini nascono **tutti insieme** dalla Lista confermata: la funzione esistente accetta solo liste Confermate (quindi con ogni riga interamente ripartita), crea un ordine per ciascun fornitore e rifiuta una seconda generazione. Un ordine può però essere annullato dopo.
Il ciclo è 🟢 quando **tutte** queste condizioni sono vere:
1. la valutazione dell'inventario è terminata;
2. se la Lista collegata ha righe provenienti dalla valutazione: la Lista è Confermata o Chiusa **e** per ogni ripartizione fornitore (prodotto + collegamento fornitore) esiste una riga in un ordine **non annullato** di quella Lista, con quantità ordinata ≥ quantità ripartita;
3. se durante la valutazione non si è deciso di comprare nulla: nessun ordine richiesto, diventa 🟢 subito.
In ogni altro caso resta 🔴.
- **Lista Chiusa non basta da sola**: oggi si può chiudere anche una Lista Aperta senza ordini, quindi conta solo la verifica delle ripartizioni al punto 2.
- **Ordine annullato** dopo: la ripartizione torna senza ordine → 🔴.
- **Lista Annullata** → 🔴 e inventario di nuovo da valutare.

## 5. Correggi conteggio (solo con 🔴)
- Tecnica: usa la rettifica esistente (`inventory_adjustments`), che già registra quantità, motivo, utente, data e riferimento al conteggio originale. Il conteggio originale non cambia.
- Esempio mostrato: "Conteggio originale 13 kg · Correzione +2 kg · Giacenza risultante 15 kg", motivo obbligatorio.
- Se il prodotto è già nella Lista: nessun cambio automatico, avviso "Ricontrolla la quantità da acquistare".
- Con 🟢 il pulsante sparisce; resta solo la normale "Rettifica magazzino".
- Da verificare in implementazione: la funzione di rettifica esistente accetta il riferimento al conteggio. Se servisse cambiarla, mi fermo e te lo chiedo.

## 6. Lista della Spesa
- Selezione automatica solo della Lista corrente (Aperta/Confermata); Chiuse/Annullate in "Storico".
- Arrivando con 🔴:
  - Lista corrente Aperta → avviso "Esiste già una Lista della Spesa in lavorazione" (data/ora, n. prodotti, stato) → "Continua questa Lista e valuta l'inventario";
  - nessuna Lista corrente → "Inventario del 28/09 completato · 6 prodotti" → "Crea Lista della Spesa da questo inventario".
- Riquadro "Prodotti dall'Inventario del 28/09": foto, codice, descrizione, categoria, contato + U.M., giacenza, "Da acquistare" vuoto, "Aggiungi" (funzione esistente, quantità > 0). Vuoto ≠ 0.
- "Termina valutazione": "4 prodotti non hanno una quantità di acquisto. Confermi di averli valutati e di non inserirli nella Lista della Spesa?" → [Torna alla valutazione] [Conferma e termina].
- Poi flusso normale: assegnazione fornitori → Conferma Lista → Ordini (invariati).

## 7. Inventari precedenti e 28/09
Nessuna modifica automatica. Si considera solo l'**ultimo** inventario completato: il 28/09 apparirà 🔴 da valutare; 27/09 e 22/09 non vengono mai proposti.

## Non cambia
Conteggi e inventari chiusi, giacenze, Fabbisogno, assegnazioni, conferma Lista, generazione e invio ordini.

## Dettagli tecnici
- Migrazione: 3 colonne + 2 funzioni (EXECUTE ad `authenticated`).
- `src/lib/inventory-cycle.functions.ts`: server function `requireSupabaseAuth` → `context.supabase.rpc`.
- `inventory-count-panel.tsx`: semaforo in alto; "Correggi conteggio" solo con 🔴; dopo "Termina inventario" naviga a `/acquisti/lista-spesa?daInventario=<id>`.
- `acquisti.lista-spesa.tsx`: `validateSearch` per `daInventario`.
- `shopping-list-panel.tsx`: Lista corrente/Storico, avviso, creazione + presa in carico, riquadro valutazione.
- Nuovo `inventory-to-evaluate.tsx`.
