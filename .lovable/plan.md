# Lista della Spesa: nuovo acquisto separato dopo l’invio

## Risultato
- Nascondere «Straordinaria · 15/10/2026 · Aperta» e la relativa freccia su cellulare e computer.
- Conservare la scelta delle liste nel menu già esistente, senza nuove barre o scritte.
- Lasciare invariati data di necessità, ricerca, card, filtri, avviso ORD e comandi di acquisto.
- Dopo l’invio riuscito, mostrare le card del nuovo acquisto con «Da acquistare —». Non usare 0: lo zero confermato significa «Non acquistare».
- Nel menu esistente rendere recuperabile il lavoro precedente, distinguendo liste con residui e bozze dal nuovo acquisto.

## Quantità dopo l’invio: causa verificata
ORD-2026-00007 è stato inviato, ma la sua lista del 15 ottobre è ancora aperta e contiene AD-2026-00003 in bozza. La schermata continua a leggere le quantità salvate di quella lista: non è ancora stata realizzata la separazione visiva richiesta per iniziare un nuovo acquisto anche quando il precedente non è concluso.

Non azzerare le quantità salvate: si rischierebbe di alterare il lavoro ancora aperto. Il database consente già liste aperte distinte. Il problema è nella selezione della pagina, che riutilizza la precedente lista aperta. La separazione può quindi usare i comandi esistenti senza migrazioni, ma richiede approvazione perché cambia quale lista riceve le nuove quantità.

## Separazione proposta
1. Aprire un nuovo spazio di acquisto vuoto dopo un invio confermato, senza creare o modificare dati all’apertura della pagina o alla chiusura della finestra.
2. Creare una lista distinta solo alla prima Conferma esplicita di una nuova quantità. Non riutilizzare la vecchia lista aperta; la stessa nuova lista raccoglie le conferme successive.
3. Conservare ordini, liste, quantità residue e AD in bozza nelle rispettive liste di origine, recuperabili dal menu «Acquisti precedenti». Non copiarli nella nuova lista né riordinarli automaticamente.
4. Se l’invio è parziale o fallisce, mantenere visibili gli esiti e il lavoro da recuperare. Una semplice chiusura della finestra non deve far ripartire il ciclo.
5. Ricordare sul dispositivo quale lista è il nuovo acquisto, distinguendo utente e azienda; dopo rientro non selezionare accidentalmente la lista precedente. Il recupero di una lista deve essere esplicito.
6. Usare solo i collegamenti fornitori già ammessi; nessuna copia delle quantità precedenti. Verificare come mantenere le scelte fornitore senza confonderle con quote già ordinate.

## File proposti da autorizzare
- `src/components/shopping/shopping-list-panel.tsx`: selettore mobile intorno alle righe 1419–1432, selettore e badge desktop intorno alle righe 1499–1519, menu opzioni esistente per conservare la scelta delle liste senza l’intestazione visibile.
- `src/components/shopping/shopping-list-selection.ts` e relativo test: distinguere nuovo acquisto e recupero esplicito, senza fallback alla precedente lista aperta.
- `src/components/shopping/shopping-list-ready-state.ts` e relativo test: creazione differita della nuova lista senza riuso della precedente; conferme ravvicinate nello stesso nuovo ciclo condividono la creazione.
- `src/components/shopping/generate-orders-dialog.tsx`: notificare al pannello solo gli invii realmente riusciti, senza nuove scritture.
- `src/components/shopping/catalog-entries.tsx`: nuove quantità indirizzate esclusivamente alla nuova lista, bozze locali separate per ciclo.
- `src/components/shopping/AGENTS.md`: documentare la separazione dei cicli e il recupero del lavoro precedente.

Prima di implementare, leggere integralmente i file indicati e affinare i punti di integrazione. Se servono altri file o cambiamenti ai comandi del database, fermarsi e chiedere una nuova approvazione.

## Verifiche
- Controllare su smartphone e computer che l’intestazione non sia visibile e che ricerca, card e avviso ORD restino disponibili.
- Eseguire i test esistenti pertinenti e controllare gli errori dell’anteprima.
- Aggiungere test con valori concreti: 5 kg inviati → nuovo campo vuoto, vecchi 5 kg conservati; nuova Conferma → lista distinta; bozza AD e residuo recuperabili; secondo ordine allo stesso fornitore senza toccare il primo; invio fallito non azzera la vista; nessuna scrittura prima della Conferma.
- Provare il percorso completo con dati isolati simulati e controllare la pagina reale solo in lettura. La creazione e l’invio sul database operativo rimangono un collaudo manuale dell’utente, non eseguito dall’assistente.
- Durante il lavoro dell’assistente: nessuna modifica ai dati reali, nessun ordine o lista creati, nessuna migrazione o pubblicazione. Roadmap aggiornata solo con le due attività richieste; nessuna modifica alle altre attività.