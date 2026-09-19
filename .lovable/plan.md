# Prodotto ↔ Fornitori

Un prodotto potrà avere più fornitori, ognuno preso dall'anagrafica fornitori di Trevi Fruit. Quello che arriva da Danea resta una fonte separata e non cancella mai le nostre scelte.

## Schema database

Nuova tabella `product_supplier_links` (una riga = un fornitore per quel prodotto):

- `id`, `company_id`, `product_id`, `supplier_record_id`
- `supplier_product_code` — codice articolo presso il fornitore
- `purchase_unit_id` → `units_of_measure`, facoltativo
- `conversion_factor` (positivo) e `conversion_reference_um` — solo se inseriti dall'utente, mai dedotti
- `last_cost`, `last_cost_source` (`danea` / `manuale`), `last_cost_at`
- `danea_last_net_cost`, `danea_last_gross_cost`, `danea_last_cost_at` — colonne distinte, così il costo Danea non sovrascrive mai un costo nostro
- `manual_cost`, `manual_cost_at`
- `average_cost` — predisposta, riempita più avanti quando esisterà lo storico
- `min_quantity`, `lead_time_days`
- `is_preferred`, `is_active`, `notes`
- `origin` (`manuale` / `danea`), `created_by`, `created_at`, `updated_at`

Regole a livello di database:
- unico `(product_id, supplier_record_id)`: la stessa coppia non può esistere due volte
- indice unico parziale su `(product_id)` dove `is_preferred` è vero: al massimo un preferito per prodotto, nessuno obbligatorio
- trigger di coerenza: prodotto e fornitore della stessa azienda; l'archivio del fornitore deve coincidere con quello del prodotto **oppure** essere vuoto (fornitore creato a mano). Mai un fornitore dell'Archivio B su un prodotto dell'Archivio A
- trigger di conversione: se c'è un fattore deve essere maggiore di zero e con U.M. di riferimento indicata
- accesso consentito solo ai membri dell'azienda; scrittura solo tramite funzioni server agli amministratori

Nuova tabella `product_danea_supplier_matches` — la coda dei "fornitori Danea da associare":

- `id`, `company_id`, `archive_id`, `product_id`
- `danea_supplier_code`, `danea_supplier_name`, `danea_supplier_product_code`
- `net_cost`, `gross_cost`, `received_at`
- `status`: `da_associare` / `associato` / `ignorato`
- `supplier_record_id` risolto, `decided_by`, `decided_at`
- unico `(product_id, danea_supplier_code, danea_supplier_name)`

`product_supplier_costs` resta com'è: fotografia dell'ultimo dato ricevuto da Danea. Nessuna colonna viene rimossa; i vecchi campi fornitore su `products` restano visibili nella griglia come dato del gestionale.

## Funzioni server (RPC)

Tutte con controllo unico: utente amministratore dell'azienda, prodotto dell'azienda, fornitore dell'azienda, archivio compatibile. Il controllo sul prodotto è obbligatorio e verificato nella stessa funzione del controllo fornitore — è l'errore che vogliamo evitare.

- `manage_product_supplier_link(azione: create | update | activate | deactivate | delete_link, …)`
- `set_preferred_product_supplier(product_id, supplier_record_id | null)` — azzera il precedente e imposta il nuovo in una sola operazione atomica
- `set_product_supplier_purchase_unit(link_id, unit_id, fattore, um_riferimento)`
- `resolve_danea_supplier_match(match_id, azione: link_existing | create_supplier | ignore, …)` — quando crea l'anagrafica usa i dati Danea e l'archivio del prodotto
- `product_supplier_overview(product_id)` — elenco compatto per la scheda prodotto, con stato del collegamento Trevi Fruit del fornitore

## Comportamento dell'import Danea

L'import prodotti continua a scrivere `products` e `product_supplier_costs` come oggi. In più, e senza toccare nulla di nostro:

1. se il file porta un fornitore, prova l'abbinamento **sicuro**: stesso archivio + codice fornitore Danea uguale a `internal_reference` della scheda fornitore. In alternativa, solo se la partita IVA è presente e normalizzata coincide.
2. abbinamento sicuro → crea l'associazione se manca (origine `danea`) e aggiorna solo le colonne del costo Danea. Non tocca preferito, U.M., quantità minima, tempi, note, costo manuale, né gli altri fornitori del prodotto.
3. abbinamento non sicuro → riga in `product_danea_supplier_matches` con stato "da associare". Nessuna associazione creata: nomi simili non bastano mai.
4. un'associazione creata a mano non viene mai disattivata o cancellata da un import.

## Costi e provenienza

Tre valori distinti e sempre riconoscibili: ultimo costo ricevuto da Danea, costo inserito da noi, e il costo "in evidenza" con l'indicazione della provenienza e della data. Il costo medio è predisposto ma resta vuoto finché non introdurremo lo storico.

## Unità di misura d'acquisto

Danea non trasmette l'U.M. del fornitore, quindi non viene mai dedotta. L'U.M. d'acquisto e l'eventuale conversione (per esempio 1 cs ≈ 15 kg) si impostano a mano, con lo stesso criterio già usato per le U.M. di vendita: fattore positivo, U.M. di riferimento esplicita, valore stimato dichiarato dall'utente.

## Interfaccia

Nella scheda prodotto una nuova sezione **Fornitori**, compatta come le altre griglie: fornitore, codice presso il fornitore, U.M. d'acquisto, ultimo costo con provenienza, quantità minima, tempi, preferito (stella), stato e indicatore del collegamento Trevi Fruit. Da qui: aggiungi fornitore, modifica, disattiva/riattiva, scegli il preferito.

Sopra l'elenco, quando esiste, un avviso "Fornitore Danea da associare" con le tre scelte: collega a un fornitore esistente, crea la scheda fornitore, ignora.

Il percorso inverso (scheda fornitore → prodotti forniti) conviene farlo subito dopo, come sola lettura sui dati di questa stessa tabella: nessuna struttura aggiuntiva, ed evitiamo di allungare questo passaggio.

## I 14 prodotti già presenti

Nessun dato viene perso. Nella migrazione, per ogni riga di `product_supplier_costs` esistente proviamo l'abbinamento sicuro con l'anagrafica fornitori: oggi l'anagrafica è vuota e i campi fornitore sui prodotti non sono valorizzati, quindi non nasce nessuna associazione forzata e non compare nessuna coda da associare. Le righe Danea restano intatte e verranno riconciliate al primo import successivo o a mano.

## Verifiche previste

- doppia associazione dello stesso fornitore sullo stesso prodotto: rifiutata
- due preferiti sullo stesso prodotto: rifiutati; cambio del preferito: il precedente si azzera nella stessa operazione
- fornitore di un altro archivio: rifiutato; fornitore manuale senza archivio: accettato
- fornitore o prodotto di un'altra azienda: rifiutato, anche mescolando i due
- utente non amministratore: nessuna scrittura
- import Danea ripetuto: costo Danea aggiornato, preferito/U.M./quantità/tempi/note e gli altri fornitori invariati
- fornitore Danea non riconosciuto: finisce nella coda, e le tre azioni (collega, crea, ignora) funzionano
- conversione con fattore zero o negativo: rifiutata
- scheda prodotto su telefono e desktop: sezione leggibile, senza scorrimento orizzontale

## Fuori da questa fase

Ripartizione quantità, Lista Spesa, ordine fornitore, invio B2B, scarico in Danea, calcolo del fabbisogno.
