# Punto 5 — Collegamento B2B tra aziende (solo piano)

## 1. Cosa esiste già

- **Anagrafica unica `companies`**: tutte le aziende (venditrici, acquirenti, entrambe) stanno in una sola tabella, con `can_buy` / `can_sell` e P.IVA già unica quando presente.
- **`supplier_customer_relations`**: è già la relazione singola `seller_company_id → buyer_company_id`, con stato (in attesa / attivo / sospeso / revocato / rifiutato), origine (invito fornitore / richiesta cliente), date e responsabile della decisione.
- **`customer_companies` e `customer_company_users` non esistono più**: sono state rimosse quando l'anagrafica è stata unificata. Nessuna P.IVA finta tipo `TEMP-` è mai stata creata.
- **Appartenenza e ruoli**: `company_members` + `company_member_roles` (amministratore / operatore / trasportatore), con funzioni database per appartenenza, ruolo, capacità e relazione attiva.
- **Operazioni server-side**: la richiesta di collegamento passa già da una funzione protetta; il browser non decide mai l'appartenenza.
- **Pagina Acquisti → Fornitori**: elenca i venditori disponibili e mostra lo stato del rapporto.

Conclusione: il modello che chiedi esiste già in gran parte. Non serve una nuova tabella `company_connections`: si evolve quella presente.

## 2. Cosa manca (le uniche vere lacune)

1. **Doppio consenso**: oggi c'è solo lo stato unico deciso dal venditore. Manca l'interruttore indipendente dei due lati.
2. **P.IVA normalizzata**: l'unicità è sul testo così com'è scritto; "IT12345678901" e "12345678901" oggi convivono.
3. **Anagrafica cliente del venditore**: non esiste ancora. Serve per i clienti che non si registreranno mai.
4. **Approvazione/rifiuto e invito dal lato venditore**: manca la pagina Clienti e le azioni corrispondenti.

## 3. Modello dati proposto

### 3.1 Evoluzione della relazione esistente (nessuna tabella nuova per la connessione)

Su `supplier_customer_relations` si aggiungono soltanto:

