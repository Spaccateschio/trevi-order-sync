# Fase 2 — Scheda fornitore, conversioni e Inventario

## Punto di approvazione
Le decisioni del documento sono recepite. Questo piano presenta i conteggi reali e le protezioni prima di modificare dati o applicare migrazioni. Nessuna migrazione applicata finora; nessun dato operativo modificato.

Conferme già ricevute:
- CARCIOFI 1791 e CIPOLLE 0287: lasciare da configurare le conversioni incoerenti cassa→cassa 16/10, senza trasferirle.
- Costo Danea e stime solo per acquisti manuali. Listini B2B, ordini clienti e XML Danea invariati.

## Migrazioni previste e righe coinvolte
Conteggi letti il 28/10/2026; da ripetere immediatamente prima dell'applicazione. Il database è condiviso da anteprima e app pubblicata: le modifiche dati non sono isolate alla sola anteprima, anche senza pubblicazione. Mantenere compatibilità con l'app già online.

| Intervento | Righe esistenti da aggiornare | Protezioni |
|---|---:|---|
| 1. Salvataggio parziale della referenza | **0** | Nuovo comando aggiorna solo chiavi presenti e realmente modificate, distingue vuoto esplicito da campo assente. Identità da sessione, controllo amministratore e blocco della riga. Vecchia firma conservata per compatibilità. |
| 2. Prima U.M. derivata + eredità U.M. alla creazione | **0** allineamenti attuali | 171 collegamenti: 45 con U.M. attive già allineati, 126 senza U.M. Nessun popolamento retroattivo. Alla nuova creazione manuale ereditare U.M. prodotto e stella in una transazione. |
| 3. Trasferimento conversioni vecchie | **15 candidati**, non 15 trasferimenti automatici | 23 configurazioni nuove restano intatte. Dettaglio prudente sotto. Nessun fattore vecchio usato come ripiego dopo il cambio. |
| 4. Preavviso nel fornitore | **14 fornitori** | Nuova colonna necessaria: non esiste oggi. Moda da 38 collegamenti con valore; nessuna parità e nessun valore negativo. Altri **171 fornitori** rimangono senza valore. Calendario invariato. |
| 5. Rimozione minimo/priorità/prezzo manuale dagli usi operativi | **0** riscritture dei valori | Conservare valori vecchi: 38 collegamenti con minimo, 13 con priorità, 9 con costo manuale. Nessuna riscrittura di ordini, prezzi storici o carichi. |
| 6. Conteggio convertito con fotografia della confezione | **0** conteggi storici convertiti | Preservare **37 conteggi** e **68 eventi**. Adeguare scritture e letture per nuovi conteggi, aggiungere campi nullable per le fotografie mancanti. |

### Conversioni: cosa è sicuro trasferire e cosa no
I 15 candidati appartengono a 14 prodotti, in 2 aziende; nessuno è B2B o una U.M. disattivata. Tutti hanno oggi una vecchia conversione indicativa.

- **6 righe**: destinazione documentata kg = magazzino kg → Variabile, fattore indicativo vecchio.
- **1 riga**: destinazione documentata = U.M. magazzino non kg → Fissa.
- **1 riga**: U.M. acquisto = magazzino e fattore 1 → Fissa con fattore 1, conforme alla richiesta per non kg.
- **2 righe**: CARCIOFI 1791 e CIPOLLE 0287 → escluse, come confermato.
- **5 righe ulteriori**: il vecchio riferimento è nr/mazzo/cassa/vaschetta mentre il magazzino è mz/nr/pz. Non esiste una prova che il fattore vada verso il magazzino. **Proposta protettiva nel piano: lasciarle da configurare**, senza copiarle e senza usare il vecchio valore.

Quindi l'approvazione del piano autorizza **8 trasferimenti**, non 15; le **7 righe incoerenti** restano non configurate e segnalate. Nessuna modifica alla U.M. di magazzino dei prodotti.

