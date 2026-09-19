# Prodotto ↔ Fornitori

Un prodotto potrà avere più fornitori, ognuno preso dall'anagrafica fornitori di Trevi Fruit. Quello che arriva da Danea resta una fonte separata e non cancella mai le nostre scelte.

Verificato nel lettore del file prodotti Danea: arrivano solo codice fornitore, nome fornitore, codice articolo presso il fornitore, note fornitore e costo netto/lordo. **La partita IVA del fornitore non è presente**, quindi non viene usata per nessun abbinamento automatico.

## Schema database

Nuova tabella `product_supplier_links` (una riga = un fornitore per quel prodotto). Contiene solo le condizioni nostre, nessuna copia dei dati Danea:

- `id`, `company_id`, `product_id`, `supplier_record_id`
- `supplier_product_code` — codice articolo presso il fornitore (nostro, modificabile)
- `purchase_unit_id` → `units_of_measure`, facoltativo
- `conversion_factor` (positivo) e `conversion_reference_um` — solo se inseriti dall'utente, mai dedotti
- `manual_cost`, `manual_cost_at` — il nostro costo concordato, unico costo memorizzato qui
- `min_quantity`, `lead_time_days`
- `is_preferred`, `is_active`, `notes`
- `origin` (`manuale` / `danea`), `created_by`, `created_at`, `updated_at`

Nessun `last_cost`, `danea_last_net_cost`, `danea_last_gross_cost` né `average_cost`: il costo Danea si legge dalla sua fonte e il costo medio arriverà quando esisterà lo storico acquisti.

Regole a livello di database:
- unico `(product_id, supplier_record_id)`: la stessa coppia non può esistere due volte
- indice unico parziale su `(product_id)` dove `is_preferred` è vero: al massimo un preferito per prodotto, nessuno obbligatorio
- trigger di coerenza: prodotto e fornitore della stessa azienda; l'archivio del fornitore deve coincidere con quello del prodotto **oppure** essere vuoto (fornitore creato a mano). Mai un fornitore dell'Archivio B su un prodotto dell'Archivio A
- trigger di conversione: fattore maggiore di zero e U.M. di riferimento indicata
- accesso consentito solo ai membri dell'azienda; scrittura solo tramite funzioni server agli amministratori

Coda di riconciliazione `product_danea_supplier_matches`: tabella di decisione, non una copia del dato Danea.

- `id`, `company_id`, `product_id`
- `danea_supplier_code`, `danea_supplier_name` — solo la chiave con cui riconosciamo di quale fornitore Danea stiamo parlando (serve anche come storico se il gestionale poi cambia fornitore)
- `status`: `da_associare` / `associato` / `ignorato`
- `supplier_record_id` risolto, `decided_by`, `decided_at`, `created_at`, `updated_at`
- unico `(product_id, danea_supplier_code, danea_supplier_name)`

Costo, codice articolo e note Danea restano dove sono già: `product_supplier_costs`, letta al volo insieme alla coda.

`product_supplier_costs` non viene modificata: resta la fotografia dell'ultimo dato grezzo del gestionale. I vecchi campi fornitore su `products` restano visibili nella griglia come dato Danea.

## Funzioni server (RPC)

Tutte con controllo unico: utente amministratore dell'azienda, prodotto dell'azienda, fornitore dell'azienda, archivio compatibile. Il controllo sul prodotto è obbligatorio e verificato nella stessa funzione del controllo fornitore — è l'errore che vogliamo evitare.

- `manage_product_supplier_link(azione: create | update | activate | deactivate | delete_link, …)`
- `set_preferred_product_supplier(product_id, supplier_record_id | null)` — azzera il precedente e imposta il nuovo in una sola operazione atomica
- `set_product_supplier_purchase_unit(link_id, unit_id, fattore, um_riferimento)`
- `resolve_danea_supplier_match(match_id, azione: link_existing | create_supplier | ignore, …)` — quando crea l'anagrafica usa nome e codice Danea e l'archivio del prodotto
- `product_supplier_overview(product_id)` — elenco compatto per la scheda prodotto: condizioni nostre, ultimo costo Danea letto dalla sua fonte, stato del collegamento Trevi Fruit del fornitore

