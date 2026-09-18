# Fase A.2 — Catalogo globale, listini assegnati e U.M. preferite

## A) Catalogo globale cross-fornitore

In **Acquisti → Catalogo** due viste selezionabili in alto:
- **Vetrine**: le card attuali dei fornitori operativi (invariate).
- **Tutti i prodotti**: elenco unico con i prodotti di tutti i fornitori operativi.

Colonne: foto, codice/descrizione, fornitore, categoria, U.M. (selettore rapido), prezzo, preferito.
Filtri: ricerca testo, fornitore, categoria, "Solo preferiti", "Solo con prezzo".
Su smartphone: card touch con foto piccola, fornitore e prezzo.

I prezzi si ottengono chiamando `buyer_catalog_prices` una volta per fornitore e unendo i
risultati lato client: nessuna nuova via d'accesso ai prezzi, nessuna policy su `product_prices`.
Le foto passano dalla server function `getCatalogImageUrls` già esistente, chiamata per fornitore.

## B) Listini assegnati al cliente

### Aggiunte al database (solo additive)
1. `company_settings.default_price_list_number smallint` — listino predefinito che l'azienda
   venditrice propone ai nuovi clienti.
2. `company_invitations.price_list_number smallint` — listino scelto al momento dell'invito.

### Funzioni RPC (SECURITY DEFINER, `search_path = public`, audit su `audit_events`)
- `set_default_price_list(_company_id, _list_number)` — solo `is_company_admin`; accetta solo
  numeri presenti in `danea_price_lists` con `is_active = true` per quell'azienda, oppure NULL.
- `set_customer_price_list(_customer_record_id, _list_number)` — solo amministratore del
  venditore proprietario del cliente; scrive `customer_records.assigned_price_list_number`.
  Nessun update diretto dal browser.
- `resolve_default_price_list(_company_id)` — restituisce il valore impostato oppure, se assente,
  il `list_number` attivo più basso.
- Estensione di `create_customer_invitation` e `create_free_invitation` con parametro
  `_price_list_number` facoltativo (default = predefinito risolto), salvato sull'invito.
- Estensione di `accept_invitation_row` / `link_customer_record_to_relation`: quando l'invito
  ha un listino e il collegamento è agganciato a un cliente d'anagrafica senza listino,
  il valore viene copiato in `customer_records.assigned_price_list_number`.
  Invito rapido senza anagrafica: il valore resta sull'invito e si applica all'aggancio.

### Interfaccia
- **Gestionale/Impostazioni**: select "Listino predefinito per i nuovi clienti" tra i listini
  Danea attivi.
- **Finestre invito** (scheda cliente e invito rapido in Collegamenti): select "Listino da
  assegnare", precompilata col predefinito.
- **Scheda cliente** (Vendite → Clienti) e **dettaglio collegamento**: select "Listino
  assegnato" visibile all'amministratore venditore, con indicazione "Nessun listino → prezzi
  su richiesta".

Ereditarietà sulle destinazioni, override e import assegnazioni dal file Danea restano nel
Punto 5c: non anticipati.

## C) U.M. preferita dell'acquirente (sticky)

Riuso di `customer_product_unit_preferences` (unica per seller+buyer+prodotto).
Le RLS attuali già permettono all'acquirente lettura, inserimento, aggiornamento e cancellazione
(`is_company_member(buyer_company_id)`); verifico solo che il trigger di validazione accetti la
scrittura lato acquirente con collegamento operativo e, se necessario, aggiungo la condizione
`relation_is_operational` alla policy di inserimento (irrigidimento, non allargamento).

Regola di risoluzione, applicata ovunque: preferenza salvata → unità predefinita del prodotto
→ prima unità disponibile.

Regola sticky: ogni scelta di U.M. fa upsert della preferenza, quindi l'ultima usata diventa la
proposta successiva. Punti di scelta costruiti ora: select nella pagina prodotto e selettore
rapido nella riga del catalogo (globale e per fornitore). La lista della spesa (Fase B) riusa
la stessa funzione senza logica nuova.

## Codice

- `src/lib/catalog.ts`: lettura multi-fornitore, prezzi per fornitore, preferenze U.M.
  (lettura + upsert), risoluzione U.M. proposta.
- `src/lib/price-lists.ts`: listini attivi del venditore e chiamate alle nuove RPC.
- Nuovi componenti in `src/components/catalog/`: `catalog-global-list.tsx`,
  `unit-picker.tsx`.
- `src/routes/_authenticated/acquisti.catalogo.index.tsx`: due viste Vetrine / Tutti i prodotti.
- `acquisti.catalogo.$sellerId.index.tsx` e `...$productId.tsx`: selettore U.M. sticky.
- `src/components/companies/customer-records-panel.tsx` e `connection-detail.tsx`:
  select listino assegnato.
- `src/routes/_authenticated/danea.tsx` (area Gestionale): select listino predefinito.
- Finestre invito in `customer-records-panel.tsx` e `collegamenti.tsx`: select listino.

## Non toccato

Import Danea e parser, listini Danea ricevuti, relazioni e doppio consenso, destinazioni e
indirizzi, prodotti lato venditore, `buyer_catalog_prices` come unica via ai prezzi.

## Casi di verifica

- Assegno un listino a un cliente già collegato → nel suo catalogo i prezzi compaiono subito,
  al posto di "Su richiesta".
- Rimuovo l'assegnazione → tornano "Su richiesta" e nessun prezzo è raggiungibile.
- Invito con listino scelto → accettazione → il cliente d'anagrafica risulta con quel listino.
- Invito rapido senza anagrafica → aggancio a un cliente → il listino si applica in quel momento.
- Cambio U.M. nella pagina prodotto → rientrando, e nella griglia del catalogo globale,
  la stessa U.M. è già proposta.
- Catalogo globale con due fornitori: filtri fornitore/categoria/preferiti/"Solo con prezzo"
  coerenti; il fornitore sospeso da un lato non compare.
- Prova desktop 1280px e smartphone 390px.

## Vincoli aggiuntivi confermati

1. **Firme delle funzioni invito — nessun overload**: `create_customer_invitation(uuid, text, integer)`
   e `create_free_invitation` non vengono estese con un `CREATE OR REPLACE` che aggiunge
   `_price_list_number` con default: Postgres creerebbe una seconda funzione in overload e le
   chiamate a 3 argomenti diventerebbero ambigue ("function is not unique"), rompendo i flussi
   invito attuali. Nella stessa migrazione: `DROP FUNCTION` della firma vecchia, `CREATE` con la
   nuova firma, poi `REVOKE` da PUBLIC e anon e `GRANT EXECUTE` a authenticated sulla nuova firma.
   Stesso trattamento per `create_free_invitation`.
2. **Copia del listino su tutti i percorsi di accettazione**: le vie sono
   `accept_customer_invitation`, `accept_invitation_code`, `accept_invitation_with_new_company`.
   Se convergono tutte su `accept_invitation_row`, la copia del listino sta solo lì; altrimenti
   va ripetuta in ognuna. Il percorso coperto viene dichiarato in un commento nel codice SQL.
   Verifica aggiuntiva: accettazione via codice, via link e via registrazione di nuova azienda →
   in tutti e tre il listino dell'invito arriva a destinazione.
3. **`relation_is_operational` solo nella policy INSERT lato acquirente**, non nel trigger.
   `validate_customer_product_unit_preference` gira anche sulle scritture del venditore, che deve
   poter sistemare le U.M. di un cliente con un lato momentaneamente sospeso: il trigger resta con
   `has_active_relation` così com'è.