- `seller_enabled` (attivo/disattivo, predefinito attivo)
- `buyer_enabled` (attivo/disattivo, predefinito attivo)
- `accepted_at` (data di accettazione)
- `customer_record_id` (collegamento facoltativo all'anagrafica cliente del venditore)

Stati mantenuti e ridotti a quelli realmente necessari: **in attesa**, **attivo**, **rifiutato**, **revocato**. Lo stato "sospeso" non viene più usato per la sospensione temporanea: quella è rappresentata dai due interruttori, come richiesto. Le righe eventualmente sospese vengono riportate a "attivo" con il lato corrispondente disattivato.

Regola operativa unica, calcolata in un solo punto: il rapporto è operativo solo se stato = attivo **e** entrambi gli interruttori sono attivi. Disattivare un lato non cancella nulla.

Vincoli: unicità della coppia venditore/acquirente (già presente), divieto di rapporto con sé stessa (già presente), il venditore deve avere capacità "vende" e l'acquirente capacità "compra" (verificato da un controllo database, non dal browser).

### 3.2 Anagrafica cliente del venditore (nuova, separata dalla piattaforma)

Nuova tabella `customer_records`: appartiene all'azienda venditrice e descrive un cliente amministrativo (ragione sociale, P.IVA/C.F. normalizzate, contatti, indirizzo, indirizzo di consegna, note, stato). Non è un account e non dà accesso.

Collegamento con un'azienda registrata: soltanto attraverso `customer_record_id` sulla relazione, con azione esplicita di un amministratore del venditore. Nessuna fusione automatica: la corrispondenza di P.IVA viene solo *proposta* come suggerimento; ragione sociale simile non produce mai un collegamento. P.IVA reali differenti restano aziende distinte. Nessuna P.IVA segnaposto.

### 3.3 Rapporto commerciale (predisposizione, non riempita ora)

La connessione resta magra. Le condizioni vivono a parte: `relation_terms` (listino Danea assegnato, archivio di riferimento, note commerciali, visibilità catalogo) — creata ora vuota o rinviata al Punto successivo, come preferisci. Le preferenze U.M. cliente esistono già in una tabella dedicata e restano dove sono.

### 3.4 P.IVA

Si aggiunge una colonna normalizzata calcolata dal database (solo cifre, senza prefisso paese, maiuscolo, spazi rimossi) con unicità solo quando il valore esiste davvero. Se la normalizzazione rivela duplicati reali già presenti, li segnalo e decidi tu prima di applicare il vincolo.

## 4. Flusso invito / accettazione

- **Acquirente chiede**: sceglie un venditore → rapporto "in attesa" (origine: richiesta cliente), lato acquirente già attivo.
- **Venditore invita**: dalla pagina Clienti sceglie un'azienda registrata (o una sua anagrafica cliente) → rapporto "in attesa" (origine: invito fornitore), lato venditore già attivo.
- **Accettazione**: l'altro lato accetta → stato "attivo", `accepted_at` valorizzato, entrambi gli interruttori attivi.
- **Rifiuto**: stato "rifiutato", storia conservata, ripetibile in futuro.
- **Sospensione**: ciascun lato spegne il proprio interruttore; l'altro vede "collegamento sospeso dal fornitore/dal cliente".
- **Chiusura**: solo "revocato", mai cancellazione fisica.

Ogni passaggio viene registrato nel registro attività.

## 5. Sicurezza

- Tutte le azioni che attraversano due aziende passano da funzioni database protette: richiesta, invito, accettazione, rifiuto, revoca, cambio interruttore, collegamento anagrafica↔azienda.
- Nessun identificativo azienda ricevuto dal browser viene ritenuto attendibile: l'azienda dell'utente e il ruolo si ricavano dall'utente autenticato.
- Le funzioni verificano capacità (vende/compra), ruolo amministratore e appartenenza al lato corretto della relazione.
- Regole di accesso: la relazione è leggibile solo dai membri delle due aziende coinvolte; l'anagrafica cliente solo dai membri del venditore che la possiede. Permessi concessi solo a utenti autenticati e al servizio.

## 6. Migrazione dei dati esistenti

Una sola migrazione: nuove colonne con valori predefiniti coerenti (rapporti già attivi = entrambi gli interruttori attivi, `accepted_at` dalla data di decisione), tabella anagrafica clienti, P.IVA normalizzata, aggiornamento funzioni e regole di accesso. Nessun dato eliminato, nessuna P.IVA inventata, Danea/prodotti/archivi/U.M./immagini completamente intatti.

## 7. Test previsti

- Isolamento A/B/C: tre aziende: A vende, B compra da A e da C, C vende e compra. Ogni azienda vede solo i propri rapporti.
- Coppia duplicata rifiutata; rapporto con sé stessa rifiutato.
- Venditore senza capacità "vende" e acquirente senza "compra": creazione bloccata.
- Interruttori: spegnimento di un lato rende il rapporto non operativo senza perdere dati; riaccensione lo ripristina.
- Accettazione/rifiuto solo dal lato corretto e solo da amministratore.
- Anagrafica cliente non registrata visibile solo al venditore; collegamento a un'azienda registrata solo per azione esplicita, mai automatico.
- Prova che nessuna chiamata dal browser con identificativi manomessi produce effetti.

## 8. Preparazione futura (non implementata ora)

Catalogo visibile, listino/prezzo, Ordina, preparazione, consegna e ritorno verso Danea si appoggeranno alla relazione: l'ordine conserverà venditore, acquirente, relazione, prodotto, archivio, U.M. ordinata, quantità e **prezzo congelato calcolato solo lato server**. Nessun marketplace, chat, preferiti, messaggi, mirroring documenti o struttura ereditata dal progetto precedente.

## 9. Fuori ambito in questo punto

Pagine Ordina, catalogo cliente, listini assegnati, preparazione, consegne, download ordini da Danea, ruoli avanzati e inviti utente via email.
