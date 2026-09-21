# Piano tecnico — Prodotto commerciale, referenze fornitore, disponibilità

Nessuna modifica al database in questa fase: solo analisi e proposta. FASE A, B, C e D restano intatte.

## 1. Cosa c'è oggi (verificato sul database)

**Prodotto commerciale — `products`**
Il prodotto è già un'entità autonoma dell'azienda: codice, descrizione, categoria/sottocategoria, U.M., barcode, produttore, immagine, unità di vendita, listini, `publish_status` (pubblicato / non pubblicato), `b2b_visible` (in vetrina verso i clienti collegati), `origin` (danea / interno) e `is_managed`. Nessun campo lega il prodotto all'esistenza di un fornitore: disattivando tutti i fornitori il prodotto **oggi non sparisce già adesso**, né dal catalogo né dall'inventario. Questo punto è già corretto.

**Referenze d'acquisto — `product_supplier_links`**
Ogni riga rappresenta la referenza di un fornitore: codice articolo del fornitore, U.M. d'acquisto, fattore di conversione, costo manuale, quantità minima, giorni di consegna, note, attiva/disattiva, `is_preferred`.

**Due limiti reali, trovati durante i test**
1. Esiste un indice unico non documentato `product_supplier_links_unique (product_id, supplier_record_id)`: **un solo fornitore può comparire una sola volta per prodotto**, quindi 0255 e 0832 dello stesso fornitore non convivono. (La verifica precedente guardava solo i vincoli dichiarati e non gli indici: correzione mia.)
2. Esiste `product_supplier_links_one_preferred (product_id) WHERE is_preferred`: un solo "preferito" booleano, senza ordine fra le altre fonti.

**Danea**
L'importazione lavora ora esclusivamente sui prodotti `origin = 'danea'` e non tocca i prodotti interni nemmeno a codice uguale. Non produce né cancella referenze fornitore dei prodotti interni. Nessuna modifica prevista.

**Lista della spesa**
`shopping_list_item_suppliers` punta già alla singola referenza (`product_supplier_links`), quindi la scelta della fonte per riga è già modellata: serve solo mostrare più fonti confrontabili.

## 2. Separazione proposta

Tre concetti distinti, nessuna fusione automatica:

```text
PRODOTTO COMMERCIALE        →  REFERENZE D'ACQUISTO            →  DISPONIBILITÀ
(cosa vede e ordina         (come lo compro: fornitore,        (se e come è
 il cliente)                 codice, confezione, costo)         ordinabile oggi)
PATATE BIANCHE                 A · 0255 · kg · 0,72              Disponibile
                               B · 0832 · sacco 10 kg · 0,76
                               C · PAT-BIA-10 · 15 kg · 0,69
                               D · 458 · kg · 0,81
PATATE BIANCHE FRANCIA         (prodotto separato, proprie referenze)
```

**Prodotto commerciale.** Resta `products`. Nessun raggruppamento e nessuna unione automatica per descrizione o codice: varianti come ITALIA/FRANCIA, ROSSE, NOVELLE, DA FRITTURA restano prodotti distinti perché sono scelte commerciali. L'unione avviene solo per decisione esplicita, collegando la referenza a un prodotto esistente.

**Referenza del fornitore.** Resta `product_supplier_links`, ma diventa realmente "una referenza per riga": si rimuove l'indice unico su (prodotto, fornitore) e si aggiunge una descrizione della referenza del fornitore (il testo con cui il fornitore la chiama), così le quattro fonti delle patate convivono e restano riconoscibili. L'unico duplicato impedito è la referenza identica: stesso prodotto + stesso fornitore + stesso codice articolo; con codice vuoto il confronto avviene sulla descrizione della referenza e, se anche quella è vuota, si riusa la riga senza codice già presente — nessun codice inventato, nessun nuovo collegamento a ogni salvataggio.

**Priorità di approvvigionamento.** Il singolo `is_preferred` viene sostituito da una priorità numerica **facoltativa e non esclusiva** per riga: due fonti equivalenti possono avere entrambe priorità 1, altre possono non averne nessuna. È un'indicazione, non un vincolo: nessun indice unico sulla priorità. Ordinamento in elenco: priorità indicata prima (crescente), a pari priorità per costo e fornitore, poi le fonti senza priorità. Il preferito attuale diventa priorità 1, così nulla si perde. La scelta concreta resta della Lista della Spesa, in base a costo, disponibilità, confezione e quantità.