## Comportamento dell'import Danea

L'import prodotti continua a scrivere `products` e `product_supplier_costs` come oggi. In più, senza toccare nulla di nostro:

1. abbinamento sicuro solo per codice: stesso archivio del prodotto **e** codice fornitore Danea uguale a `internal_reference` della scheda fornitore. Nessun altro criterio automatico.
2. il nome fornitore non produce mai da solo un'associazione.
3. abbinamento riuscito → crea l'associazione se manca (origine `danea`) e segna la coda come `associato`. Non tocca preferito, U.M., conversione, costo manuale, quantità minima, tempi, note, né gli altri fornitori del prodotto.
4. codice assente o senza corrispondenza certa → voce "Fornitore Danea da associare" nella coda. Nessuna associazione creata.
5. un'associazione creata a mano non viene mai disattivata o cancellata da un import.

## Costi e provenienza

Due valori, sempre distinguibili perché stanno in due posti diversi: l'ultimo costo ricevuto da Danea (in `product_supplier_costs`, con la sua data) e il costo concordato da noi (nell'associazione, con la sua data). La scheda prodotto li mostra entrambi con provenienza e data, o solo quello disponibile. In questa fase nessuna regola automatica decide quale dei due "vale": la priorità si definirà nella fase Acquisti. Il costo medio si aggiungerà quando avremo lo storico acquisti.

## Unità di misura d'acquisto

Danea non trasmette l'U.M. del fornitore, quindi non viene mai dedotta. L'U.M. d'acquisto e l'eventuale conversione (per esempio 1 cs ≈ 15 kg) si impostano a mano, con lo stesso criterio già usato per le U.M. di vendita: fattore positivo, U.M. di riferimento esplicita, valore stimato dichiarato dall'utente.

## Interfaccia

Nella scheda prodotto una nuova sezione **Fornitori**, compatta come le altre griglie: fornitore, codice presso il fornitore, U.M. d'acquisto, costo con provenienza, quantità minima, tempi, preferito (stella), stato e indicatore del collegamento Trevi Fruit. Da qui: aggiungi fornitore, modifica, disattiva/riattiva, scegli il preferito.

Sopra l'elenco, quando esiste, un avviso "Fornitore Danea da associare" con nome, codice e costo ricevuto, e le tre scelte: collega a un fornitore esistente, crea la scheda fornitore, ignora.

Il percorso inverso (scheda fornitore → prodotti forniti) arriva subito dopo, come sola lettura sugli stessi dati: nessuna struttura aggiuntiva.

## I 14 prodotti già presenti

Nessun dato viene perso. Nella migrazione, per ogni riga di `product_supplier_costs` esistente proviamo l'abbinamento per archivio + codice: oggi l'anagrafica fornitori è vuota e i codici fornitore sui prodotti non sono valorizzati, quindi non nasce nessuna associazione forzata e la coda resta vuota. Le righe Danea restano intatte e verranno riconciliate al primo import successivo o a mano.

## Verifiche previste

- doppia associazione dello stesso fornitore sullo stesso prodotto: rifiutata
- due preferiti sullo stesso prodotto: rifiutati; cambio del preferito: il precedente si azzera nella stessa operazione
- fornitore di un altro archivio: rifiutato; fornitore manuale senza archivio: accettato
- fornitore o prodotto di un'altra azienda: rifiutato, anche mescolando i due
- utente non amministratore: nessuna scrittura
- import Danea ripetuto: costo Danea aggiornato nella sua tabella, condizioni nostre e altri fornitori invariati
- fornitore Danea con codice corrispondente: associato da solo; con solo il nome: finisce nella coda
- le tre azioni della coda (collega, crea, ignora) funzionano
- conversione con fattore zero o negativo: rifiutata
- scheda prodotto su telefono e desktop: sezione leggibile, senza scorrimento orizzontale

## Fuori da questa fase

Ripartizione quantità, Lista Spesa, ordine fornitore, invio B2B, scarico in Danea, calcolo del fabbisogno.
