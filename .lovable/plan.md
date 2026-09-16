# Trevi Fruit — Piano tecnico di fondazione

Nuova app da zero. Danea Easyfatt resta il gestionale master (prodotti, costi, listini, DDT, fatture). Trevi Fruit gestisce il ciclo operativo: catalogo ricevuto → clienti → ordini → preparazione → consegna → ritorno ordini a Danea.

Nessuna tabella verrà creata prima della tua approvazione.

## 1. Architettura generale

- App web unica, responsive (smartphone-first per cliente e preparatore, desktop compatto per ufficio).
- Backend integrato Lovable Cloud: database Postgres, autenticazione, funzioni server.
- Tutta la logica commerciale (prezzi, stati, export Danea) sta lato server. Il frontend mostra, non decide.
- Endpoint pubblico dedicato al protocollo e-commerce di Danea, protetto da credenziali di postazione, con verifica lato server.
- Colori: giallo ocra + blu notte, definiti come token di tema unico.

## 2. Isolamento azienda (futuro OrdinaPro)

- Ogni tabella business ha `company_id`, anche con una sola azienda oggi.
- Nessun accesso incrociato possibile: le regole di sicurezza del database filtrano sempre per azienda dell'utente, non per ID passato dal browser.
- Configurazioni per azienda: nomi listini, credenziali Danea, branding, parametri ordine.

## 3. Ruoli e accesso

Quattro ruoli, in tabella dedicata (mai sul profilo utente): amministratore, operatore, trasportatore, cliente.
- Cliente: solo proprio catalogo con propri prezzi, propri ordini.
- Trasportatore: solo consegne assegnate.
- Operatore: ordini e preparazione.
- Amministratore: tutto, dentro la propria azienda.
Modello estendibile a nuovi ruoli senza cambiare struttura.

## 4. Prodotti Danea (nessun catalogo parallelo)

Tabella unica `danea_products`, azienda + identificativo Danea come chiave stabile: codice, descrizione, U.M., categoria, IVA, barcode, stato pubblicato, dati utili del protocollo, ultimo aggiornamento.
- Nessuna copia dei prodotti in altre anagrafiche.
- Import idempotente: reimportare non duplica, aggiorna.

## 5. Listini 1–9

- Nove prezzi netti conservati separatamente per prodotto (NetPrice1…NetPrice9), significato mai alterato.
- Tabella etichette per azienda: numero 1–9 → nome visuale ("1 · BAR"). Il nome è solo etichetta.

## 6. Clienti

Anagrafica operativa propria: dati, P.IVA/C.F., email, telefono, indirizzi e indirizzo di consegna, numero listino assegnato, sconto generale, condizioni specifiche, stato attivo, accesso al portale, eventuale collegamento futuro al cliente Danea.
- Invito e abilitazione portale gestiti dall'amministratore.
- Un utente cliente è legato a uno o più clienti della stessa azienda.

## 7. Motore prezzi (una sola implementazione, lato server)

Priorità deterministica, dalla più forte:
1. Prezzo fisso per prodotto/cliente
2. Sconto o maggiorazione per prodotto/cliente
3. Sconto o maggiorazione per categoria/cliente
4. Sconto o maggiorazione generale cliente
5. Base: listino Danea assegnato al cliente

Esposto come funzione database, richiamabile in batch per pagine di catalogo (non una query per prodotto). Il prezzo applicato viene **congelato** nella riga d'ordine: cambiare i listini domani non altera ordini storici.

## 8. Ordine: testata e righe

Testata: azienda, cliente, numero ordine progressivo per azienda, data/ora, stato, indirizzo consegna, fascia/orario richiesto, note cliente, origine, timestamp operativi, riferimenti Danea.

Riga: riferimento prodotto Danea, codice, descrizione, U.M., quantità ordinata, prezzo unitario applicato, IVA, sconto, totale, più i campi necessari all'export. Dati copiati, non solo collegati.

Righe di preparazione separate: quantità/peso effettivi, mancante, nota. L'ordinato dal cliente non viene mai sovrascritto.

## 9. State machine ordine (proposta)

