# Punto 3 — Unità di misura Trevi Fruit

## Analisi dell’esistente

- Il prodotto resta una sola riga in `products`, identificata nel proprio archivio Danea. `danea_um` è il valore originale ricevuto e viene aggiornato dal motore Danea sia negli invii FULL sia negli INCREMENTAL.
- I prezzi sono già separati in `product_prices`, uno per listino Danea 1–9. Non esiste e non verrà creato un prezzo Trevi Fruit per U.M.
- Oggi non esistono tabelle U.M. Trevi Fruit. I dati reali presenti sono 4 prodotti, con U.M. Danea `kg` e `pz`.
- La griglia del Punto 2 dispone già di selezione globale, azioni sui selezionati e dettaglio laterale/a tutto schermo: saranno estesi senza cambiare importazione, archivi o identità prodotto.

## Modello dati proposto

### `units_of_measure`
Anagrafica U.M. dell’azienda:

- `id uuid` PK
- `company_id uuid` NOT NULL → `companies.id`
- `code text` NOT NULL — sigla mostrata (`kg`, `cs`, `pz`)
- `description text` NOT NULL
- `status entity_status` NOT NULL, default `attivo`
- `created_by uuid`, `created_at`, `updated_at`

Vincoli e indici:

- codice normalizzato con `btrim`; lunghezza massima definita lato server;
- indice unico case-insensitive `(company_id, lower(code))`;
- indice `(company_id, status, code)`;
- nessuna cancellazione a cascata.

### `product_sale_units`
Associa più modalità di vendita allo stesso prodotto:

- `id uuid` PK
- `company_id uuid` NOT NULL
- `product_id uuid` NOT NULL → `products.id`
- `unit_id uuid` NOT NULL → `units_of_measure.id`
- `is_active boolean` NOT NULL default `true`
- `is_customer_visible boolean` NOT NULL default `true`
- `is_default boolean` NOT NULL default `false`
- `conversion_factor numeric(18,6)` NULL
- `conversion_reference_um text` NULL — fotografia della U.M. Danea alla quale era riferita la stima
- `needs_review boolean` NOT NULL default `false`
- `created_by`, `updated_by`, `created_at`, `updated_at`

Significato: `conversion_factor = 15` e riferimento `kg` significa esclusivamente “1 U.M. vendita ≈ 15 kg”. Il fattore resta facoltativo e sempre stimato; non sarà presente alcun `conversion_kind`.

Vincoli e indici:

- UNIQUE `(product_id, unit_id)`;
- un solo default per prodotto tramite indice unico parziale `WHERE is_default`;
- zero associazioni sono ammesse; quando esiste almeno una U.M. attiva, le funzioni di scrittura garantiscono esattamente una predefinita;
- `conversion_factor > 0` quando presente;
- la predefinita deve essere attiva e visibile al cliente; la coerenza azienda di prodotto e U.M. sarà verificata da trigger `SECURITY DEFINER SET search_path = public`;
- FK senza CASCADE distruttivi; una U.M. usata non può essere eliminata.

### `customer_product_unit_preferences`
Predisposizione futura, non ancora usata da Ordina:

- `id uuid` PK
- `seller_company_id uuid` NOT NULL
- `buyer_company_id uuid` NOT NULL
- `product_id uuid` NOT NULL
- `product_sale_unit_id uuid` NOT NULL
- `created_by`, `created_at`, `updated_at`
- UNIQUE `(seller_company_id, buyer_company_id, product_id)`

Un trigger verifica: rapporto commerciale attivo, prodotto del venditore, U.M. appartenente a quel prodotto. La preferenza è valida in lettura solo se U.M., associazione e rapporto sono ancora attivi; altrimenti Ordina userà in futuro la predefinita generale senza cancellare lo storico.

## Autorizzazioni e RLS

- Tutte le nuove tabelle avranno `GRANT` espliciti, RLS attiva e nessun accesso anonimo.
- `units_of_measure`: membri dell’azienda leggono; solo amministratori inseriscono, modificano, disattivano o eliminano.
- `product_sale_units`: membri dell’azienda leggono; solo amministratori scrivono in questa fase.
- `customer_product_unit_preferences`: membri del venditore leggono; in futuro il cliente collegato potrà leggere/scrivere solo la propria preferenza verso un prodotto visibile e una U.M. attiva/visibile. In questo Punto 3 non ci saranno UI né uso in Ordina.
- `company_id` non sarà considerato attendibile dal browser: le funzioni server verificheranno appartenenza/ruolo tramite identità autenticata e ricaveranno prodotto/U.M./azienda dal database.
- Le operazioni singole e multiple passeranno da funzioni server autenticate, con validazione, transazione database e registrazione in `audit_events`.

