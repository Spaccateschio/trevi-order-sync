# Inventario → Lista della Spesa → Notifiche (analisi e modello proposto)

Nessuna modifica a database o interfaccia: questo è solo il progetto del flusso.

## 1. Stato attuale Trevi Fruit

Non esiste ancora nulla di operativo:

- Inventario, giacenze, conteggio fisico, scorta minima di magazzino, fabbisogno: assenti (nessuna tabella, nessuna funzione, nessuna schermata).
- Lista della spesa, righe lista spesa, quantità da acquistare, collegamento riga↔fornitore: assenti. Compaiono solo come testo "In arrivo" nella pagina Acquisti e come voce nella roadmap.
- Notifiche, avvisi, centro notifiche: assenti. Esiste solo l'etichetta grafica riutilizzabile (nessun dato dietro).
- I dati del gestionale Danea **non portano nessuna giacenza**: arrivano anagrafica prodotti, unità di misura, listini, fornitore e costo. Nessuna quantità di magazzino.
- Unico concetto simile già presente: la "quantità minima" sull'associazione prodotto↔fornitore. È la quantità minima ordinabile da quel fornitore, **non** una scorta di magazzino: non va confusa né riusata.

### Già pronto e riutilizzabile

| Cosa | Riuso previsto |
| --- | --- |
| Prodotti, archivi Danea, anagrafica fornitori | base di ogni riga di inventario e di spesa |
| Associazioni prodotto↔fornitore (con preferito, costo concordato, U.M. d'acquisto, quantità minima, giorni di consegna) | proposta fornitori nella Lista Spesa |
| Costi Danea per prodotto/fornitore | costo mostrato accanto al costo concordato |
| Anagrafica unità di misura e unità di vendita | U.M. e conversioni di inventario e acquisto |
| Griglia configurabile con preferenze personali (colonne, ordinamento, stampa, esportazione) usata in Prodotti e Clienti | griglia Inventario e griglia Lista Spesa |
| Pannelli fornitori del prodotto e prodotti del fornitore | modello dell'editor riga con più fornitori |
| Regole di accesso per azienda e ruolo già in uso | protezione delle nuove tabelle |
| Registro eventi (audit) | tracciamento rettifiche e conferme |

## 2. Come funzionava Efficio

- **Inventario**: sessioni di conteggio (in corso / completata / annullata) con righe per prodotto: giacenza precedente, giacenza contata, differenza calcolata dal database, data del conteggio, U.M., autore della sessione. Liste predefinite (Frigo, Magazzino, Banco, Congelatore). La giacenza "buona" restava però anche come campo sul prodotto. Nessun legame con Danea.
- **Quantità da acquistare**: regola base "scorta minima meno giacenza", arrotondata a multipli d'ordine. Era però implementata in **tre posti diversi** (una funzione di database mai chiamata, un calcolo nel browser con media storica a 90 giorni, un terzo calcolo per l'elenco "sotto scorta") con risultati potenzialmente diversi.
- **Riga della Lista Spesa**: nasceva dal magazzino, manualmente o dal suggerimento sotto scorta. Le modifiche vivevano in una cache nel browser, salvate sul database ogni 2 minuti o a comando: rischio concreto di perdere il lavoro.
- **Scelta fornitore**: dal legame prodotto↔fornitore; se nessuno era scelto veniva proposto il preferito, altrimenti il primo per prezzo. Per i fornitori collegati B2B il prezzo era in sola lettura.
- **Ripartizione (FornitoriQuantitaDialog)**: elenco fornitori con prezzo, quantità e percentuale. Aggiungendo un fornitore la quantità veniva ridistribuita proporzionalmente; modificando una quantità la differenza veniva scaricata sul "primo" fornitore o sull'ultimo; conferma ammessa con tolleranza ±1%. Alla conferma la ripartizione restava in memoria; solo al salvataggio successivo nascevano **righe separate per fornitore** (stesso prodotto, fornitore diverso).
- **Notifiche**: una sola tabella generica, nata per gli avvisi amministrativi e poi riusata per decine di eventi diversi (scorta bassa, ordine ricevuto, arrivo merce atteso, pagamenti in scadenza, richieste di collegamento). Contatore non letto, aggiornamento in tempo reale. Un avviso era generato controllando ogni 30 minuti dal browser, con deduplica basata sul testo del messaggio.

### Da recuperare

1. Sessione di conteggio con giacenza precedente, contata e differenza.
2. Il concetto "necessario / disponibile / da acquistare" mostrato in chiaro.
3. Proposta del fornitore preferito, sempre modificabile.
4. Ripartizione su più fornitori con percentuali di aiuto.
5. Una riga per fornitore come risultato finale della ripartizione.
6. Contatore delle cose da sistemare e avvisi con collegamento diretto all'elemento.

### Da non copiare

1. Tre calcoli diversi della stessa quantità: una sola regola, in un solo punto.
2. Giacenza duplicata sul prodotto e nei conteggi: una sola fonte.
3. Lista Spesa salvata nel browser: scrittura diretta sul database.
4. Ridistribuzione automatica che modifica da sola i numeri già inseriti dall'utente.
5. Conferma con tolleranza ±1%: la somma deve quadrare, con eventuale residuo esplicito.
6. Tabella notifiche unica senza tipi controllati e con deduplica sul testo.
7. Doppio schema per gli ordini e riferimenti incrociati incoerenti.

