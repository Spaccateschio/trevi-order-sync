# Lista della Spesa e Inventario: diagnosi lentezza e flessibilità

## Cosa è già verificato
- **Pubblicazione:** l'app pubblicata (21/11, 07:34 UTC) è allineata all'anteprima: nessuna modifica in sospeso. Le correzioni (`src/lib/shopping-optimistic.ts`, coda in `shopping-list-panel.tsx`, salvataggio in sottofondo di `inventory-count-panel.tsx`) sono quindi anche su suitefficio.com.
- **Virtualizzazione:** assente. Nessuna libreria di virtualizzazione nel progetto, tutte le card sono nella pagina.
- **Dimensioni:** `shopping-list-panel.tsx` ha 2451 righe, `inventory-count-panel.tsx` 4177 righe e 37 chiamate al database tra i due. Lo stato del ciclo arriva da `getInventoryCycleStatus` (`inventory-cycle.functions.ts`); il blocco della pagina è `CycleLockContext` (`locked: !sessionId && cycleColor === "rosso"`).
- **Blocchi sull'Inventario:** pulsante di avvio disattivato con ciclo rosso (riga 1893), testo «Completa prima il ciclo acquisti», «Rifai inventario» al posto di «Svuota», correzione consentita solo per l'amministratore sull'ultimo conteggio del ciclo (righe 3519-3524). Lato database i controlli sono in `0007_inventory_reopen_and_list_recheck.sql`, `0038_modello2_funzioni_v2.sql` e `0087_reset_open_inventory_count.sql`.

## Fase 1: misure (sola lettura, su 3 EMME, nessun dato scritto)
1. Elenco completo dei blocchi: lettura di `inventory_purchase_cycle_status`, `manage_inventory_purchase_evaluation`, delle funzioni di apertura, riapertura e reset del conteggio e dei trigger collegati, con il nome e la condizione esatti.
2. Apertura delle due pagine su telefono simulato, con e senza Fast 3G: le richieste in ordine, la durata di ciascuna, quali partono in sequenza e potrebbero partire insieme, quante righe si scaricano rispetto a quelle della prima schermata.
3. React Profiler con 119 righe nella Lista e 134 card nell'Inventario: quante card si ridisegnano e in quanti millisecondi per ogni cifra scritta, ogni conferma e ogni filtro.
4. Calcoli ripetuti a ogni ridisegno: `shoppingInventoryTotals` (`src/lib/shopping-inventory-total.ts`), giacenza calcolata, totali e riepiloghi. Verifica delle letture ripetute senza bisogno (chiavi di cache, intervalli di aggiornamento, invalidazioni).
5. `EXPLAIN ANALYZE` solo sulle letture che nella misura superano i 100 ms.

I risultati arrivano in un resoconto con file, funzioni, query e tempi, prima di qualsiasi modifica.

## Fase 2: correzioni minime, dalla più conveniente (confermate dalle misure)
1. **Card memorizzate e proprietà stabili** in entrambe le pagine: ogni cifra scritta ridisegna solo la card in uso. Costo basso, beneficio alto.
2. **Calcoli una volta sola:** totali e giacenze calcolati una volta per ogni aggiornamento dei dati, non a ogni ridisegno. Costo basso.
3. **Letture in apertura:** le richieste indipendenti partono insieme e si eliminano quelle doppie. Costo basso o medio.
4. **Virtualizzazione** con `@tanstack/react-virtual`, una libreria nuova: si disegnano solo le card visibili. Costo medio: card ad altezza variabile, tastiera su telefono, stampa e «Completa le quantità» vanno riverificate. La propongo solo se, dopo i punti 1-3, una cifra richiede ancora più di 100 ms.
- Nessuna modifica al database senza una misura che la giustifichi.

## Flessibilità dell'Inventario: tre opzioni da scegliere
**A. Correzione dopo l'invio con avviso e storico.** Si permette di correggere un conteggio del ciclo anche dopo l'invio degli ordini. La pagina avvisa che gli ordini inviati non cambiano e ogni correzione lascia una riga nello storico (chi, quando, prima e dopo).
- Rischio basso: gli ordini restano intatti, la giacenza viene ricalcolata.
- File: funzione di correzione (nuova migrazione), `inventory-count-panel.tsx`.

**B. Nuovo inventario in parallelo.** Si può avviare un nuovo conteggio mentre il ciclo è ancora aperto, come conteggio di sola giacenza che non apre una nuova Lista.
- Rischio medio: viene meno la regola «un solo ciclo aperto» e la Lista deve sapere quale conteggio usare.
- File: `inventory_purchase_cycle_status`, funzione di avvio del conteggio, `inventory-cycle.functions.ts`, `inventory-count-panel.tsx`, `shopping-list-panel.tsx`.

**C. Chiusura anticipata del ciclo.** Un comando per l'amministratore, «Chiudi ciclo», conclude il ciclo anche con ordini non ancora ricevuti: gli ordini restano validi e il semaforo torna libero.
- Rischio medio: le ricezioni successive vanno riferite al ciclo chiuso.
- File: `manage_inventory_purchase_evaluation`, `inventory-cycle.functions.ts`, `inventory-count-panel.tsx`.

Consiglio A, eventualmente con C: costano meno e non toccano la regola del ciclo unico. B richiede una tua decisione esplicita.

## Cosa serve per procedere
- Autorizzazione alla Fase 1 sull'account 3 EMME, solo lettura e misure.
- Dopo le misure: la tua scelta tra A, B e C e l'approvazione dei punti della Fase 2.
