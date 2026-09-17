# Punto 5b.1 — Registrazione da invito, registrazione autonoma e indirizzi multipli

Obiettivo: chi riceve un invito non deve riscrivere i dati aziendali già presenti nella scheda cliente del venditore. La scheda cliente resta di proprietà del venditore; l'azienda registrata resta del cliente.

## Cosa esiste già (verificato)

- Anagrafica clienti del venditore completa (ragione sociale, P.IVA, codice fiscale, contatti, sede, consegna, note) con P.IVA normalizzata.
- Inviti con collegamento alla scheda cliente, scadenza, reinvio, annullamento, link con codice monouso.
- Pagina dell'invito che mostra il fornitore e la scheda cliente e permette l'accettazione.
- Collegamento commerciale unico venditore→cliente con doppio consenso, stati e registro attività.
- Registrazione persona (nome, cognome, cellulare, email, password) e, subito dopo, creazione azienda con COMPRO/VENDO/ENTRAMBI.
- Vincolo che impedisce due aziende registrate con la stessa P.IVA.

## Cosa manca

1. Il link dell'invito funziona solo per chi è già dentro con un'azienda: se il cliente non ha accesso viene mandato all'ingresso e perde l'invito.
2. La creazione dell'azienda parte da campi vuoti: i dati della scheda cliente non vengono proposti.
3. Non esiste il caso "azienda con quella P.IVA esiste già": oggi la creazione fallirebbe con un errore tecnico.
4. Non esiste il controllo esplicito P.IVA scheda cliente ≠ P.IVA azienda che accetta, con messaggio e passaggio all'amministratore.
5. Non esiste una traccia delle differenze fra scheda cliente e azienda registrata, da mostrare al venditore.

## Come funzionerà

### Percorso del cliente

1. Apre il link. Se non ha accesso, la pagina dell'invito lo accoglie comunque: vede chi lo invita e i pulsanti Accedi / Crea il tuo accesso; il codice dell'invito viene conservato e ritrovato dopo la registrazione o l'accesso.
2. Fatto l'accesso, torna automaticamente all'invito.
3. Se non ha ancora un'azienda: vede il riquadro "Dati aziendali associati al tuo invito" con ragione sociale, P.IVA, codice fiscale, indirizzo, CAP/città/provincia, telefono, email, indirizzo di consegna, già compilati e modificabili, più la scelta COMPRO / VENDO / ENTRAMBI (preselezionata su COMPRO). Pulsanti: Confermo i dati e Modifica/Completa.
4. Alla conferma l'azienda viene creata e collegata al venditore in un unico passaggio, con esito operativo se il venditore ha già dato il proprio consenso.
5. Se ha già un'azienda: vede l'azienda con cui accetterà (P.IVA parzialmente mascherata) e conferma il collegamento, come oggi.

### Controllo P.IVA (lato server, sempre)

- Scheda cliente senza P.IVA: nessun blocco, il cliente inserisce la propria.
- P.IVA uguale (confronto normalizzato): collegamento consentito.
- P.IVA diversa e entrambe presenti: nessun collegamento. Messaggio al cliente ("i dati non corrispondono, il fornitore verificherà") e segnalazione al venditore in Vendite → Clienti, che può collegare manualmente o correggere la propria scheda. Nessuna scheda e nessuna azienda vengono modificate automaticamente.
- Esiste già un'azienda registrata con quella P.IVA: non se ne crea una seconda. Se l'utente ne è amministratore, gli si propone di collegare quella; altrimenti messaggio che spiega di farsi aggiungere dall'amministratore della sua azienda.

### Dati e proprietà

- Le correzioni fatte dal cliente valgono solo sulla sua azienda: la scheda cliente del venditore non viene mai sovrascritta.
- Le differenze rilevate al momento del collegamento vengono conservate come "aggiornamenti proposti" e mostrate al venditore, che decide se recepirle (la funzione di recepimento sarà rifinita nel 5c).

### Invito indipendente dall'email

Il codice dell'invito resta l'unica prova valida; l'email serve solo a proporlo. Il link può quindi in futuro essere inviato via SMS o WhatsApp senza cambiare nulla della logica. Nessuna integrazione SMS ora.

## Dettagli tecnici

- Nuova pagina pubblica dell'invito (fuori dall'area protetta) che mostra l'anteprima senza sessione; la pagina protetta attuale resta come reindirizzamento.
- Codice invito conservato nel browser (sessionStorage) e nel parametro di ritorno dell'accesso; la conferma email rientra sul link dell'invito.
- Estensione di `invitation_preview`: aggiunge i dati proposti della scheda cliente (nessun dato riservato del venditore) e i flag `company_exists_for_vat`, `vat_mismatch`.
- Nuova funzione `accept_invitation_with_new_company(_token, dati azienda...)`: verifica invito valido e non scaduto, verifica P.IVA, verifica assenza di azienda duplicata, crea l'azienda con l'utente come amministratore, crea/aggiorna la relazione con `customer_record_id`, registra tutto in `audit_events`. Tutto in una sola transazione, `SECURITY DEFINER`, `search_path = public`, eseguibile solo da utenti autenticati.
- `accept_customer_invitation` esistente: aggiunta della verifica di coerenza P.IVA e del controllo di ruolo amministratore, senza cambiare la firma.
- Nuova tabella `customer_record_proposed_updates` (scheda cliente, campo, valore proposto, origine, stato) con RLS: leggibile e decidibile solo dal venditore proprietario.
- Nessun `company_id`, `seller_company_id` o P.IVA ricevuto dal browser viene considerato attendibile: tutto ricalcolato lato server dal codice invito e dall'utente autenticato.

## Fuori ambito

Listini e condizioni commerciali (5c), catalogo cliente, Ordina, ordini, invii SMS/WhatsApp, modifiche a Prodotti, U.M., Immagini, Archivi Danea e listini Danea.

## Test previsti

1. Cliente senza accesso: link → registrazione → conferma email → ritorno all'invito → dati precompilati → conferma → azienda creata e collegata.
2. Cliente con accesso ma senza azienda: dati precompilati, modifica dell'indirizzo, conferma; scheda cliente del venditore invariata e differenza registrata come proposta.
3. Cliente con azienda già registrata e stessa P.IVA: nessuna azienda duplicata, solo collegamento.
4. P.IVA diversa: collegamento bloccato, messaggio al cliente e segnalazione al venditore; nessun dato modificato.
5. Azienda con quella P.IVA esistente ma utente non amministratore: collegamento negato con spiegazione.
6. Invito scaduto, annullato, già usato, codice inesistente: nessun effetto.
7. Isolamento: una terza azienda non vede invito, scheda cliente, relazione né proposte.
8. Verifica desktop e smartphone del riquadro dati precompilati.
