# Fase 2B — Inviti reali ai collaboratori (solo progettazione)

Obiettivo: il titolare invita una persona, che riceve un'email, accetta con un account nuovo o già esistente ed entra nell'azienda con i ruoli esistenti (amministratore, operatore, trasportatore). In questa fase non si aggiungono ruoli nuovi né permessi avanzati.

## Situazione attuale (verificata in sola lettura)

- Servizio email attivo e verificato sul dominio `notify.suitefficio.com`. È già usato per gli inviti commerciali ai clienti tramite un invio solo dal server, quindi senza credenziali nel browser.
- Gli inviti commerciali esistenti servono per i clienti, non per i collaboratori. Prevedono già lo stato, la scadenza, un codice salvato solo come impronta e il conteggio dei reinvii. Non vanno riusati: mescolerebbero clienti e collaboratori.
- La Fase 2A fornisce già il titolare, le protezioni sulle appartenenze e sui ruoli, il blocco per azienda e lo storico non modificabile.
- La pagina «Collaboratori (anteprima)» è solo dimostrativa e non invia nulla.

## Cosa costruire

### 1. Archivio inviti collaboratori (database)
Una tabella nuova e separata con:
- azienda, nome, cognome, email normalizzata e ruoli proposti (solo quelli esistenti);
- impronta del link (mai il link in chiaro) e stato: in attesa, accettato, scaduto, revocato;
- scadenza di 72 ore, numero di reinvii, chi ha invitato, chi ha accettato e quando.

Regole:
- al massimo un invito aperto per la stessa coppia azienda + email;
- nessuna scrittura diretta dal browser: lettura solo per il titolare e gli amministratori dell'azienda, tramite funzione;
- lo stato «scaduto» si ricava dalla data e viene registrato alla prima operazione successiva.

### 2. Funzioni del database (proprietario postgres, controlli su chi chiama)
- **Crea invito:** solo il titolare. Rifiuta se la persona è già membro attivo o se esiste già un invito aperto. Genera il codice sul server e salva solo l'impronta. Registra l'operazione nello storico.
- **Reinvia:** stesso invito, quindi nessun duplicato. Crea un nuovo codice, così il vecchio link smette di funzionare, rinnova la scadenza e aumenta il contatore. Funziona sia su un invito in attesa sia su uno scaduto.
- **Revoca:** solo il titolare e solo su un invito in attesa o scaduto. Registrata nello storico.
- **Anteprima del link:** dal codice mostra solo il nome dell'azienda e i ruoli. Non mostra mai l'email completa né altri dati.
- **Accetta:** richiede una persona collegata con email verificata, uguale all'email dell'invito. In una sola operazione:
  - blocca l'invito e l'azienda;
  - verifica che l'invito sia in attesa, non scaduto e non revocato;
  - crea l'appartenenza, oppure riattiva un'appartenenza disattivata secondo le regole della 2A;
  - assegna i ruoli usando i passaggi autorizzati della 2A;
  - segna l'invito come accettato (uso singolo) e scrive nello storico.
- **Elenco inviti:** per il titolare e gli amministratori, con gli stati richiesti.

### 3. Invio email (server)
- Nuovo modello di email «Invito collaboratore» nello stile Trevi Fruit.
- Funzione server con accesso obbligatorio. Il database prima conferma che chi chiama è il titolare, poi genera il codice e restituisce il link una sola volta al server, mai al browser. Il server spedisce l'email.
- Il link punta sempre all'indirizzo pubblico del sito. La chiave di invio resta solo sul server.
- Il reinvio usa una chiave diversa per ogni reinvio, così non partono doppioni.

### 4. Pagina di accettazione `/invito-collaboratore/$codice`
- Se la persona non ha fatto l'accesso: «Accedi» oppure «Registrati», con la verifica email obbligatoria, e poi ritorno al link.
- Se ha fatto l'accesso con un'email diversa: messaggio chiaro, nessuna accettazione.
- Messaggi chiari per link scaduto, revocato o già usato.

### 5. Schermata Collaboratori
- La scheda dimostrativa resta invariata in questa fase.
- Si aggiunge una scheda reale «Collaboratori» con persone reali, inviti divisi per stato, «Invita», «Reinvia» e «Revoca».
- Si toglie l'anteprima solo dopo il tuo collaudo e una tua conferma separata.

## Decisioni da approvare
1. **Chi invita:** solo il titolare, oppure anche gli amministratori? La mia proposta è solo il titolare per ora.
2. **Ruolo amministratore via invito:** permesso, visto che nella 2A solo il titolare gestisce gli amministratori? Proposta: sì, ma solo se invita il titolare.
3. **Scadenza:** 72 ore, come i link esterni già esistenti?
4. **Email non corrispondente:** l'invito vale solo per l'email esatta oppure si accetta con qualsiasi account? Proposta: solo l'email esatta.
5. **Persona già membro disattivato:** l'invito la riattiva oppure si usa il comando «Riattiva»? Proposta: si usa «Riattiva», l'invito viene rifiutato.
6. **Limite reinvii:** per esempio al massimo 5 al giorno per invito?

## Rischi
- **Email sbagliata:** chi riceve il link non può usarlo con un altro account, grazie al punto 4.
- **Prove:** la prova reale richiede una email vera. La faccio solo su 3 EMME, con un indirizzo che indichi tu e dopo una tua autorizzazione esplicita.
- **Rischi già noti, che non correggo qui:** gli inviti commerciali che partono senza controllo dell'amministratore e il codice che non viene confrontato con l'impronta. Restano separati e da trattare a parte.
- **Email in spam:** il dominio è nuovo, quindi le prime email possono finire nello spam.

## Sequenza (una cosa alla volta, ognuna con approvazione)
1. Testo completo della migrazione da rileggere (nessuna applicazione).
2. Applicazione e prove di rifiuto con la sessione 3 EMME.
3. Modello email e funzione di invio, senza spedire nulla.
4. Pagina di accettazione e scheda reale.
5. Collaudo con email reale autorizzata.

Escluso: nuovi ruoli, reparti, permessi avanzati, la tabella roadmap, la pubblicazione e le modifiche agli inviti commerciali.