### Preavvisi proposti
- 2 giorni: AGRICOLA BARONE; Breda Caffè Torrefazione di Marco Breda.
- 1 giorno: AZ.AGR. GORI MARCO; AZIENDA AGRICOLA ALESSANDRO BERTONI; AZIENDA AGRICOLA RENZETTI ORLANDO S.S.; AZIENDA AGRICOLA TIOZZO DI ROLANDO E MAURIZIO SS; Bertoni Andrea; CATARINACCI ANTIMO E ANDREA SRLS; F.LLI STALTARI SUD S.R.L.; FAAN FRUIT SRL; Fruttital S.r.l.; GARBAGLIA FRUIT SRL; LA FRAGOLINA SRLS UNIPERSONALE; PALLOTTA GIUSEPPE.

## Risultato nelle schermate
1. Scheda fornitore manuale ridotta a U.M. ereditate/rimozione/stella, conversione accanto a ciascuna U.M., eccezione calendario, stella fornitore e codice articolo.
2. Nascondere prima U.M., comando Applica ai fornitori, conversioni vecchie, costo concordato, U.M. prezzo, minimo, preavviso prodotto, priorità, descrizione referenza e note del collegamento. Non toccare note prodotto/ordine/carico.
3. Prima U.M. automaticamente dalla stella; senza stella dalla prima U.M. attiva, ordinata per data creazione e ID. Nessuna U.M. attiva → vuoto.
4. Preavviso modificabile vicino al calendario del fornitore. Lista e Genera ordini usano sempre quel valore e il calendario del prodotto quando presente, altrimenti del fornitore.
5. Preferenze e referenza principale: stella, poi nome fornitore; nessun badge di priorità e nessun avviso sotto minimo. Scorta minima/multiplo/da ripristinare del magazzino invariati.
6. Ripartizione e catalogo: nome fornitore · U.M. al posto della descrizione referenza.
7. Testo condiviso/email: codice articolo fornitore accanto al prodotto, dalla fotografia della riga ordine. Nessun invio durante il lavoro e nessun cambiamento XML.
8. Inventario: salva quantità contata e quantità magazzino separatamente. Altra U.M. richiede confezione attiva, fattore positivo e verifica coerente con magazzino; altrimenti messaggio richiesto. Stato della conversione accanto alle U.M. nell'impostazione Inventario.

## Due limiti da non nascondere
### Prezzo Danea
Il costo importato è in `product_supplier_costs`, ma **non ha una U.M. prezzo verificata**. L'app lo descrive già come «U.M. prezzo non indicata». Non dedurre automaticamente €/kg o €/cassa dalla U.M. Danea, di vendita o magazzino.

Il costo concordato viene tolto come richiesto, ma il calcolo indicativo della Fase 2 resta **sospeso finché Andrea indica la regola per la U.M. del costo Danea**. Nessun importo inventato o zero implicito. Quando la base sarà confermata: prezzo unitario Danea, totale di riga esatto per Fissa o stima ≈ per Variabile, solo acquisti manuali; mai totale definitivo per peso variabile, mai totale generale negli ordini, prezzo reale al Carico.

### Confezioni
131 U.M. Inventario diverse da magazzino: **17** con confezione verificata e **114** senza. Queste ultime non potranno essere confermate in quella U.M. finché si imposta la confezione; il conteggio in U.M. magazzino resta disponibile.

Un prodotto ha più fattori per la stessa U.M.: CARCIOFI 1791, «cassa 16 = 16 cassa» e «cassa 18 = 18 cassa». Non scegliere automaticamente una confezione e non correggere i dati del prodotto. Qui la U.M. contata è già quella di magazzino: fattore 1. Se in futuro un'altra U.M. avrà più fattori diversi, bloccare la conversione ambigua e chiedere di sistemare le confezioni, senza scegliere a caso.

