# Finestra «Riprendi» leggibile sul cellulare

## Problema
La schermata allegata taglia il testo a destra e comprime nome prodotto e motivo sulla stessa riga. Anche il titolo è troppo vicino alla guida e alla chiusura.

## Intervento proposto
Solo sul cellulare:
- Finestra contenuta nella larghezza dello schermo, senza testo tagliato; scorrimento verticale se necessario.
- Titolo leggibile, con spazio separato per guida e chiusura.
- Nome del prodotto completo; motivo, per esempio «Quantità mancante», sulla riga sotto; pulsante «Sistema» sempre visibile.
- Nel percorso «Riprendi», «Sistema» porta soltanto al prodotto scelto, senza aprire il completamento di tutti i prodotti. Gli altri «Non acquistare» restano invariati.
- Avviso più breve e pulsanti leggibili; nessun invito a confermare o riprendere tutti i prodotti nel percorso individuale.

## Precisazione sul singolo prodotto
Il ripristino attuale invia già l’identificativo di un solo prodotto. La presentazione deve rendere altrettanto individuale la sua sistemazione: nessun comando collettivo collegato a «Riprendi». Il completamento collettivo generale tramite «Continua» resta separato e invariato.

## Limiti
Non cambiano le regole di quantità, fornitori, esclusioni o generazione degli ordini. L’unico aggiustamento del percorso è indirizzare la sistemazione al prodotto scelto. Aspetto su computer e tablet invariato. Nessuna modifica ai dati, nessuna pubblicazione e nessuna modifica a roadmap.md.

## File autorizzato
`src/components/shopping/generate-orders-dialog.tsx`: presentazione della finestra e percorso individuale di «Riprendi»/«Sistema» (avviso attuale righe 626–697, gestore di ripristino e pulsante Riprendi).
`src/components/shopping/shopping-list-panel.tsx`: solo il collegamento già esistente alla card scelta, se necessario per renderla visibile e aperta. Nessun cambiamento al componente condiviso delle finestre.

## Verifica
Controllo con prodotti dimostrativi isolati su iPhone 393×852 e larghezze mobili più strette: nome lungo, motivo leggibile, pulsanti accessibili e assenza di tagli laterali. Verifica che riprendere e sistemare un prodotto non tocchi altri prodotti «Non acquistare». Controllo di confronto su tablet e computer, senza premere comandi che salvano dati reali. Eventuale test mirato nel file di test shopping già pertinente, da individuare prima dell’implementazione e includere nel piano prima di modificarlo.

## Conferma
L’intervento sarà eseguito soltanto dopo la tua approvazione.