```text
ricevuto → in_preparazione → preparato → in_consegna → consegnato
```
Stati particolari: `parzialmente_preparato` (da `in_preparazione`), `problema` (da qualsiasi stato attivo, con rientro), `annullato` (fino a `preparato`).

- Stati come elenco chiuso nel database, mai stringhe libere nel codice.
- Transizioni consentite validate lato server; ogni passaggio salva utente e timestamp.

## 10. Sostituzioni

Riga di sostituzione collegata alla riga originale: A = ordinato dal cliente, B = effettivamente consegnato, con quantità e prezzo propri. La riga originale resta visibile e intatta.

## 11. Scarico ordini verso Danea

- Endpoint server compatibile con il protocollo e-commerce Danea: Danea chiede, Trevi Fruit risponde con XML generato lato server.
- Vengono inviati codice, descrizione, quantità, U.M., prezzo di vendita applicato, IVA. **Mai il costo di acquisto.**
- Credenziali solo lato server. Tabella postazioni Danea autorizzate: nome, username, password con hash, attiva/revocata, ultimo utilizzo.

## 12. Idempotenza e concorrenza

- Registro esportazioni per ordine: disponibile, esposto, scaricato, export manuale, data/ora, postazione, esito.
- Un ordine già scaricato non viene riesposto per retry; richieste ripetute restituiscono lo stesso risultato.
- Invio ordine cliente con chiave di richiesta unica: doppio click o rete caduta non creano due ordini.
- Cambi stato e chiusura preparazione atomici e condizionati allo stato atteso: due operatori sullo stesso ordine non si sovrascrivono.

## 13. Audit log

Tabella eventi essenziale: chi, cosa, quando, su quale oggetto, valore prima/dopo dove serve. Solo eventi rilevanti: condizioni cliente, listino, modifica ordine, inizio/fine preparazione, sostituzione, partenza e consegna, operazioni Danea.

## 14. Struttura frontend

- Area cliente: catalogo a lista compatta con ricerca, filtro categoria, preferiti, quantità inline, carrello sempre raggiungibile, invio ordine in un tocco, storico e stato ordini. Una sola schermata di lavoro, non un e-commerce a pagine.
- Area operatore: elenco ordini con stato, scheda ordine, schermata preparazione a card grandi con quantità/peso, mancante, sostituzione, nota.
- Area trasportatore: consegne assegnate, conferma consegna.
- Area amministratore: clienti, condizioni, nomi listini, import prodotti, postazioni Danea, monitor esportazioni.

## 15. Responsive e performance

- Progettazione dal telefono verso il desktop: card compatte, nessuno scroll orizzontale nelle operazioni quotidiane; su desktop tabelle dense.
- Catalogo paginato con ricerca e caricamento progressivo, prezzi calcolati in batch, indici su azienda + codice + categoria + stato ordine. Pensato per migliaia di prodotti.

## 16. Fuori scope in questa versione

Catalogo parallelo, prodotti verso Danea, marketplace, abbonamenti, fatturazione, DDT, contabilità, multi-fornitore, funzioni AI non necessarie.

## 17. Fasi di implementazione

1. **Fondazione**: tema ocra/blu notte, autenticazione, ruoli, azienda, regole di sicurezza. Nessuna funzione business.
2. **Prodotti e listini**: modello prodotti Danea, nove listini, etichette, import idempotente.
3. **Clienti e motore prezzi**: anagrafica, condizioni, funzione prezzi server-side con test.
4. **Portale cliente**: catalogo, carrello, invio ordine con idempotenza.
5. **Ordini e stati**: elenco operatore, state machine, audit.
6. **Preparazione e sostituzioni**.
7. **Consegne e trasportatore**.
8. **Endpoint Danea + registro esportazioni**.
9. **Rifinitura responsive e performance**.

Ogni fase viene consegnata e verificata prima della successiva.

## Da confermare prima di partire

1. Numerazione ordini: progressivo semplice per anno, o formato specifico?
2. Il cliente ordina a pezzi/collo o anche a peso? Serve un secondo campo quantità già in fase d'ordine?
3. Vuoi partire dalla fase 1+2 (fondazione + prodotti/listini) o solo dalla fase 1?
