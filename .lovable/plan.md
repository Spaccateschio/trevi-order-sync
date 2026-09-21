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

**Priorità di approvvigionamento.** Il singolo `is_preferred` viene sostituito da una priorità numerica facoltativa per riga (1, 2, 3…, oppure nessuna). Nessun obbligo: chi decide giorno per giorno su prezzo e qualità lascia tutto senza priorità. Ordinamento in lista: priorità indicata prima (crescente), poi le fonti senza priorità. Il preferito attuale diventa priorità 1, così nulla si perde.

**Disponibilità commerciale.** Nuovo stato del prodotto verso i clienti, **indipendente dai fornitori**: disponibile · temporaneamente non disponibile · su ordinazione · non vendibile. Lo decide l'azienda, non il numero di fornitori attivi: spegnere tutte le fonti non cambia la vetrina. Il catalogo del cliente mostra sempre il prodotto pubblicato e in vetrina, con l'etichetta dello stato; solo "disponibile" e "su ordinazione" saranno ordinabili quando arriveranno gli ordini clienti. Nessun calcolo automatico dello stato in questa fase.

## 3. Dettagli tecnici della proposta (da approvare, non ancora applicati)

- `product_supplier_links`: eliminare l'indice unico `(product_id, supplier_record_id)`; nuovo indice unico parziale su `(product_id, supplier_record_id, supplier_product_code)` solo quando il codice è valorizzato; aggiungere `supplier_reference_label text` e `sourcing_priority smallint` nullable; sostituire l'indice `one_preferred` con un unico indice su `(product_id, sourcing_priority)` quando la priorità è valorizzata (una sola fonte per livello di priorità). `is_preferred` resta per compatibilità, allineato a priorità 1, e verrà rimosso in una fase successiva.
- `products`: nuova colonna di disponibilità commerciale (enum dedicato, default disponibile), indipendente da `publish_status` e `b2b_visible`.
- RPC: `manage_product_supplier_link` accetta descrizione referenza e priorità e applica la nuova deduplica; nuova azione per impostare/azzerare la priorità; `add_catalog_product_to_own_products` riusa la stessa deduplica; nuova azione per cambiare la disponibilità commerciale del prodotto. Tutte SECURITY DEFINER con `search_path = public` e controllo amministratore.
- Interfaccia: nella scheda prodotto le fonti diventano un elenco ordinabile con priorità facoltativa, codice e descrizione del fornitore, confezione/U.M. e costo; nella scheda prodotto un selettore di disponibilità commerciale; nel catalogo del cliente l'etichetta dello stato.
- Invariati: Danea, formule di giacenza e fabbisogno, inventario (una riga per prodotto qualunque sia il numero di fonti), lista della spesa e ordini, listini, immagini, permessi, route e layout approvati.

## 4. Da chiarire prima di procedere

1. La priorità è per prodotto (una sola scala 1,2,3… fra tutte le fonti, come negli esempi) — confermi?
2. La disponibilità commerciale la imposti a mano sul prodotto, senza alcun automatismo legato ai fornitori o alla giacenza — confermi?
3. Gli stati "su ordinazione" e "temporaneamente non disponibile" per ora sono solo etichette informative nel catalogo: il blocco dell'ordine arriverà con gli ordini clienti — va bene?
