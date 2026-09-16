# Danea: da indirizzo con token a Postazioni con utente e password

## Obiettivo

L'indirizzo da incollare dentro Danea diventa **uno solo, fisso e uguale per tutte le aziende**.
Chi invia si identifica con utente e password (postazione). Dall'utente il server ricava
l'azienda: nessun dato di appartenenza arriva dal browser o da Danea.

## 1. Cosa viene eliminato

- Indirizzo con codice segreto dentro l'URL (`/api/public/danea/products/<token>`).
- Pulsanti "Rigenera collegamento" / "Revoca collegamento" che cambiavano l'indirizzo.
- Salvataggio e rimozione di login/password sul collegamento unico.
- Risposta `403 Collegamento Danea revocato`: da ora credenziali mancanti, errate o revocate
  rispondono sempre `401` con la richiesta di autenticazione standard.

Il collegamento attuale con codice nell'indirizzo viene chiuso: dopo la modifica va creata una
postazione e aggiornati indirizzo, utente e password dentro Danea (una volta sola, poi resta fisso).

## 2. Nuova struttura dati

Nuova tabella **postazioni Danea** per azienda:

- nome dato dall'amministratore (es. "PC Ufficio")
- utente generato automaticamente e univoco su tutta la piattaforma
- password conservata **solo come impronta** (hash con sale), mai in chiaro
- stato attiva/revocata, chi l'ha creata, data
- ultima connessione, ultimo invio riuscito, ultimo esito
- dati rilevati da Danea (versione, magazzino, cartella immagini, listino predefinito)
- massimo **5 postazioni attive** per azienda, imposto dal database

Le tabelle di storico invii, prodotti, prezzi, costi e segnalazioni restano quelle di oggi: cambia
solo il riferimento, che punta alla postazione invece del vecchio collegamento. Gli invii già
registrati vengono conservati.

## 3. Endpoint pubblico stabile

Un unico indirizzo pubblico, senza sessione e senza token:

```text
https://trevi-order-sync.lovable.app/api/public/danea/products
```

- accetta `POST` con invio multipart
- legge utente e password dall'autenticazione HTTP Basic
- confronta la password con l'impronta salvata a tempo costante
- risale postazione → azienda lato server
- credenziali assenti, errate, postazione revocata o azienda che non vende: `401` con
  `WWW-Authenticate: Basic realm="Trevi Fruit Danea"`
- successo: `200`, `text/plain; charset=utf-8`, corpo esattamente `OK`
- registra il tentativo distinguendo i casi: se l'utente corrisponde a una postazione esistente,
  l'esito (anche password errata o postazione revocata) viene scritto su quella postazione; se
  l'utente non esiste, il tentativo finisce in un registro separato di accessi non riusciti, senza
  mai memorizzare la password

### Lettura del file

Ordine di ricerca, come nel meccanismo già funzionante:
1. la prima parte dell'invio che sia un file, qualunque nome abbia;
2. i campi chiamati `xml` o `file`;
3. il corpo grezzo della richiesta.

Il testo viene decodificato leggendo la dichiarazione iniziale dell'XML: gestiti `UTF-8` e
`ISO-8859-1`/`Windows-1252`, con ripiego automatico se i caratteri accentati risultano corrotti.

## 4. Operazioni per l'amministratore

Tre funzioni lato server, riservate agli amministratori dell'azienda e registrate nel registro
attività:

- **Aggiungi postazione**: crea utente e password, restituisce entrambi in chiaro una volta sola.
  Rifiutata oltre 5 postazioni attive o se l'azienda non ha il profilo di vendita.
- **Rigenera password**: nuova password, stessa postazione, stesso utente, stesso indirizzo.
- **Revoca postazione**: disattiva solo quella postazione; indirizzo e altre postazioni intatti.

## 5. Pagina Gestionale

Riscritta come gestione postazioni, compatta e senza spazi sprecati:

- in alto l'indirizzo fisso con "Copia indirizzo" e la nota che non cambia mai;
- elenco postazioni con nome, utente, stato, ultima connessione, ultimo invio, ultimo esito e le
  azioni Rigenera password / Revoca; su telefono diventano schede al posto della tabella;
- "Aggiungi postazione" chiede solo il nome;
- dopo creazione o rigenerazione, un riquadro evidenziato mostra utente e password con pulsanti
  Copia e l'avviso che la password è visibile una sola volta;
- sotto, come oggi, listini ricevuti, invii ricevuti e prodotti ricevuti, in tabelle scorribili.

## 6. Prodotti: nessun cambiamento

Resta esattamente la logica già verificata sui vostri file reali: identità del prodotto,
codice come riferimento, invio completo e incrementale, prodotti aggiornati ed eliminati,
i nove listini con i loro nomi, costi fornitore riservati, nome e cartella dell'immagine,
reinvii senza duplicati, registro delle segnalazioni. Cambia solo chi si autentica.

**Protezione sull'invio completo**: i prodotti assenti dal file vengono marcati non pubblicati
soltanto se l'invio completo è stato letto ed elaborato interamente e senza errori. Se il file è
parziale, corrotto, vuoto o presenta errori di lettura/validazione, la depubblicazione per assenza
viene saltata e l'invio resta registrato con la relativa segnalazione: un file problematico non può
rendere non pubblicati in massa prodotti validi.

## 7. Compatibilità futura

La stessa postazione servirà anche per il flusso inverso (scarico ordini verso Danea): per questo
la postazione nasce con un elenco di usi consentiti, oggi solo la ricezione prodotti.

## 8. Verifiche che eseguirò

- creazione postazione, invio reale simulato dei tre file XML già usati: risposta `OK`
- utente inesistente, password errata, postazione revocata: `401` con richiesta di autenticazione
- senza credenziali: `401`, mai `403`
- reinvio dello stesso file: nessun duplicato
- invio completo che omette prodotti: depubblicazione corretta
- file con caratteri accentati in `ISO-8859-1`: descrizioni corrette
- due aziende con postazioni diverse: prodotti separati, nessuna visibilità incrociata
- limite di 5 postazioni attive
- rigenerazione password: la vecchia non funziona più, l'indirizzo resta identico
- invio completo troncato o corrotto: nessuna depubblicazione in massa, segnalazione registrata
- utente inesistente: tentativo nel registro accessi non riusciti, nessuna postazione toccata
- pagina su telefono e desktop, dati di prova rimossi al termine
