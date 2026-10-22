# Nascondere l’intestazione della Lista della Spesa

## Risultato
- Nascondere «Straordinaria · 15/10/2026 · Aperta» e la relativa freccia su cellulare e computer.
- Conservare la scelta delle liste nel menu già esistente, senza nuove barre o scritte.
- Lasciare invariati data di necessità, ricerca, card, filtri, avviso ORD e comandi di acquisto.

## Quantità dopo l’invio: causa verificata
ORD-2026-00007 è stato inviato, ma la sua lista del 15 ottobre è ancora aperta e contiene AD-2026-00003 in bozza. La schermata continua a leggere le quantità salvate di quella lista: non è ancora stata realizzata la separazione visiva richiesta per iniziare un nuovo acquisto anche quando il precedente non è concluso.

Non azzerare le quantità salvate: si rischierebbe di alterare il lavoro ancora aperto. La correzione delle quantità nuove richiede un intervento separato, che conservi la bozza AD e le eventuali quote residue; non è inclusa nella sola rimozione della scritta.

## File autorizzato
- `src/components/shopping/shopping-list-panel.tsx`: selettore mobile intorno alle righe 1419–1432, selettore e badge desktop intorno alle righe 1499–1519, menu opzioni esistente per conservare la scelta delle liste senza l’intestazione visibile.

## Verifiche
- Controllare su smartphone e computer che l’intestazione non sia visibile e che ricerca, card e avviso ORD restino disponibili.
- Eseguire i test esistenti pertinenti e controllare gli errori dell’anteprima.
- Nessuna modifica ai dati, nessun ordine o lista creati, nessuna migrazione, pubblicazione o modifica a roadmap.md.