## Anagrafica U.M. aziendale

La collocazione principale sarà **Azienda → Unità di misura**, perché è un’impostazione aziendale riutilizzabile. Nella pagina Prodotti, “Gestisci U.M. vendita” offrirà anche un collegamento rapido alla stessa anagrafica in dialog, senza duplicare la logica.

Interfaccia compatta:

- elenco Sigla, Descrizione, Stato, Numero prodotti associati;
- crea e modifica con dialog;
- attiva/disattiva senza perdere associazioni;
- “Elimina” disponibile solo quando non è mai stata associata né usata da una preferenza; altrimenti viene proposta “Disattiva”;
- descrizione modificabile; sigla modificabile solo finché la U.M. non è mai stata associata. Se è già usata, si disattiva la vecchia e se ne crea una nuova, preservando il significato storico.

Nessun elenco iniziale inventato verrà inserito automaticamente: l’amministratore crea solo le U.M. realmente usate. Potremo valutare in implementazione un’azione esplicita “Aggiungi U.M. Danea” precompilata, mai automatica.

## Dettaglio del prodotto

Il pannello manterrà due sezioni nette:

1. **DATI DANEA — sola lettura**: inclusa `U.M. Danea`.
2. **IMPOSTAZIONI TREVI FRUIT — modificabili**: tabella U.M. vendita con sigla, cliente sì/no, predefinita, conversione stimata e stato.

Azioni amministratore: aggiungi, modifica, attiva/disattiva, cambia visibilità, imposta come predefinita, rimuovi l’associazione se non referenziata. Gli altri membri vedono la configurazione senza modificarla.

La conversione verrà mostrata come `≈ 15 kg`, mai come equivalenza esatta. Se manca: `—`, ma l’U.M. resta utilizzabile. Se richiede revisione: avviso evidente “U.M. Danea cambiata: verifica la stima”.

## Modifica multipla dalla griglia

Quando sono selezionati prodotti compare **Gestisci U.M. vendita**. La selezione continua a includere tutti i risultati filtrati, anche oltre la pagina visibile.

Dialog in tre passaggi:

1. scegliere U.M. e operazione;
2. mostrare anteprima con numero prodotti interessati, invariati e conflitti;
3. confermare esplicitamente.

Operazioni separate e non ambigue:

- **Aggiungi se assente** — non modifica configurazioni esistenti;
- **Rendi visibile / Nascondi** — modifica solo quel campo sulle associazioni esistenti;
- **Attiva / Disattiva** — modifica solo lo stato;
- **Imposta conversione stimata** — scelta esplicita tra “solo associazioni senza fattore” e “sovrascrivi anche i fattori esistenti”, con secondo avviso per la sovrascrittura;
- **Imposta predefinita** — consentita solo scegliendo una singola U.M.; sostituisce il default dei prodotti selezionati in una transazione e mostra quanti default cambieranno;
- **Rimuovi associazione** — solo se non è mai stata usata né referenziata; altrimenti è disponibile soltanto la disattivazione, così resta la memoria storica.

Nessuna operazione di massa toccherà `danea_um`, prezzi, descrizioni o altri dati Danea.

## Conversioni e prezzi

- Nessun fattore viene inventato o derivato automaticamente.
- La U.M. Danea può essere associata anche senza fattore: per esempio `kg` su prodotto Danea `kg` può essere usata come riferimento naturale; non salveremo obbligatoriamente `1`.
- Una U.M. senza conversione resta consentita; semplicemente non permette una stima economica convertita.
- In futuro la stima sarà calcolata al momento: `prezzo del listino Danea del cliente × conversion_factor`.
- Il risultato sarà sempre presentato come “circa”; non verrà salvato come prezzo autonomo della cassa e non sarà quantità fiscale o preparata.
- Listini diversi producono stime diverse usando lo stesso fattore. Il Punto 3 non implementa assegnazione listino cliente né motore ordini.

## Cambio della U.M. originale Danea

Prima dell’upsert, il motore confronterà la nuova `danea_um` con quella già salvata per lo stesso prodotto/archivio.

Se cambia:

1. Danea resta master: la nuova `danea_um` viene comunque salvata;
2. le U.M. Trevi Fruit non vengono cancellate o riscritte;
3. tutte le associazioni con `conversion_factor` vengono marcate `needs_review = true`;
4. viene registrata una segnalazione nello stesso storico dell’invio Danea, con prodotto, vecchia U.M. e nuova U.M.;
5. la pagina Prodotti mostra un avviso/filtro “Conversioni da verificare”;
6. l’amministratore può confermare il fattore, modificarlo o rimuoverlo; la conferma aggiorna `conversion_reference_um` e toglie l’avviso.

