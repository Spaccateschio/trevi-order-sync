# «Vendo» solo con approvazione del super admin

## Situazione verificata (sola lettura)
- 3 EMME aveva «Vendo» attivo dalle 21:14 del 19/10 (attivato dalla pagina Azienda). Nessun dato da venditore creato nel frattempo (prodotti, clienti, inviti, collegamenti, U.M. di vendita, listini: zero). Ripristinato a solo «Compro» con la sessione 3 EMME e la funzione dell'app, con traccia nello storico.
- `set_company_capabilities`: basta essere amministratore dell'azienda; controlla solo che resti almeno un profilo. Nessun controllo su chi attiva «Vendo».
- `register_company`: chi si registra spuntando «Vendo» nasce subito venditore.
- La pagina Azienda permette solo di accendere un profilo, non di spegnerlo.
- Super admin: amato3380@gmail.com (attivo). andreatrevisrl2012@gmail.com (3 EMME) era super admin ma è disattivato.
- Email: il servizio di invio è attivo (inviti commerciali). Non esiste ancora nessuna email verso il gestore della piattaforma.

## Fase 0 — Blocco urgente (SQL pronto, non applicato)
File `.lovable/sql/sell-capability-urgent-guard.proposed.sql`:
- `set_company_capabilities` rifiuta l'accensione di «Vendo»; spegnere resta libero (almeno un profilo).
- Protezione sulla tabella aziende: nessun utente può far nascere o diventare un'azienda venditrice senza il flag di approvazione della funzione del super admin (copre registrazione e chiamate dirette).
- Compatibile con l'app online: «Vendo» e la registrazione come venditore mostreranno il messaggio «richiede l'approvazione della piattaforma». Le aziende già venditrici (Trevi) non cambiano.

## Fase 1 — Database (SQL da mostrare prima di applicare)
- Tabella `company_sell_requests`: azienda, richiedente, stato (in_attesa / approvata / rifiutata / annullata), motivo, deciso da/quando, esito email. Una sola richiesta in attesa per azienda. RLS: lettura amministratori dell'azienda; scrittura solo da funzioni.
- `request_company_sell(_company_id)`: solo amministratore dell'azienda, crea la richiesta in attesa.
- `cancel_company_sell_request`: l'amministratore ritira la richiesta.
- `decide_company_sell_request(_request_id, _approve, _reason)`: solo super admin attivo (`platform_team_members.is_super`); approvazione → «Vendo» acceso con il flag fidato; ogni decisione va in `platform_audit_log` e nello storico azienda.
- `set_company_capabilities`: spegnere Vendo/Compro libero, accendere «Compro» libero, accendere «Vendo» mai.
- `register_company`: «Vendo» mai attivo alla nascita; se spuntato, l'azienda nasce acquirente e la richiesta parte in attesa.
- Nessun dato cancellato: prodotti, listini, ordini, clienti e storico restano e tornano visibili alla riattivazione (le pagine si nascondono già in base al profilo).

## Fase 2 — Email (servizio già configurato, solo dal server)
- «Nuova richiesta Vendo» al super admin (indirizzo fisso del team piattaforma).
- «Richiesta approvata» / «Richiesta rifiutata» (con motivo) all'email dell'azienda o del richiedente.
- Invio dopo l'operazione nel database, un invio per richiesta e per decisione (nessun doppione).

## Fase 3 — Pagine
- Azienda → Profilo: tre stati per ciascun profilo. «Compro»: attiva/disattiva. «Vendo»: «Richiedi attivazione», «In attesa di approvazione» (con annulla), «Attivo» (con disattiva), «Rifiutata: motivo».
- Registrazione (onboarding): scelta «Vendo» spiegata come richiesta da approvare.
- Area piattaforma: nuova sezione «Richieste Vendo» con Approva / Rifiuta (motivo facoltativo) e storico.

## File coinvolti
- Nuova migrazione (Fase 0 e poi Fase 1).
- `src/routes/_authenticated/amministrazione.tsx` (pulsanti profilo).
- `src/routes/_authenticated/onboarding.tsx` (testo e richiesta).
- `src/lib/platform.functions.ts` + nuova pagina `src/routes/piattaforma.richieste-vendo.tsx` e voce in `src/components/platform/platform-shell.tsx`.
- Nuovo `src/lib/sell-request.functions.ts` (invio email dal server) e tre modelli email in `src/lib/email-templates/`.

## Prove (solo 3 EMME, nessuna email reale senza autorizzazione)
- 3 EMME prova ad accendere «Vendo» direttamente: rifiutato.
- Richiesta creata e annullata: «Vendo» resta spento.
- Spegnere e riaccendere «Compro» non tocca i dati.
- Approvazione/rifiuto solo con super admin; da 3 EMME rifiutato.

## Ordine proposto
1. Tua conferma → applico la Fase 0 (blocco urgente).
2. SQL della Fase 1 da approvare.
3. Email e pagine, poi collaudo in anteprima.
4. Pubblicazione coordinata con le altre modifiche.
