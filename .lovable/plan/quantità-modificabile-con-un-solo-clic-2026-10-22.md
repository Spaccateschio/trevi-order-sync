# Quantità modificabile con un solo clic

## Risultato
- Dal lucchetto nel riepilogo si arriva al solo prodotto scelto, già aperto e con quantità subito modificabile: niente secondo clic sulla matita.
- Stesso accesso diretto dopo «Riprendi», senza intervenire sugli altri prodotti «Non acquistare».
- Quantità e fornitori restano invariati fino alla conferma esplicita. Aprire normalmente una card continua a non sbloccarla.

## File autorizzati
- `src/components/shopping/shopping-list-panel.tsx`: nel percorso individuale del riepilogo aprire la card e abilitare la modifica locale del solo prodotto selezionato.
- `src/components/shopping/shopping-mobile-card-state.ts` e relativo `shopping-mobile-card-state.test.ts`: piccola funzione verificabile per la selezione individuale, con test che gli altri prodotti restino invariati.
- `src/components/shopping/AGENTS.md`: documentare l'eccezione del percorso esplicito «Sistema/Riprendi», mantenendo invariato il comportamento dell'apertura normale.

## Verifiche e limiti
- Verifica con prodotti finti su cellulare e computer: campo subito utilizzabile, altri prodotti invariati, nessuna conferma automatica.
- Esecuzione dei test mirati e controllo degli errori dell'anteprima.
- Nessuna modifica a dati reali, regole di acquisto, database, avviso ORD, pubblicazione o `roadmap.md`.

## Dettaglio tecnico
Lo sblocco usa esclusivamente lo stato locale già esistente (`unlockedIds`), non la funzione che salva il blocco nel database. Non si aggiunge messa a fuoco automatica: il campo è subito abilitato e la tastiera si apre quando l'utente lo tocca.