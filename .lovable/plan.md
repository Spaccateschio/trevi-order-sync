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

## Registrazione autonoma ≠ autorizzazione commerciale

Restano quattro livelli distinti e separati: accesso alla piattaforma, identità dell'azienda, rapporto commerciale, autorizzazione a catalogo/prezzi/ordini.

- Un'azienda può registrarsi da sola: crea accesso e azienda, ma non diventa cliente di nessuno.
- Per lavorare con un venditore serve una richiesta di collegamento (acquirente → venditore) che un amministratore del venditore accetta o rifiuta. Solo dopo l'accettazione, e con entrambi gli interruttori accesi, il rapporto è operativo. La funzione di richiesta e la decisione esistono già; va aggiunta la pagina "Trova il tuo fornitore" nell'area Acquisti e l'elenco delle richieste in attesa in Vendite → Clienti.
- Conoscere una P.IVA non dà mai diritti: se la P.IVA inserita appartiene a un'azienda già registrata, la registrazione autonoma si ferma e mostra "questa azienda è già presente: chiedi al suo amministratore di aggiungerti". Nessuna appropriazione, nessuna fusione, nessun collegamento automatico a rapporti esistenti.
- La P.IVA di una scheda cliente non crea mai da sola un collegamento: serve sempre invito accettato o richiesta accettata.
- Nessuna verifica esterna della P.IVA in questa fase: solo controllo di formato e unicità.

## Indirizzi multipli

Oggi sede e consegna sono campi fissi su azienda e scheda cliente. Passiamo a un elenco di indirizzi, senza limiti di numero.

Nuova tabella `addresses`: proprietario (azienda **oppure** scheda cliente, mai entrambi), etichetta ("Ristorante Centro", "CAR Box 15"), via, numero civico, CAP, città, provincia, paese, referente, telefono, note operative, attivo/non attivo.

Le funzioni di un indirizzo sono separate dall'indirizzo stesso, in `address_functions`: sede legale, sede operativa, consegna, ritiro, magazzino, con flag "predefinito per questa funzione". Così lo stesso indirizzo può essere insieme sede operativa e consegna senza essere duplicato, e possono esistere più consegne. Un solo predefinito per funzione e per proprietario, garantito da vincolo.

Consegna = dove il venditore porta la merce. Ritiro = dove il cliente va a prenderla (tipicamente un indirizzo del venditore). Sono due funzioni distinte, così l'ordine potrà offrire "Consegna a…" oppure "Ritiro presso…".

Migrazione senza perdita: ogni sede esistente diventa un indirizzo con funzione sede legale predefinita, ogni indirizzo di consegna esistente un indirizzo con funzione consegna predefinita; i campi attuali restano in sola lettura per un periodo e le schermate leggono dal nuovo elenco.

Separazione confermata: gli indirizzi dell'azienda appartengono al cliente, quelli della scheda cliente al venditore. Il cliente che cambia i propri indirizzi non modifica l'anagrafica del venditore; le differenze diventano aggiornamenti proposti.

Nell'invito gli indirizzi della scheda cliente vengono proposti come indirizzi iniziali dell'azienda, modificabili prima della conferma.

RLS: gli indirizzi di un'azienda sono modificabili solo dai suoi amministratori; sono leggibili dalle aziende con un rapporto operativo (per consegne e ritiri) e da nessun altro. Gli indirizzi di una scheda cliente sono leggibili e modificabili solo dal venditore proprietario.

Preparazione ordini: l'ordine futuro conserverà una copia dei dati dell'indirizzo scelto, così una modifica successiva dell'anagrafica non cambia gli ordini già fatti. Ordina non viene implementato ora.

## Fuori ambito

Listini e condizioni commerciali (5c), catalogo cliente, Ordina, ordini, invii SMS/WhatsApp, verifica esterna della P.IVA, modifiche a Prodotti, U.M., Immagini, Archivi Danea e listini Danea.


## Test previsti

1. Cliente senza accesso: link → registrazione → conferma email → ritorno all'invito → dati precompilati → conferma → azienda creata e collegata.
2. Cliente con accesso ma senza azienda: dati precompilati, modifica dell'indirizzo, conferma; scheda cliente del venditore invariata e differenza registrata come proposta.
3. Cliente con azienda già registrata e stessa P.IVA: nessuna azienda duplicata, solo collegamento.
4. P.IVA diversa: collegamento bloccato, messaggio al cliente e segnalazione al venditore; nessun dato modificato.
5. Azienda con quella P.IVA esistente ma utente non amministratore: collegamento negato con spiegazione.
6. Invito scaduto, annullato, già usato, codice inesistente: nessun effetto.
7. Isolamento: una terza azienda non vede invito, scheda cliente, relazione né proposte.
8. Verifica desktop e smartphone del riquadro dati precompilati.
9. Registrazione autonoma: nuova azienda creata, nessun accesso a clienti, fornitori, catalogo o prezzi di altri.
10. Richiesta di collegamento: acquirente richiede, venditore vede la richiesta, accetta e il rapporto diventa operativo; con rifiuto nessun accesso.
11. Registrazione autonoma con P.IVA di un'azienda già registrata: bloccata, nessuna appropriazione.
12. Indirizzi: creazione di più consegne, un solo predefinito per funzione, indirizzo con doppia funzione senza duplicati, disattivazione senza perdita di storico.
13. Migrazione indirizzi: sedi e consegne esistenti presenti nel nuovo elenco con le funzioni corrette.
14. Isolamento indirizzi: azienda senza rapporto operativo non li vede; il cliente non vede quelli della scheda del venditore.
