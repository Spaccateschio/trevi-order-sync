# Piano generale U.M. — passi aggiornati

1. Database: U.M. di magazzino sul prodotto, modo delle U.M. d'acquisto, campi aggiuntivi su conteggi e movimenti (FATTO).
2. Scheda prodotto: scelta della U.M. di magazzino, confezioni dichiarate e conversioni per fornitore, più l'elenco «da completare».
3. **Inventario legge e usa `products.stock_unit_id` come unica U.M. di riferimento** (nuovo passo, descritto sotto).
4. Carico merce in U.M. di magazzino (fissa automatica, variabile da scrivere).
5. Conteggio misto tramite confezioni dichiarate (estensione del passo 3).
6. Lista della Spesa: equivalenti in U.M. di magazzino.

Il passo 3 viene dopo il 2 perché per scegliere «pz» per Ananas serve prima la scheda prodotto. Si può anticipare se impostiamo le U.M. direttamente nel database.

---

# Passo 3 — piano operativo: l'Inventario usa la U.M. di magazzino

## Regole
- La U.M. principale della card Inventario arriva **sempre** da `products.stock_unit_id`.
- `danea_um` è solo informativa: valore iniziale e una piccola etichetta «Danea: kg» se diversa. Non decide mai nulla.
- U.M. di acquisto, vendita e scorta non decidono più la U.M. principale e non compaiono più come scelta nel conteggio.
- Il conteggio principale si salva nella U.M. di magazzino. Il conteggio salva anche l'U.M. usata, la quantità in U.M. di magazzino e il fattore 1. Lo snapshot non va ricalcolato.
- La giacenza calcolata si esprime nella U.M. di magazzino.
- Il vecchio selettore, che mescola U.M. di vendita, acquisto e scorta, viene eliminato.
- Conteggi alternativi solo tramite confezioni dichiarate (`product_stock_packages`) con conversione fissa, per esempio «Cassa 6 bt» = 6 bt.

## Prodotti con `stock_unit_id` vuoto
- La card mostra l'avviso «U.M. magazzino da impostare» e un collegamento alla scheda prodotto.
- Nessun ripiego silenzioso su `danea_um`: la U.M. Danea compare solo come suggerimento («Danea: nr»).
- Non si può confermare il conteggio. Il prodotto non entra nella giacenza calcolata, non genera rettifiche e non chiude il ciclo come coerente.
- Il riepilogo aggiunge il contatore «U.M. da impostare»; il filtro relativo sta nel menu «Altri stati».
- Oggi riguarda 2 prodotti (U.M. Danea «nr» non trovata nell'elenco U.M.).

## Esempi
| Prodotto | Danea | Magazzino | Card Inventario | Salvataggio |
|---|---|---|---|---|
| ANANAS COSTA RICA | kg | pz | Calcolata «3 pz», Fisica `[4] pz`, nota «Danea: kg» | 4 pz, quantità magazzino 4, fattore 1 |
| AVOCADO HASS KG | kg | pz | Uguale: tutto in pz | in pz |
| VINO | cassa | bt | Calcolata e Fisica in bt. Pulsante «+ Confezione» propone solo «Cassa 6 bt» se dichiarata | 2 casse + 3 bt = 15 bt; dettaglio confezioni salvato a parte |

Se per il vino non ci sono confezioni dichiarate, si conta solo in bottiglie. Il sistema non sceglie mai da solo la cassa di un fornitore.

## Come si calcola la giacenza
- Partenza = ultimo conteggio confermato **nella U.M. di magazzino attuale** e **dopo `stock_base_at`**, se impostata.
- Poi si sommano le rettifiche registrate dopo, nella stessa U.M.
- Conteggi storici in un'altra U.M. (per esempio kg prima del passaggio a pz) non si sommano e non si convertono. La giacenza è «da verificare» finché non c'è un nuovo conteggio.
- Nessuna conversione inventata: nessun fattore da U.M. di acquisto o vendita.

## Conteggi storici
- Nessuna riga esistente viene modificata o convertita.
- Lo storico mostra ogni conteggio con la U.M. registrata allora (per esempio «12 kg, 05/10»).
- Per i prodotti in cui U.M. magazzino = U.M. Danea (122 su 124 oggi), il comportamento resta identico: stessi numeri, stessa U.M.

## Funzioni da modificare (database)
- `inventory_session_rows`, `inventory_session_progress`, `inventory_location_stock`: U.M. da `stock_unit_id`, giacenza filtrata per U.M. e per `stock_base_at`, stato «U.M. da impostare».
- `close_general_inventory`, `record_inventory_adjustment`: rifiutano i prodotti senza U.M. di magazzino o con un conteggio in U.M. diversa senza confezione. Salvano `stock_unit_id`, `stock_quantity`, `conversion_factor`, `count_breakdown`.
- `product_count_units`: sostituita da un elenco delle sole confezioni dichiarate. La vecchia funzione resta per ora, inutilizzata e segnata come deprecata.
- `inventory_requirements`: valuto solo la sua lettura della U.M. Ti segnalo se tocca il semaforo prima di modificarla.

## Codice da modificare
- `src/lib/inventory-count.functions.ts`: tipi e lettura `stock_unit_code`; nuova lettura delle confezioni.
- `src/components/inventory/inventory-count-panel.tsx`:
  - `rowUnit` usa la U.M. di magazzino;
  - eliminazione del `<select>` misto;
  - avviso «U.M. magazzino da impostare»;
  - nota «Danea: …»;
  - contatore e filtro nel riepilogo.
- `src/components/inventory/inventory-session-counter.tsx` e `inventory-history-dialog.tsx`: U.M. di magazzino e U.M. storica registrata.
- `src/lib/inventory.ts`: etichette U.M.
- `AGENTS.md`, `roadmap.md`.
- Nessuna modifica a Lista, Ordini, Carico e Fabbisogno, salvo quanto segnalato sopra per `inventory_requirements`.

Il conteggio misto (passo 5) aggiunge in seguito, nella stessa card, il pulsante «+ Confezione». In questo passo il campo resta uno solo, in U.M. di magazzino.

## Verifiche
1. Prima e dopo: totali dei conteggi, rettifiche e giacenze per i 122 prodotti con U.M. uguale. Devono essere identici.
2. Prova su un prodotto di test: imposto magazzino = pz su Ananas e Avocado (solo con il tuo consenso, oppure su un prodotto di prova). Controllo nel browser che la card mostri pz, che il salvataggio registri pz e che il conteggio vecchio in kg non venga sommato.
3. Controllo nel database: per ogni riga dell'Inventario, la U.M. mostrata coincide con `stock_unit_id` (query di confronto: 0 differenze).
4. I 2 prodotti senza U.M. mostrano l'avviso e non producono giacenza né rettifica.
5. Ricerca nel codice: nessun uso di `danea_um` come U.M. di riferimento nei file dell'Inventario.
6. Test automatici sulle regole: U.M. vuota = blocco; U.M. diversa non sommata; confezione fissa 2×6 + 3 = 15.
