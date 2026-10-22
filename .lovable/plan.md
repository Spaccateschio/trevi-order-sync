# Correzione dei link di consegna ai fornitori

## Risultato
Il link copiato o incluso nei messaggi deve aprire il singolo ordine sul sito pubblico `https://trevi-order-sync.lovable.app`, senza accesso o registrazione obbligatori, anche quando viene creato dall’anteprima.

## Modifica proposta
- Usare sempre l’indirizzo pubblico per i nuovi link non B2B.
- Correggere anche gli indirizzi di anteprima già presenti nella finestra di condivisione, conservando esattamente il codice del link e la scadenza: nessun nuovo link o ordine per questa correzione.
- Applicare lo stesso indirizzo a Copia link, testo, WhatsApp, Email e SMS; mantenere la conferma manuale dell’invio.
- Lasciare invariati controlli sul singolo ordine, scadenza, revoca e registrazione facoltativa. Non modificare la condivisione B2B.

## Verifiche e limiti
- Verificato senza account: il sito pubblicato è pubblico e un indirizzo con codice inesistente mostra «Link non valido», non una richiesta di registrazione.
- Testare gli indirizzi nuovi e quelli conservati dalla finestra, mantenendo codice e scadenza.
- Non aprire l’ordine reale durante il collaudo: l’apertura attuale registra accessi e può creare una bozza di consegna. Verifica completa con un ordine reale riservata al collaudo manuale autorizzato.
- Nessuna modifica al database, agli ordini, agli stati, a roadmap.md o pubblicazione. Il vecchio messaggio già condiviso non si aggiorna da solo: occorre ricopiare e condividere l’indirizzo corretto.
- La correzione sarà disponibile nell’anteprima; per aggiornare anche il comando di condivisione del sito pubblicato servirà un successivo rilascio autorizzato.

## Dettagli tecnici e file autorizzati
- Creare `src/lib/order-share-url.ts`: unica costruzione/normalizzazione dell’indirizzo pubblico, con controllo del percorso di consegna; mai ricavare il dominio pubblico dal dominio dell’anteprima.
- Creare `src/lib/order-share-url.test.ts`: indirizzo pubblico anche da anteprima; conservazione token e scadenza nel riuso; rifiuto di percorsi non pertinenti.
- Modificare `src/components/purchase/order-share-dialog.tsx`: usare la funzione comune sia per creazione sia per link iniziale, senza scritture aggiuntive.
- Aggiornare `AGENTS.md`: documentare la costruzione centralizzata dei link esterni.
- Nessun altro file applicativo sarà modificato; a fine lavoro saranno indicati i file toccati e le righe cambiate.