## 3. Modello consigliato — Inventario

Il gestionale Danea resta il padrone di anagrafiche e documenti, ma **non** è la nostra giacenza operativa: non trasmette quantità. La giacenza operativa nasce quindi dal nostro conteggio fisico. Se in futuro Danea inviasse quantità, andranno tenute come dato informativo a parte, mai sovrascrivendo il conteggio.

- **Sessione di inventario**: azienda, archivio Danea, nome, stato (in corso / completata / annullata), inizio, fine, autore, note.
- **Riga di conteggio**: sessione, prodotto, quantità contata, U.M. usata, quantità precedente, differenza calcolata dal database, data e ora, utente che ha contato, note. Un solo conteggio per prodotto nella stessa sessione.
- **Parametri del prodotto** (nostri, non Danea): scorta minima, multiplo d'ordine, giorni di riordino, U.M. di riferimento per il magazzino.
- **Quantità necessaria**: in questa fase inserita a mano nella sessione o nella Lista Spesa; in futuro potrà arrivare dagli ordini clienti.
- **Fabbisogno**: sempre calcolato, mai memorizzato: `da acquistare = max(0, necessario − disponibile)`, con arrotondamento al multiplo d'ordine quando impostato.
- **Rettifiche**: non si modifica un conteggio chiuso; si registra una riga di rettifica con motivo, quantità e autore.
- La giacenza corrente di un prodotto è sempre l'ultimo conteggio valido più eventuali rettifiche: nessun campo "giacenza" sul prodotto.

## 4. Modello consigliato — Lista della Spesa

- **Lista** (intestazione): azienda, archivio, data, nome, stato (aperta / confermata / chiusa), autore, note. Una lista di lavoro aperta per archivio, più lo storico.
- **Riga prodotto**: lista, prodotto, quantità necessaria, quantità disponibile, quantità da acquistare, U.M., origine (manuale / da inventario), stato (da assegnare / assegnata / ordinata / annullata), note.
- **Assegnazione al fornitore**: righe figlie, una per fornitore, con fornitore, quantità, U.M. d'acquisto e conversione, costo mostrato (Danea e concordato, distinti, come già fatto nella scheda prodotto), stato. La somma delle quantità figlie non può superare la quantità da acquistare; l'eventuale residuo resta visibile.
- Il fornitore preferito viene proposto, mai imposto. Le percentuali sono un aiuto di lettura calcolato, non un dato salvato.
- Inserimento rapido: ricerca prodotto e quantità, oppure importazione in blocco dal fabbisogno di una sessione di inventario.
- Scritture sempre tramite operazioni protette lato server, come già fatto per prodotti e fornitori: nessun salvataggio differito nel browser.
- In questa fase la lista **non** genera nessun ordine al fornitore.

## 5. Modello consigliato — Notifiche

Tre livelli distinti:

1. **Contatori (badge)**: conteggi calcolati al volo, nessuna tabella. Esempi: prodotti sotto scorta, fornitori Danea da associare, collegamenti da confermare, righe senza fornitore.
2. **Avvisi operativi**: mostrati dentro la schermata interessata (riga senza fornitore, riga senza U.M. d'acquisto, quantità non ripartita del tutto). Nessuna notifica, solo segnalazione nel contesto.
3. **Notifiche vere**: una tabella con tipo controllato da elenco chiuso, azienda, destinatario o ruolo, riferimento all'elemento (tipo + identificativo, mai testo), messaggio, letto, data. Solo per eventi che richiedono attenzione anche fuori dalla schermata: ordine ricevuto, ordine modificato, ordine pronto, problema di consegna, collegamento B2B da confermare. Deduplica sul riferimento, non sul messaggio.

Prodotto sotto scorta e prodotto aggiunto alla lista restano contatori/avvisi, non notifiche.

## 6. Ordine di implementazione

1. Parametri del prodotto per il magazzino (scorta minima, multiplo d'ordine, giorni di riordino, U.M. di magazzino).
2. Inventario: sessioni, conteggi, rettifiche, griglia di conteggio con preferenze personali e stampa.
3. Vista fabbisogno (necessario / disponibile / da acquistare) come lettura calcolata.
4. Lista della Spesa: lista, righe, inserimento manuale e importazione dal fabbisogno.
5. Assegnazione fornitori con ripartizione e percentuali di aiuto, riusando le associazioni prodotto↔fornitore esistenti.
6. Contatori e avvisi operativi.
7. Tabella notifiche con tipi chiusi e centro notifiche.
8. Solo dopo: ordine al fornitore e invio B2B.

## Nota tecnica

Tabelle da creare: sessioni inventario, conteggi, rettifiche, parametri magazzino del prodotto (colonne su `products` o tabella dedicata per archivio), liste spesa, righe lista spesa, assegnazioni riga↔fornitore, notifiche. Tutte con accesso per membro dell'azienda, scritture tramite funzioni protette (`SECURITY DEFINER`, `search_path = public`) e permessi espliciti, come le tabelle già esistenti. Riuso diretto di `product_supplier_links`, `product_supplier_costs`, `units_of_measure`, `danea_archives`, `user_grid_preferences`, `audit_events` e degli helper `is_company_member` / `is_company_admin`.