## Dettagli tecnici
### SQL da introdurre/modificare
- Comando patch autenticato per referenze, mantenendo la firma legacy senza azzeramenti dovuti a nuove schermate.
- `manage_product_supplier_link`: eredità U.M. per nuove referenze manuali, nessun backfill dei collegamenti esistenti.
- `sync_supplier_link_default_unit`: stella o prima attiva, solo `purchase_unit_id`; non propagare più conversioni vecchie.
- `assign_shopping_list_supplier`: `effective_supplier_conversion`, nessuna vecchia conversione; variabile conserva stima separata, equivalente esatto NULL. Verificare unità B2B mantenendo i controlli del catalogo senza creare equivalenze implicite.
- `manage_product_supplier_link_unit`, `product_supplier_overview` e letture U.M.: ritirare gli usi delle configurazioni vecchie; lasciare fotografie documento immutabili.
- `shopping_list_item_state`: nessuna condizione sotto minimo. Anteprima/generazione e chiusura restano allineate.
- `record_inventory_count`, `record_inventory_count_entry`, `_inventory_card_stock`, `inventory_location_stock` e letture dipendenti: nuovi conteggi letti in quantità magazzino; storico non ricalcolato con confezioni attuali; non conforme mantiene U.M. contata con fotografia della conversione.
- Addizioni nullable/defaulted soltanto; colonne ritirate marcate DEPRECATED. Nessun DROP, nessuna modifica alle funzioni Danea. Grant e autorizzazioni mantenuti; funzioni SQL SECURITY DEFINER con search_path public.

### File previsti
Modificare solo questi file e le nuove migrazioni/test pertinenti; prima di estendere l'elenco chiedere conferma.
- `src/components/products/`: `product-suppliers-manager.tsx`, `supplier-products-manager.tsx`, `product-detail-sheet.tsx`, `purchase-units-quick-apply.tsx`, `stock-unit-config.tsx`, `products-workspace.tsx`, `AGENTS.md`.
- `src/components/companies/supplier-records-panel.tsx`.
- `src/components/shopping/`: `add-supplier-inline.tsx`, `card-suppliers.tsx`, `supplier-split-dialog.tsx`, `shopping-list-card.tsx`, `generate-orders-dialog.tsx`, `generation-summary.tsx`, `generation-results.ts`, `generation-results.test.ts`, `AGENTS.md`.
- `src/components/catalog/add-to-own-products-dialog.tsx`.
- `src/components/purchase/order-share-dialog.tsx`.
- `src/components/inventory/`: `inventory-count-panel.tsx`, `inventory-session-counter.tsx`, `AGENTS.md`.
- `src/lib/`: `product-purchase-units.ts`, `inventory-count.functions.ts`, `inventory.functions.ts`, `shopping-list.ts`, `shopping-list.functions.ts`, `shopping-auto-assign.ts`, `shopping-card-reads.ts`, `order-generation.functions.ts`, `use-delivery-schedules.ts`, `delivery-schedule.ts`, `supplier-selection.ts`, `use-needed-date.ts`, `AGENTS.md`.
- Nuovi helper puri e relativi test per patch, scelta U.M., trasferimento sicuro conversioni e conversione conteggio; test accanto ai test esistenti dei moduli modificati.
- `AGENTS.md`, `roadmap.md`; tipi e metadati generati solo dagli strumenti.
- Nessuna eliminazione del lavoro precedente: rimuovere i comandi dall'interfaccia, conservare implementazioni non più richiamate quando la cancellazione non è necessaria.

## Sequenza e verifiche
1. Nuovi conteggi prima dell'applicazione; se cambiano in modo rilevante, ripresentarli.
2. Salvataggio parziale prima di nascondere campi; poi sincronizzazione/eredità, conversioni, preavviso, semplificazione e conteggio.
3. Test concreti per campo omesso/vuoto, stella/prima U.M., eredità solo alla creazione, 8 trasferimenti e 7 esclusioni, stima distinta da equivalente, preavviso e calendario, rimozione sotto minimo, ordini per nome, confezione assente e quantità convertita. Nessun test di stile o fotografia.
4. Verifica schermate senza scritture operative; collaudo con salvataggi reali affidato ad Andrea su 3 EMME, mai Trevi. Nessun ordine creato/inviato dall'assistente, nessuna chiamata Danea reale.
5. Resoconto: campi nascosti, colonne deprecate, funzioni SQL, schermate, file/righe e test effettivamente eseguiti; distinguere prezzo Danea ancora sospeso. Nessuna pubblicazione.