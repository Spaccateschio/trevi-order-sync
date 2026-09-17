# Riorganizzazione Clienti / Collegamenti + preparazione listino cliente

Nessuna implementazione del Punto 5c in questo intervento: qui si separano le due pagine e si prepara il modello del listino.

## 1. Nuova organizzazione del menu

Area Vendite:
- **Clienti** (`/vendite/clienti`) — gestionale dell'anagrafica commerciale del venditore.
- **Prodotti** (già esistente).
- **Preparazione**, **Consegne**, **Gestionale** (già esistenti).

Area comune (visibile sia a chi compra sia a chi vende):
- **Collegamenti** (`/collegamenti`) — rapporti tra aziende Trevi Fruit.

La pagina **Acquisti → Fornitori** diventa un rimando a Collegamenti (scheda "Fornitori"), così i rapporti stanno in un unico posto e non esistono due punti di gestione della stessa relazione.

## 2. Cosa rimane in Clienti

Elenco clienti del venditore, con ricerca e stato, e scheda cliente con:
- ragione sociale, P.IVA / codice fiscale, stato attivo/disattivato;
- contatti (email, telefono);
- indirizzi (con la scelta se condividerli con i partner);
- destinazioni (punti operativi, con indirizzo collegato e documenti separati);
- riferimento Danea e note;
- **indicatore di collegamento** (pallino colorato con etichetta, sola lettura, che apre la pagina Collegamenti):
  - grigio = non collegato, nessun invito;
  - giallo = invito inviato o richiesta in attesa di risposta;
  - verde = collegato e operativo;
  - arancione = collegato ma sospeso da uno dei due lati;
  - rosso = rifiutato o collegamento chiuso;
- azione **Invita** quando il cliente non è collegato: invio del link per email, reinvio o annullamento (resta qui perché parte da quel cliente);
- se il cliente si registra da solo e chiede il collegamento, l'indicatore passa a giallo e la richiesta si approva dalla pagina Collegamenti: nella scheda cliente non si decide nulla;
- in futuro: listino assegnato e condizioni commerciali.

Un cliente esiste qui anche se non usa Trevi Fruit.

## 3. Cosa passa in Collegamenti

Pagina unica con tre viste:
- **Clienti collegati** (lato venditore) e **Fornitori collegati** (lato acquirente), mostrate solo secondo le capacità dell'azienda.
- **Richieste da approvare** (ricevute) e **Richieste inviate** (in attesa dell'altra azienda).
- **Inviti in attesa**: gli inviti email non ancora accettati, con reinvio e annullamento.
- Per ogni rapporto: stato, quale lato lo tiene attivo (il mio lato / il lato del partner), sospensione e riattivazione, rifiuto, chiusura.
- **Aziende che acquistano** / **Aziende che vendono**: elenco delle aziende Trevi Fruit invitabili o a cui chiedere il collegamento (oggi in Clienti e in Fornitori).

Tutto ciò che riguarda anagrafica, indirizzi e destinazioni esce da questa pagina.

## 4. Come le due pagine condividono la stessa relazione

Nessun dato duplicato: la relazione resta una sola riga in `supplier_customer_relations`, con `status`, `origin`, `seller_enabled`, `buyer_enabled` e il collegamento facoltativo al cliente d'anagrafica (`customer_record_id`).

- Collegamenti legge e scrive la relazione (accetta, rifiuta, sospende, riattiva) tramite le funzioni già esistenti.
- Clienti legge la stessa relazione in sola lettura, tramite `customer_record_id`, solo per mostrare "azienda collegata" e lo stato.
- Gli inviti restano in `company_invitations`: si creano dalla scheda cliente, si controllano da Collegamenti.
- Un solo punto di calcolo dello stato operativo (`isRelationOperational`), già presente, usato da entrambe le pagine.

### Dettagli tecnici
- Nuova route `src/routes/_authenticated/collegamenti.tsx`; nuova voce `comune.collegamenti` in `src/lib/navigation.ts`.
- Riutilizzo di `RelationCard` e dell'hook `use-identity` (relazioni già caricate); nuova query per gli inviti in attesa e per le aziende invitabili (`available_buyers`, `available_suppliers`).
- `vendite_.clienti.tsx` perde le sezioni "Collegamenti" e "Aziende che acquistano"; `acquisti.fornitori.tsx` diventa un rimando. Nessuna migration in questo intervento.

## 5. Cosa contiene realmente l'export clienti Danea sul listino

Verificato sul file soggetti reale (`Soggetti_prova1.ods`): l'intestazione contiene anche **Sconti**, **Listino**, **Fido**, **Agente**, **Pagamento**, **Banca**, oltre alle colonne già usate.

Valori realmente presenti nelle righe di esempio:
- `3 EMME ROMA SRL` → Listino: `Listino 13`
- `3 T S.R.L.` → Listino: `BAR`, Pagamento: `Contanti`
- `A.F.SNC` → nessun listino indicato

Quindi Danea trasmette il **nome del listino assegnato al cliente**, non il numero e non i prezzi. Il nome può essere sia la forma standard "Listino N" sia un nome personalizzato ("BAR"). La colonna **Sconti** esiste ma nei dati di esempio è vuota: non ne assumo il formato finché non vedo un file che la valorizza.

## 6. Proposta Cliente → Listino → Destinazione

- Il cliente d'anagrafica ottiene un riferimento al listino Danea già ricevuto (`danea_price_lists`, che ha già numero, nome Danea e nome visualizzato) più il testo originale letto dal file, conservato per tracciabilità.
- L'importazione legge la colonna Listino e la abbina così: nome Danea identico → listino trovato; forma "Listino N" → listino con quel numero; nessuna corrispondenza → il cliente viene comunque importato e il listino resta da assegnare, segnalato nell'anteprima. Nessuna invenzione di listini.
- Danea resta l'origine: se il file assegna un listino, quello prevale; l'assegnazione manuale in Trevi Fruit sceglie solo tra i listini Danea già ricevuti.
- La destinazione **eredita** il listino del cliente. Predispongo un campo di override sulla destinazione, vuoto per definizione: se valorizzato vale per quella destinazione, altrimenti si usa quello del cliente.
- Il prezzo base continua ad arrivare dai listini Danea già ricevuti (`product_prices`): nessun secondo catalogo prezzi, nessun prezzo scritto a mano.
- Sconti e condizioni commerciali restano fuori dal 5c fino a un file Danea che li mostri valorizzati.

Questa parte è solo progetto: la implemento nel Punto 5c, dopo la tua conferma.
