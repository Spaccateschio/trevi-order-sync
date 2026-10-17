# Controllare l’invio e rimandare lo stesso ordine

## Problema verificato
- In «Ordini fornitore», il comando attuale registra che l’operatore dichiara di avere inviato l’ordine. Non spedisce un’email e non verifica il destinatario.
- Nella Lista esiste già la condivisione, ma l’email non ha destinatario precompilato e il messaggio non include le note.
- Nello screenshot dell’ordine compare «Nessuna nota per il fornitore». Non è una prova di cosa sia stato spedito: il comando attuale non conserva una copia dell’email.
- Non sono stati effettuati invii o modifiche a ordini. Nessun evento email recente risulta nello storico consultato; questo da solo non dimostra la mancata consegna.

## Intervento proposto
1. Prima della condivisione mostrare nome fornitore, indirizzo email, numero ordine, prodotti con quantità e U.M., consegna, note per il fornitore e link personale.
2. Precompilare l’indirizzo email dall’anagrafica, rendendolo verificabile e correggibile per questa condivisione, senza cambiare automaticamente l’anagrafica. Se manca, richiederlo prima di aprire l’email.
3. «Email» apre il programma di posta con destinatario, oggetto e testo completi. Non cambia lo stato dell’ordine. Dopo l’invio effettivo nel programma di posta, l’utente dà la conferma esplicita «Confermo: ordine inviato».
4. Usare la stessa finestra nella Lista della Spesa e nella pagina «Ordini fornitore», eliminando il percorso ambiguo di sola scelta del canale per gli ordini non B2B.
5. Per ordini non B2B già inviati aggiungere «Rimanda ordine»: apre la stessa anteprima e condivide lo stesso documento, senza generare un nuovo ordine, ripetere la conferma acquisti o modificare quantità e stato. Non invalidare i link già mandati; mantenere 72 ore, scadenza e revoca. Se un link valido non è recuperabile perché è conservato solo il suo hash, chiedere esplicitamente la creazione di un link aggiuntivo.
6. Invio B2B tramite piattaforma e acquisti diretti invariati. Il reinvio qui proposto riguarda email/WhatsApp dei fornitori non B2B, non duplicazioni degli ordini B2B.

**Limite chiaro:** questo intervento riusa la condivisione esistente, non introduce spedizione automatica dall’app. Il programma di posta effettua l’invio; l’app non può certificare consegna o lettura.

## File previsti
- `src/components/shopping/generation-results.ts`: testo completo dell’ordine.
- `src/components/shopping/generation-results.test.ts`: test sui dati inclusi e mantenimento delle quantità/U.M.
- `src/components/shopping/generation-summary.tsx`: anteprima e destinatario; finestra condivisa riutilizzabile.
- `src/components/purchase/purchase-order-detail.tsx`: condivisione e reinvio del documento esistente.
- `src/components/purchase/send-order-dialog.tsx`: conferma finale coerente con il canale realmente scelto.
- `src/components/shopping/AGENTS.md` e `AGENTS.md`: regola di riuso della condivisione.
- `roadmap.md`: stato del lavoro e verifiche.

## Verifiche e limiti
- Test automatici con dati fittizi: note, destinatario, quantità/U.M., apertura email senza cambio stato e reinvio senza nuova generazione.
- Verifica visiva senza inviare email, creare link o scrivere dati operativi reali.
- Nessuna modifica al database, agli indirizzi Danea, alle regole del semaforo, a Inventario, ricezione o carico merce. Nessuna pubblicazione.
- Qualsiasi invio reale e prova di conferma riuscita resta da autorizzare separatamente.