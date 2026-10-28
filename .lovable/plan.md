# Inventario — verifica e correzione dei cinque punti

## Già corretto
- Nel percorso attuale, campo vuoto non diventa zero: la conferma collettiva registra solo le bozze con quantità valida. Zero scritto esplicitamente resta un conteggio valido.
- Il pulsante «Conferma» è presente sulle singole card, con i blocchi e i permessi esistenti.
- Il comando collettivo non chiude l'inventario: conferma e chiusura sono già separate nel database. Non occorrono migrazioni.

## Correzioni previste
1. **Due azioni chiaramente separate:** «Conferma tutto» nella barra inferiore, disponibile a chi può contare; «Chiudi inventario» separato, solo con gli attuali permessi di chiusura. Conferma tutto lascia sempre aperto l'inventario. Chiudi inventario riusa la chiusura esistente e non conferma bozze implicitamente; se restano bozze, invita a confermarle o correggerle prima. I vuoti restano mai contati, anche chiudendo.
2. **Riepilogo prima della conferma:** considerare tutte le card della sessione, non solo quelle mostrate dai filtri; indicare distintamente prodotti e card quando lo stesso prodotto ha più fornitori/zone. Mostrare da confermare, vuoti mai contati e bloccati, con prodotto/card e motivo del blocco. I prodotti già confermati e senza nuova bozza non sono vuoti.
3. **Le 10 differenze più grandi:** confrontare solo bozze numeriche confermabili e quantità calcolate note, nella stessa U.M. di magazzino, tramite la conversione verificata già esistente. Ordinare per valore assoluto della differenza; mostrare prodotto, fornitore/zona, calcolata, contata, differenza e U.M. Nessuna equivalenza inventata: senza confezione la card compare tra i bloccati.
4. **Differenze oltre il 50%:** evidenziare in rosso solo se `|contata − calcolata| > |calcolata| × 0,5`; esattamente 50% non rosso. Con calcolata zero, un conteggio diverso da zero viene evidenziato senza percentuale infinita; con calcolata sconosciuta non calcolare differenze/percentuali. Nota sempre facoltativa.
5. **Torna a correggere:** chiude il riepilogo senza confermare nulla e lascia intatte quantità e U.M. Rendere accessibili anche tutti i motivi restituiti dalla conferma effettiva, se nel frattempo qualche card non è più confermabile.

## Criticità da correggere nello stesso flusso
- Oggi la conferma aspetta 1,2 secondi dopo aver avviato il salvataggio delle bozze, senza attendere davvero la conclusione. Sostituire l'attesa fissa con l'attesa delle operazioni effettive: un errore deve impedire la conferma e conservare i valori.
- Mantenere nella bozza la U.M. scelta per ciascuna card e usarla coerentemente nel riepilogo e nella conferma: non confondere casse e kg.
- Dopo successo rileggere le bozze rimaste e le righe aggiornate: confermate bloccate, rifiutate ancora correggibili. Nessuna chiusura automatica.
- Eventuali percorsi precedenti che consentivano di trasformare collettivamente i vuoti in «esauriti» non saranno collegati ai nuovi due comandi; nessuna eliminazione massiva del codice precedente.

## File autorizzati per l'implementazione
- `src/components/inventory/inventory-count-panel.tsx`: comandi, attesa bozze, U.M., riepilogo e aggiornamento dopo conferma.
- `src/lib/inventory-confirm-all.ts` e `src/lib/inventory-confirm-all.test.ts`: classificazione pura, differenze, limite 10 e soglia 50% con test.
- Nuovo `src/components/inventory/inventory-confirm-all-dialog.tsx`: finestra del riepilogo usando gli elementi grafici già presenti.
- `src/components/inventory/AGENTS.md`: regola delle due azioni e del riepilogo senza scritture implicite.
- `roadmap.md`: solo la voce di questo intervento e il suo esito.

Nessun altro file applicativo, pagina, stile, migrazione o funzione database viene modificato. Prima di estendere questo elenco, fermarsi e chiedere conferma.

## Verifiche e consegna
- Test concreti: vuoto distinto da zero esplicito, già contato senza bozza, bozza invalida, confezione mancante/ambigua, conversione 2 casse × 10 = 20 kg, top 10 ordinato, 50% esatto/non esatto, calcolata zero/null, note non richieste.
- Eseguire i test pertinenti e verificare i segnali automatici dell'anteprima.
- Verificare comandi e riepilogo nell'anteprima autenticata senza confermare, chiudere o modificare dati operativi; le prove locali isolate non alterano quantità esistenti.
- Il collaudo effettivo di scrittura/rilettura resta ad Andrea su 3 EMME, non viene eseguito dall'assistente su Trevi o altre aziende reali.
- Resoconto distinguendo ciò che era già corretto dalle correzioni, file/righe e test eseguiti.

**Nessun dato esistente modificato, nessuna pubblicazione.**
