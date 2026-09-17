# Punto 5b — Anagrafica clienti, P.IVA e inviti B2B (solo piano)

## 1. Cosa esiste realmente oggi (verificato sul database)

- **`companies`** — anagrafica unica di tutte le aziende, con `can_buy` / `can_sell` (vincolo: almeno un profilo attivo), indirizzo sede e indirizzo di consegna. P.IVA con unicità solo quando presente, ma **sul testo così com'è scritto**.
- **`supplier_customer_relations`** — la relazione unica venditore→acquirente, già completa di: stato, origine (invito fornitore / richiesta cliente), `requested_at/by`, `decided_at/by`, `accepted_at`, **`seller_enabled` / `buyer_enabled`** (doppio consenso già implementato al punto 5a), riferimento interno e note. Vincoli attivi: coppia unica, divieto di rapporto con sé stessa, chiavi verso `companies` senza cancellazione a cascata.
- **`company_members` + `company_member_roles`** — appartenenza e ruoli (amministratore / operatore / trasportatore), con `invited_by` già presente.
- **`profiles`**, **`company_settings`**, **`audit_events`** — presenti e in uso.
- **`customer_companies` e `customer_company_users` non esistono più**: rimosse quando l'anagrafica è stata unificata. Nessuna P.IVA finta è mai stata creata.
- **Funzioni server già attive**: capacità (vende/compra), appartenenza, ruolo, relazione operativa, richiesta, invito, accettazione/rifiuto, revoca, interruttore del proprio lato. Tutte protette e basate sull'utente autenticato.
- **Frontend**: pagina Acquisti → Fornitori e pagina Vendite → Clienti, con card comune e interruttore del proprio lato.

Conclusione: relazione seller→buyer, doppio consenso, capacità e sicurezza cross-azienda **sono già fatti**. Restano tre lacune reali.

## 2. Le tre lacune da colmare

1. **Anagrafica cliente del venditore**: non esiste. Serve per i clienti che non si registreranno mai.
2. **P.IVA non normalizzata**: "IT12345678901" e "12345678901" oggi convivono come aziende distinte.
3. **Inviti B2B verso chi non ha ancora un account**: oggi si può invitare solo un'azienda già registrata.

## 3. Anagrafica cliente del venditore (nuova tabella `customer_records`)

Appartiene all'azienda venditrice. Contiene: ragione sociale, P.IVA e codice fiscale (con versione normalizzata), contatti, indirizzo, indirizzo di consegna, note, stato (attivo / disattivato), riferimento interno.

- Non è un account e non dà accesso a nulla.
- Visibile solo ai membri del venditore che la possiede; creazione e modifica riservate all'amministratore.
- P.IVA unica **all'interno della stessa azienda venditrice**, non a livello di piattaforma: due fornitori diversi possono avere lo stesso cliente in anagrafica.
- Collegamento con un'azienda registrata: solo tramite un campo `customer_record_id` sulla relazione, con azione esplicita di un amministratore del venditore. La corrispondenza di P.IVA viene **proposta come suggerimento**, mai applicata da sola; la somiglianza della ragione sociale non produce mai un collegamento. Nessuna fusione automatica, nessuna P.IVA segnaposto.

## 4. P.IVA normalizzata

- Colonna normalizzata (solo cifre, prefisso paese rimosso, spazi eliminati) su `companies` e su `customer_records`, calcolata dal database tramite trigger, mai inviata dal browser.
- Unicità su `companies` applicata alla versione normalizzata, solo quando il valore esiste davvero.
- Prima di applicare il vincolo verifico i duplicati reali già presenti: se ne trovo, te li segnalo e decidi tu. Nessuna azienda viene unita o rinominata da me.
- Aziende con P.IVA reali differenti restano sempre distinte.

## 5. Inviti B2B (nuova tabella `company_invitations`)

L'invito collega **due aziende**, non i singoli dipendenti del cliente.

Contiene: azienda venditrice, anagrafica cliente collegata (facoltativa), email destinataria normalizzata, gettone segreto salvato solo come impronta, stato (in attesa / accettato / annullato / scaduto), scadenza, chi ha invitato, data di invio, contatore di reinvii, relazione creata all'accettazione.

Casi gestiti:

- **Cliente già registrato**: nessun invito via email necessario, il venditore invita direttamente l'azienda; la relazione nasce "in attesa" e il cliente accetta dalla propria area.
- **Cliente non registrato**: invito via email; alla registrazione con quella email l'invito viene riconosciuto e, all'accettazione, nasce la relazione già collegata all'anagrafica cliente.
- **Cliente già in anagrafica**: l'invito parte dalla scheda cliente e resta agganciato ad essa.
- **Invito duplicato**: al massimo un invito in attesa per coppia venditore + email; un secondo tentativo restituisce quello esistente.
- **Reinvio**: nuovo gettone, nuova scadenza, invito unico, contatore aggiornato.
- **Annullamento**: stato "annullato", gettone invalidato, storia conservata.
- **Scadenza**: gettone scaduto rifiutato con messaggio chiaro e possibilità di chiedere un nuovo invito.
- **Più utenti della stessa azienda**: l'accettazione riguarda l'azienda; chiunque ne sia amministratore accetta una volta sola per tutti.

Tutto passa da funzioni protette: nessun identificativo azienda o relazione ricevuto dal browser viene ritenuto attendibile.

## 6. Sicurezza

- Le nuove tabelle hanno regole d'accesso attive: anagrafica clienti leggibile solo dai membri del venditore; invito leggibile dal venditore e, tramite funzione dedicata, da chi presenta il gettone corretto.
- Azienda estranea (C) non vede né la relazione né l'anagrafica né gli inviti di A e B.
- Le azioni di invito, accettazione, annullamento, collegamento anagrafica↔azienda verificano ruolo amministratore, capacità (vende/compra) e appartenenza al lato corretto.
- Ogni passaggio finisce nel registro attività.

## 7. Migrazione

Una sola migrazione, senza perdita di dati: nuove colonne P.IVA normalizzata con trigger, `customer_record_id` sulla relazione, tabelle `customer_records` e `company_invitations` con permessi e regole d'accesso, nuove funzioni protette. Prodotti, U.M., immagini, archivi Danea, listini e relazioni esistenti restano intatti.

## 8. Test previsti

- Isolamento A/B/C: A vende, B compra da A e da un terzo fornitore, C estranea non vede nulla.
- Multi-cliente e multi-fornitore: rapporti indipendenti, nessuna interferenza tra cataloghi futuri.
- Doppio consenso: spegnere un lato rende il rapporto non operativo senza perdere dati; riaccensione ripristina.
- Coppia duplicata e rapporto con sé stessa rifiutati; venditore senza "vende" o acquirente senza "compra" bloccati.
- Anagrafica cliente non registrato visibile solo al venditore; collegamento a un'azienda registrata solo per azione esplicita.
- Inviti: duplicato, reinvio, annullamento, scaduto, accettazione da azienda già registrata e da nuovo iscritto.
- Prova che chiamate dal browser con identificativi manomessi non producono effetti.

## 9. Fuori ambito in questo punto

Catalogo cliente, listini assegnati, prezzi, Ordina, ordini, preparazione, consegne, download ordini da Danea, marketplace, chat, preferiti, mirroring documenti. Nessuna modifica a Prodotti, U.M., Immagini e Archivi Danea.