**Disponibilità commerciale.** Tre concetti separati, senza sovrapposizioni:

| Campo | Decide |
| --- | --- |
| `publish_status` | se il prodotto è pubblicato |
| `b2b_visible` | se il cliente lo vede |
| `commercial_availability` | se e come il cliente può ordinarlo |

Stati di `commercial_availability`, con semantica fissata già ora:

- `available` — visibile e ordinabile;
- `on_order` — visibile e ordinabile, presentato come "Su ordinazione";
- `temporarily_unavailable` — visibile ma **non** ordinabile.

Nessuno stato "non vendibile": quel caso è già coperto da `publish_status` e `b2b_visible`. Lo stato è **manuale** e non cambia mai automaticamente per giacenza, fabbisogno o numero di fornitori attivi: disattivando tutte le referenze fornitore il prodotto commerciale resta e il suo stato non si muove. Il futuro modulo ordini clienti dovrà rispettare questa semantica senza ulteriori modifiche al database.

## 3. Dettagli tecnici della proposta (da approvare, non ancora applicati)

- `product_supplier_links`: eliminare l'indice unico `(product_id, supplier_record_id)`; nuovo indice unico parziale su `(product_id, supplier_record_id, supplier_product_code)` **solo quando il codice è valorizzato**; aggiungere `supplier_reference_label text` e `sourcing_priority smallint` nullable; eliminare l'indice `one_preferred` **senza sostituirlo**: nessun vincolo di unicità sulla priorità, più fonti possono condividere lo stesso livello. Semplice indice non unico su `(product_id, sourcing_priority)` per l'ordinamento. `is_preferred` resta per compatibilità, allineato a priorità 1, e verrà rimosso in una fase successiva.
- Deduplica sicura, senza inventare codici: con codice articolo valorizzato la chiave è prodotto + fornitore + codice; con codice vuoto si confronta la descrizione della referenza; se anche quella è vuota si riusa l'unica riga senza codice di quel fornitore. Ripetere l'azione non crea righe nuove e il codice può essere inserito o modificato in seguito.
- `products`: nuova colonna `commercial_availability` (enum dedicato: `available`, `on_order`, `temporarily_unavailable`; default `available`), indipendente da `publish_status` e `b2b_visible`, senza trigger o automatismi.
- RPC: `manage_product_supplier_link` accetta descrizione referenza e priorità e applica la nuova deduplica; nuova azione per impostare/azzerare la priorità; `add_catalog_product_to_own_products` riusa la stessa deduplica; nuova azione per cambiare la disponibilità commerciale del prodotto. Tutte SECURITY DEFINER con `search_path = public` e controllo amministratore.
- Interfaccia: nella scheda prodotto le fonti diventano un elenco con priorità facoltativa e ripetibile, codice e descrizione del fornitore, confezione/U.M. e costo; selettore di disponibilità commerciale nella scheda prodotto; etichetta dello stato nel catalogo del cliente, con gli articoli "temporaneamente non disponibili" visibili e già marcati come non ordinabili.
- Invariati: FASE A, B, C e D; Danea; formule di giacenza e fabbisogno; inventario, che continua a lavorare sul prodotto commerciale con **una sola riga per prodotto** qualunque sia il numero di fonti; Lista della Spesa, che continua a lavorare sulla singola referenza `product_supplier_links`; ordini, ricevute, lotti, listini, immagini, permessi, route e layout approvati.

## 4. Test previsti dopo l'approvazione

Prodotto commerciale con tre referenze (stesso fornitore con due codici diversi + un secondo fornitore) e una sola riga di inventario; due fonti con la stessa priorità 1 e una senza priorità; referenza senza codice articolo ripetuta due volte senza duplicati; disattivazione di tutte le referenze con prodotto e stato commerciale invariati; i tre stati di disponibilità nel catalogo del cliente; importazione Danea che non tocca prodotti interni, referenze e stati; nessuna regressione su fabbisogno, Lista della Spesa, ordini, ricevute e lotti. Dati di prova transazionali con annullamento.
