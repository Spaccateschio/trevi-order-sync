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
- Ripetere in anteprima autenticata l'apertura del riepilogo attuale su cellulare e computer, senza generare ordini reali.
- Verificare elenco completo anche con Preferiti/ricerca attivi e apertura del solo prodotto scelto, senza scritture.
- Collaudare la generazione soltanto con risposte simulate: un prodotto pronto e altri non acquistati; tre fornitori con successo completo, errore di generazione e errore d'invio.
- Eseguire i test pertinenti e controllare l'assenza di errori nell'anteprima.

Nessuna modifica a database, ordini, bozze, quantità salvate, giacenza o liste precedenti. Nessuna migrazione, pubblicazione o modifica a roadmap.md. Nessun altro file operativo sarà modificato.