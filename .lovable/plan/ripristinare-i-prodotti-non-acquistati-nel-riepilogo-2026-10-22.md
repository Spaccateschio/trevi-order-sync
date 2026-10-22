# Ripristinare i prodotti non acquistati nel riepilogo

## Problema verificato
Su cellulare e computer il riepilogo mostra l'unico prodotto aggiunto alla nuova Lista, ma non gli altri prodotti disponibili: questi non hanno ancora una riga nella Lista e quindi non arrivano al riepilogo. L'immagine corrisponde a questa finestra prima della conferma finale; non dimostra da sola che l'ordine sia già stato creato.

## Correzione limitata all'anteprima
- Nel riepilogo mostrare anche tutti i prodotti disponibili rimasti fuori Lista, indipendentemente da ricerca, Preferiti e limite delle card. Separare «Quantità non inserita» da «Non acquistare»: soltanto 0 confermato significa Non acquistare.
- Rendere l'elenco compatto e scorrevole su cellulare, con numero dei prodotti e apertura dell'elenco.
- Il lucchetto/Riprendi apre direttamente la card del solo prodotto scelto, pronta da modificare, senza aggiungerlo o salvare quantità automaticamente e senza modificare gli altri.
- Conservare il riepilogo fornitori come prima schermata; nessun completamento collettivo o esclusione automatica.
- Conservare il nuovo acquisto vuoto dopo la creazione riuscita di tutti gli ordini selezionati. Un fallimento di generazione mantiene lista e quantità; l'invio resta separato.

## File autorizzati da questo piano
- `src/components/shopping/shopping-list-panel.tsx`: includere i prodotti fuori Lista e aprire individualmente la card scelta.
- `src/components/shopping/generate-orders-dialog.tsx`: mostrare l'elenco aggiuntivo e il comando individuale.
- `src/components/shopping/missing-quantities.ts`: selezione pura dei prodotti fuori Lista per il riepilogo, separata dal completamento collettivo.
- `src/components/shopping/missing-quantities.test.ts`: verifiche dell'elenco e distinzione tra quantità vuota, positiva e zero confermato.

## Verifiche
- Verifica congiunta obbligatoria dei tre comportamenti nello stesso percorso, su cellulare e computer: tutti i prodotti senza quantità sono consultabili nel riepilogo indipendentemente dai filtri; aggiungere un prodotto dimenticato conserva tutte le quantità già inserite; dopo la generazione riuscita la nuova Lista mostra quantità vuote, mantenendo recuperabili i dati precedenti.
- Ripetere in anteprima autenticata l'apertura del riepilogo attuale con Preferiti/ricerca attivi e l'apertura del solo prodotto scelto, senza scritture né generazione di ordini reali.
- Collaudare l'intero percorso aggiunta → ritorno al riepilogo → generazione soltanto con dati e risposte simulate: un prodotto pronto, altri senza quantità e un prodotto dimenticato aggiunto successivamente. Rileggere attraverso le card le quantità iniziali e quella aggiunta, poi verificare il nuovo acquisto vuoto e il recupero del precedente con gli stessi valori.
- Verificare anche tre fornitori con successo completo, errore di generazione e errore d'invio: un errore di generazione mantiene lista e quantità; un errore d'invio dopo la creazione di tutti gli ordini non impedisce il nuovo acquisto vuoto.
- Eseguire i test pertinenti e controllare l'assenza di errori nell'anteprima.
- Non dichiarare completata la correzione sulla base di controlli isolati: riportare esplicitamente l'esito di tutti e tre i comportamenti e distinguere i controlli in sola lettura dai collaudi simulati. La finestra di conferma non prova la creazione dell'ordine: questa avviene solo dopo il comando finale riuscito.

Nessuna modifica a database, ordini, bozze, quantità salvate, giacenza o liste precedenti. Nessuna migrazione, pubblicazione o modifica a roadmap.md. Nessun altro file operativo sarà modificato.