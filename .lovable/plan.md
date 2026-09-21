# Unità di misura: acquisto, vendita, prezzo e peso effettivo

## Principio guida (dal chiarimento)

- Il **prezzo unitario è certo** e riferito a **una sola U.M.** (es. POMODORI = €2,00/kg), indipendentemente dall'U.M. scelta per ordinare.
- Le **U.M. ordinabili** possono essere più di una (kg, cassa, pezzo, mazzo).
- Le **conversioni** (1 cassa ≈ 8 kg) sono **indicative**: servono a informare, preparare e stimare il fabbisogno, **non certificano il peso** e **non determinano il totale definitivo**.
- Il **totale definitivo nasce solo dalla preparazione/pesatura** (8,35 kg × €2,00 = €16,70). Prima di allora si può mostrare solo un **totale stimato**, etichettato come stima.
- Vale anche ordinando a kg: richiesti 3 kg, preparati 3,08 kg → il definitivo è 3,08 kg.

## Situazione attuale (verificata)

- `units_of_measure`: unico elenco aziendale (sigla, descrizione, stato). Non distingue l'uso.
- **Vendita** → `product_sale_units`: più U.M. per prodotto con conversione, visibilità al cliente, predefinita. Già la struttura giusta per le U.M. ordinabili.
- **Acquisto** → `product_supplier_links.purchase_unit_id`: U.M. e conversione della singola referenza fornitore.
- **Prezzo** → `product_prices` (listino, netto/lordo) **non dice a quale U.M. si riferisce**: è il buco da chiudere.
- Nessun modulo ordini clienti esiste ancora: la semantica richiesta va **fissata nel modello ora**, applicata poi.

## Cosa propongo

### 1. Uso dell'unità di misura (acquisto / vendita / entrambi)

Nuovo campo sull'anagrafica U.M.: `acquisto`, `vendita`, `entrambi` (predefinito `entrambi`, nessun dato esistente cambia). In Impostazioni → Unità di misura: pulsanti per l'uso + colonna "Uso".

I selettori filtrano per comodità, **senza blocchi retroattivi**:
- U.M. ordinabili del prodotto → `vendita` + `entrambi`
- U.M. d'acquisto della referenza fornitore → `acquisto` + `entrambi`
- U.M. base del prodotto → tutte

### 2. U.M. di riferimento del prezzo (separata dalle U.M. ordinabili)

Sul prodotto: **U.M. a cui è riferito il prezzo** (`price_unit_id`, es. kg). Il prezzo di listino si legge sempre come "€ per quella U.M.".
- Non si aggiunge nessun prezzo per singola U.M. di vendita: un solo prezzo certo, una sola U.M. di riferimento.
- Il catalogo cliente mostrerà "€2,00/kg" e, per ogni U.M. ordinabile diversa dalla U.M. prezzo, la conversione indicativa: "1 cassa ≈ 8 kg".

### 3. Le conversioni restano dichiaratamente indicative

`product_sale_units.conversion_factor` resta, ma con semantica esplicita:
- nuovo flag **peso variabile** sull'abbinamento prodotto ↔ U.M. ordinabile: quando è attivo, la conversione è una stima e il totale non è determinabile prima della pesatura;
- l'etichetta mostrata al cliente usa sempre "≈" quando la conversione è indicativa.

### 4. Semantica ordini/preparazione fissata ora (nessuna UI in questa fase)

Il modello dei futuri ordini cliente dovrà distinguere quattro grandezze, che documento adesso come vincolo di progetto:

```text
quantità + U.M. richieste dal cliente   (1 cassa)
   -> quantità/peso effettivo preparato  (8,35 kg)
      -> quantità fatturabile            (8,35 kg)
         -> importo definitivo           (8,35 x 2,00 = 16,70)
```

Prima della preparazione si calcola solo un **totale stimato** (1 cassa ≈ 8 kg → ≈ €16,00), sempre etichettato come stima e mai salvato come importo definitivo.

## Le sei grandezze tenute separate

| Concetto | Dove vive |
| --- | --- |
| U.M. base prodotto | `products.um` |
| U.M. acquisto referenza fornitore | `product_supplier_links.purchase_unit_id` |
| U.M. ordinabili dal cliente | `product_sale_units` |
| U.M. di riferimento del prezzo | nuova `products.price_unit_id` |
| Conversioni indicative | `product_sale_units.conversion_factor` + flag peso variabile |
| Quantità/peso effettivo | futuro modulo preparazione (solo semantica fissata ora) |

## Cosa resta invariato

FASE A/B/C/D; inventario sempre su U.M. base con una riga per prodotto e fotografia immutabile; formule di giacenza e fabbisogno; Lista della Spesa sulla singola referenza; ordini fornitore, ricevute, lotti; Danea (import read-only, non tocca uso U.M., U.M. prezzo, unità di vendita né prodotti interni); listini `product_prices` nella struttura attuale; permessi, route e layout approvati.

## Dettagli tecnici

- Nuovo enum `unit_usage` (`acquisto`,`vendita`,`entrambi`) + colonna su `units_of_measure`, default `entrambi`.
- Nuova colonna `products.price_unit_id` (FK `units_of_measure`, nullable; se vuota il prezzo si intende sull'U.M. base).
- Nuova colonna `product_sale_units.is_estimated_conversion` (boolean, default true quando la conversione è verso un'U.M. a peso).
- RPC aggiornate: `manage_unit_of_measure` (uso), `manage_internal_product` (U.M. prezzo), `apply_product_sale_unit_batch` (operazione `estimated`). SECURITY DEFINER, `search_path = public`, solo amministratori come oggi.
- UI toccata: `unit-catalogue.tsx`, `unit-picker.tsx`, `sales-unit-manager.tsx`, `internal-product-dialog.tsx`, `product-detail-sheet.tsx`, catalogo cliente (`acquisti.catalogo.*`) per l'etichetta "€2,00/kg · 1 cassa ≈ 8 kg".

## Test previsti (transazionali, con rollback)

1. U.M. "cassa" marcata `acquisto`: assente tra le U.M. ordinabili, presente tra le referenze fornitore.
2. U.M. già assegnata e poi ristretta: l'assegnazione esistente resta valida e funzionante.
3. POMODORI con prezzo €2,00/kg e U.M. ordinabili kg/cassa/pezzo: il catalogo mostra sempre €2,00/kg e "1 cassa ≈ 8 kg", mai €16,00 come prezzo.
4. Nessun importo definitivo viene calcolato o salvato da una conversione indicativa.
5. Inventario: una sola riga per prodotto, fotografia immutabile, U.M. base invariata.
6. Import Danea: nessuna modifica a uso U.M., U.M. prezzo, unità di vendita, prodotti interni.
7. Nessuna regressione su fabbisogno, Lista della Spesa, ordini fornitore, ricevute, lotti.