Le U.M. senza fattore non vengono bloccate: il cambio viene segnalato a livello prodotto, ma non si inventano correzioni. L’importazione non fallisce e la risposta valida a Danea resta `OK`.

## Persistenza negli invii Danea

FULL e INCREMENTAL continueranno a scrivere solo `products`, prezzi, costi e dati di sincronizzazione. Le tre nuove tabelle non entreranno nell’upsert Danea e quindi sopravvivranno a:

- aggiornamento descrizione, categoria, prezzi o U.M. Danea;
- depubblicazione per assenza in un FULL;
- riapparizione successiva del prodotto;
- importazione manuale e collegamento diretto.

Poiché le associazioni usano `product_id`, due codici uguali in archivi differenti restano prodotti distinti e possono avere U.M. diverse. Nessuna modifica alla logica Archivi Danea.

## Desktop, tablet e smartphone

- **Desktop:** gestione nel pannello laterale del prodotto; barra azioni multipla sopra la griglia; dialog ampio con anteprima tabellare.
- **Tablet:** pannello più largo e azioni impilate; stessa anteprima con colonne essenziali.
- **Smartphone:** dettaglio a tutto schermo; ogni U.M. come riga touch con menu azioni; modifica multipla a passaggi, riepilogo prima della conferma.
- La griglia resta compatta; si aggiungeranno colonne opzionali “U.M. vendita”, “U.M. predefinita” e “Conversioni da verificare”, non visibili di default.

## Migrazione sicura

1. Creare le tre tabelle nell’ordine: anagrafica → associazioni prodotto → preferenze cliente, ciascuna con GRANT, RLS, policy, indici e trigger nello stesso intervento.
2. Non modificare né riscrivere i 4 prodotti attuali, `danea_um`, archivi, listini o postazioni.
3. Nessun backfill automatico delle U.M.: evita di trasformare sigle Danea non normalizzate in configurazioni operative senza decisione dell’amministratore.
4. Aggiungere funzioni server per CRUD anagrafica, configurazione singola e batch; operazioni atomiche e audit.
5. Estendere il confronto dell’import Danea solo per rilevare il cambio U.M. e marcare le stime da verificare; identità, FULL/INCREMENTAL e risposta endpoint restano invariati.
6. Estendere infine griglia e dettaglio; nessun dato operativo viene scritto nella tabella `products`.

## Piano test

### Database e sicurezza
- isolamento completo tra due aziende;
- membro legge, amministratore scrive, operatore/trasportatore non modificano;
- impossibile associare U.M. o prodotto di un’altra azienda;
- unicità sigla per azienda e singolo default per prodotto;
- fattore nullo accettato, zero/negativo rifiutato;
- eliminazione U.M. mai usata riuscita; usata rifiutata; disattivazione riuscita;
- preferenza cliente rifiutata senza rapporto attivo o con U.M. di altro prodotto.

### Configurazione singola
- zero, una e più U.M. sullo stesso prodotto senza duplicarlo;
- attiva/visibile/default indipendenti;
- cambio default atomico;
- conversione mostrata sempre con `≈`; U.M. senza conversione utilizzabile;
- dati Danea non modificabili dalla UI.

### Modifica multipla
- aggiunta su tutti i risultati filtrati, non solo sulla pagina visibile;
- modalità “aggiungi se assente” preserva configurazioni esistenti;
- visibilità/stato modificano un solo campo;
- fattore non sovrascritto senza scelta esplicita;
- default unico su tutti i prodotti selezionati;
- anteprima, conferma, errori parziali e audit.

### Importazioni
- FULL e INCREMENTAL conservano U.M., fattori, default e preferenze;
- import manuale e diretto hanno lo stesso comportamento;
- FULL di un archivio non tocca configurazioni dell’altro;
- cambio `kg → pz`: prodotto aggiornato, stime preservate ma marcate da verificare, segnalazione visibile, import completato e risposta `OK`;
- nessun cambio U.M.: nessuna falsa segnalazione.

### Interfaccia
- desktop, tablet e smartphone;
- pannello singolo e dialog multiplo;
- colonne opzionali e preferenze griglia già esistenti;
- accessibilità da tastiera, focus, testi lunghi e almeno centinaia di prodotti selezionati.

## Fuori ambito confermato

Inventario, carichi/scarichi, giacenze, Ordina, preparazione, quantità effettive, documenti fiscali, ritorno ordini a Danea, conversioni automatiche dagli acquisti e prezzi autonomi Trevi Fruit per U.M.
