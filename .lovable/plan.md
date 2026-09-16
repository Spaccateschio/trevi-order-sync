# Trevi Fruit — Fase 1: Fondazioni

Solo fondamenta: autenticazione, aziende, utenti, ruoli, aziende clienti, rapporti commerciali, sicurezza, tema e scheletro responsive. Nessun prodotto, listino, prezzo, catalogo, carrello, ordine, preparazione, consegna, U.M. alternative o integrazione Danea.

Al termine ti consegno un report e mi fermo.

## 1. Backend

Attivo Lovable Cloud (database, autenticazione, funzioni server). Nessun dato finto nelle pagine business.

## 2. Modello dati (tabelle della fondazione)

- **companies** — aziende fornitrici. Ragione sociale, P.IVA/C.F., contatti, indirizzo, logo/branding, stato, note. Oggi una sola riga: Trevi Fruit, inserita come dato, non nel codice.
- **company_settings** — impostazioni essenziali per azienda (una riga per azienda), pronta a crescere.
- **profiles** — la persona che accede: nome, cognome, telefono, avatar, collegata all'utente autenticato. Nessun ruolo qui.
- **company_members** — appartenenza di una persona a un'azienda fornitrice. Una persona può stare in più aziende.
- **company_member_roles** — ruoli della persona *dentro quella azienda*: amministratore, operatore, trasportatore. Tabella separata, mai un campo modificabile del profilo. Un amministratore è amministratore della sua azienda, non della piattaforma.
- **customer_companies** — aziende clienti: ragione sociale, P.IVA/C.F., contatti, indirizzi. Entità autonoma, non appesa a un fornitore.
- **customer_company_users** — persone autorizzate a operare per un'azienda cliente, con ruolo `owner` (titolare) o `member` (utente). Distinzione presente da subito; la gestione utenti da parte del titolare arriverà dopo.
- **supplier_customer_relations** — il rapporto commerciale azienda cliente ↔ azienda fornitrice. Qui vivranno stato del rapporto (in attesa / attivo / sospeso / rifiutato), listino assegnato, condizioni, abilitazione ordini. In Fase 1 creo la tabella con stato e i campi strutturali; le condizioni commerciali arrivano dopo.
- **audit_events** — chi, cosa, su quale azienda/oggetto, quando, con dettaglio essenziale. Solo eventi rilevanti, nessun tracciamento dei click.

Nessuna tabella extra "per sicurezza". Nessuna duplicazione: i ruoli interni stanno sulla membership, l'accesso cliente sta su customer_company_users, le condizioni commerciali stanno sul rapporto.

## 3. Identificativi e vincoli

- Chiavi tecniche stabili generate dal database; email, P.IVA e ragione sociale non sono mai chiavi di relazione.
- Unicità: una persona una sola volta per azienda; un solo rapporto per coppia cliente/fornitore; P.IVA unica per azienda cliente con eventuale gestione dei casi mancanti.
- Cancellazioni a cascata solo dove logicamente corretto (profilo → membership).

## 4. Autenticazione

- Accesso via email e password, con reset password e pagina dedicata.
- Percorso "cliente invitato": l'amministratore crea l'azienda cliente e invia l'invito; la persona attiva il proprio accesso e completa i dati. In Fase 1 predispongo struttura e stato invito, non l'intero workflow.
- Percorso "nuovo cliente": registrazione autonoma → dati azienda → richiesta di collegamento; il rapporto nasce IN ATTESA e solo l'approvazione lo rende operativo.
- Al primo accesso viene creato automaticamente il profilo persona.

## 5. Sicurezza (parte più importante)

- Protezione a livello database su tutte le tabelle.
- L'appartenenza aziendale viene ricavata **dall'utente autenticato**, tramite funzioni sicure lato database; nessun identificativo azienda che arriva dal browser viene mai usato per autorizzare.
- Regole distinte per lettura, inserimento, modifica e cancellazione; l'inserimento non può attribuire dati a un'azienda diversa dalla propria.
- Il cliente vede solo la propria azienda cliente e i propri rapporti.
- Test reali di isolamento: creo Azienda A (Trevi Fruit) e Azienda B (test) con utenti separati e verifico che l'utente A non possa leggere, modificare, cancellare o creare dati di B, nemmeno cambiando identificativi nelle richieste. Riporto gli esiti nel report.

## 6. Tema Trevi Fruit

- Nome app: Trevi Fruit. Palette giallo ocra + blu notte.
- Colori, spaziature, raggi e tipografia definiti come token centralizzati; nessun colore scritto a mano nei componenti, così il branding diventerà configurabile per OrdinaPro.

## 7. Frontend (solo scheletro)

- Login, registrazione, recupero password.
- Layout autenticato con navigazione per ruolo.
- Aree amministratore, operatore, trasportatore, cliente: pagine segnaposto pulite, senza dati inventati.
- Pagina profilo/account funzionante.
- Pagina pubblica iniziale con accesso.

## 8. Responsive

Progettato dal telefono verso il desktop: su smartphone navigazione touch semplice senza scroll orizzontale, su tablet interfaccia ridotta, su desktop sidebar compatta e uso efficiente dello spazio. Verifico le tre dimensioni prima del report.

## 9. Decisioni registrate per il futuro (non implementate ora)

- **U.M.**: Danea fornisce la U.M. base; Trevi Fruit potrà aggiungere U.M. ordinabili (kg/cs/pz) con prezzo proprio e conversione configurata, mai dedotta automaticamente. Le medie dagli acquisti restano indicative.
- **Numerazione ordini**: formato tipo OC2026-00001, interno e non fiscale, separato dai documenti Danea.

## 10. Contenuto del report finale

Tabelle e loro funzione, relazioni e vincoli, tutte le policy di sicurezza, funzioni database, flusso autenticazione, gestione ruoli, struttura persona/azienda/rapporto, esiti dei test di isolamento A/B, pagine create, verifica sulle tre dimensioni schermo, decisioni aperte prima della Fase 2.

## Da confermare prima di partire

1. Registrazione autonoma con conferma via email (più sicuro, richiede click sul link) o accesso immediato dopo la registrazione?
2. Aggiungo anche l'accesso con Google oltre a email e password?
3. Le persone dell'azienda cliente hanno bisogno già ora di ruoli distinti (titolare/utente) o basta "utente autorizzato"?
