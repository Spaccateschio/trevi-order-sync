# Finestra «Riprendi» leggibile sul cellulare

## Problema
La schermata allegata taglia il testo a destra e comprime nome prodotto e motivo sulla stessa riga. Anche il titolo è troppo vicino alla guida e alla chiusura.

## Intervento proposto
Solo sul cellulare:
- Finestra contenuta nella larghezza dello schermo, senza testo tagliato; scorrimento verticale se necessario.
- Titolo leggibile, con spazio separato per guida e chiusura.
- Nome del prodotto completo; motivo, per esempio «Quantità mancante», sulla riga sotto; pulsante «Sistema» sempre visibile.
- Avviso più breve: «Completa i prodotti indicati oppure continua con quelli pronti. Gli altri restano nella Lista.»
- Due pulsanti interi e uno sotto l’altro: «Sistema le quantità» e «Continua con i prodotti pronti».

## Limiti
Non cambiano il comportamento di Riprendi, quantità, fornitori, esclusioni o generazione degli ordini. Computer e tablet invariati. Nessuna modifica ai dati, nessuna pubblicazione e nessuna modifica a roadmap.md.

## File autorizzato
`src/components/shopping/generate-orders-dialog.tsx`: esclusivamente presentazione della finestra e dell’avviso sui prodotti non pronti (area attuale righe 626–697). Nessun cambiamento al componente condiviso delle finestre.

## Verifica
Controllo con prodotti dimostrativi isolati su iPhone 393×852 e larghezze mobili più strette: nome lungo, motivo leggibile, pulsanti accessibili e assenza di tagli laterali. Controllo di confronto su tablet e computer, senza premere comandi che salvano dati reali.

## Conferma
L’intervento sarà eseguito soltanto dopo la tua approvazione.
