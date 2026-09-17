# Collegamenti B2B — allineamento al modello Efficio (rifatto meglio)

Confronto tra il tuo report Efficio e quello che Trevi Fruit ha già oggi, poi cosa cambio.

## Cosa Trevi Fruit ha già (e resta)

- Una sola riga per rapporto tra due aziende, con lato venditore e lato acquirente distinti.
- Stati: in attesa, attivo, sospeso, revocato, rifiutato.
- Doppio consenso operativo: ogni lato ha il proprio interruttore; il rapporto è operativo solo con entrambi accesi.
- Origine del rapporto: invito del fornitore oppure richiesta del cliente.
- Anagrafica cliente del venditore indipendente dall'azienda registrata, con P.IVA normalizzata e collegamento esplicito.
- Inviti con token, scadenza, reinvio e annullamento.

Quindi il modello di fondo è già quello che in Efficio funzionava bene, senza i debiti tecnici che elenchi (nessun doppio modello di relazione, nessuna P.IVA segnaposto, nessun listino morto sulla relazione).

## Cosa manca davvero e voglio aggiungere

1. **Ruolo del partner leggibile in una sola vista.** Oggi Clienti collegati e Fornitori collegati sono due elenchi separati. Diventa un elenco unico "Aziende collegate" con etichetta del ruolo: Cliente, Fornitore, Entrambi (quando esistono i due rapporti incrociati). Filtri: tutti / clienti / fornitori / in attesa / sospesi.

2. **Invito rapido con codice.** Oggi si può invitare solo un cliente già presente in anagrafica, via email. Aggiungo l'invito libero: genero un codice breve (e il link) da mandare come vuoi — WhatsApp, telefono, email — senza creare prima l'anagrafica. Chi lo riceve, se ha già un account Trevi Fruit, incolla il codice in Collegamenti e il rapporto nasce subito; se non ha un account, il link porta alla registrazione già esistente.

3. **Cerca azienda.** Al posto degli elenchi "Aziende che acquistano / che vendono" metto una ricerca per ragione sociale o P.IVA, con il ruolo da scegliere (compro da loro / vendo a loro) e il pulsante "Chiedi collegamento".

4. **Interruttore del proprio lato e chiusura del rapporto.** Sulla riga di ogni azienda collegata: sospendi/riattiva il tuo lato, e chiudi il collegamento (con conferma). Chiudere non cancella clienti, prodotti né ordini: il rapporto torna chiuso e si può rifare con un nuovo invito.

5. **Inviti: igiene che in Efficio mancava.** Gli inviti scaduti si mostrano come scaduti (non più "in attesa"); blocco alla creazione se esiste già un invito valido per la stessa email o P.IVA, e se l'azienda è già collegata.

6. **Notifiche in pagina.** Contatore sulla voce di menu Collegamenti quando ci sono richieste da approvare o inviti da gestire.

## Cosa NON faccio ora

- Catalogo per collegamento (prodotti visibili per cliente) e listini/condizioni: sono il Punto 5c e 5d, resta la regola "prezzo base solo dai listini Danea ricevuti, congelato nell'ordine".
- Nessun secondo modello di relazione, nessuna tabella parallela, nessuna cancellazione a cascata.

## Dettagli tecnici

- Codice invito: nuova colonna codice breve (unico) su `company_invitations`, generata dalla stessa funzione che crea l'invito; nuova funzione `accept_invitation_code(_codice, _buyer_company_id)` che riusa la logica già testata di `accept_customer_invitation` (token). Nessun nuovo flusso di registrazione.
- Vincolo anti-duplicato aggiuntivo: indice unico simmetrico sulla coppia di aziende (least/greatest) per impedire A→B e B→A dello stesso ruolo.
- Chiusura rapporto: riuso di `revoke_company_relation`; sospensione con `set_relation_side_enabled`.
- Ricerca aziende: estendo `available_buyers`/`available_suppliers` con un parametro di ricerca, restituendo solo ragione sociale, città, provincia (nessun dato sensibile).
- Scadenza inviti: calcolata in lettura (`expires_at < now()` → scaduto) più aggiornamento dello stato quando si tenta di riusare l'invito; nessun job notturno.
- Tutte le operazioni restano funzioni SECURITY DEFINER con `search_path = public`, appartenenza ricavata dall'utente autenticato, audit su `audit_events`.

## File toccati

- migration: colonna codice invito, funzione di accettazione per codice, indice simmetrico, ricerca aziende.
- `src/routes/_authenticated/collegamenti.tsx`: elenco unico con ruolo e filtri, ricerca azienda, invito rapido, interruttore lato, chiusura rapporto, inviti con stato scaduto.
- `src/components/companies/relation-card.tsx`: ruolo, interruttore, chiusura.
- `src/lib/navigation.ts`: contatore sulla voce Collegamenti.
- Nessuna modifica a Clienti, Prodotti, U.M., immagini, import Danea.

Confermi questo elenco, o vuoi togliere/aggiungere qualcosa (per esempio l'invito con codice, o la ricerca aziende)?
