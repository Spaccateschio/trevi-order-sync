# Unità di misura: acquisto, vendita, prezzo e conversioni

## Principio guida

- Il **prezzo unitario è certo** e riferito a **una sola U.M. del prodotto** (POMODORI = €2,00/kg), qualunque sia l'U.M. scelta per ordinare.
- Le **U.M. ordinabili** possono essere più di una (kg, cassa, pezzo, mazzo). "Cassa" descrive **come il cliente vuole ricevere** la merce, non un prezzo diverso.
- Ogni conversione prodotto ↔ U.M. è **esplicitamente esatta o indicativa**, scelta a mano, mai dedotta dall'U.M.:
  - esatta → "1 cartone = 12 pz"
  - indicativa → "1 cassa ≈ 8 kg"
- Con conversione indicativa non si mostra mai €16 come prezzo della cassa: resta €2,00/kg. Il definitivo nasce dalla pesatura (8,35 kg × €2,00 = €16,70).

## Vincolo documentato sui listini

**Tutti i prezzi/listini di un prodotto sono interpretati rispetto alla stessa U.M. prezzo** (`products.price_unit_id`). Nel modello attuale (Danea incluso) i listini sono prezzi diversi dello **stesso** prodotto con la stessa U.M., quindi una sola U.M. prezzo per prodotto è corretta. `product_prices` **non viene modificato**. Se in futuro servirà un prezzo riferito a U.M. diverse per listino, si estenderà il modello senza alterare questa fase.

## Interventi

### 1. Uso dell'unità di misura (acquisto / vendita / entrambi)
Campo `usage` sull'anagrafica U.M., default `entrambi` (nessun dato esistente cambia). In Impostazioni → Unità di misura: pulsanti per l'uso + colonna "Uso". I selettori filtrano per comodità, **senza blocchi retroattivi**: U.M. ordinabili → `vendita`/`entrambi`; U.M. d'acquisto referenza → `acquisto`/`entrambi`; U.M. base → tutte.

### 2. U.M. di riferimento del prezzo
`products.price_unit_id` (FK U.M., nullable; se vuota il prezzo si intende sull'U.M. base). Selezionabile nella scheda prodotto. Il catalogo mostra "€2,00/kg".

### 3. Tipo di conversione esplicito
`product_sale_units.conversion_type` = `esatta` | `indicativa`, **scelta dall'utente**, nessuna deduzione dall'U.M. Etichette: "1 cartone = 12 pz" / "1 cassa ≈ 8 kg".

### 4. Preparazione: solo semantica documentata
Nessuna tabella né UI di ordini/preparazione in questa fase. Vincolo futuro registrato in roadmap:

```text
quantità richiesta -> quantità preparata/pesata -> quantità fatturabile -> totale definitivo
```
Prima della preparazione esisterà solo un **totale stimato**, chiaramente distinto.

## Le sei grandezze separate

| Concetto | Dove vive |
| --- | --- |
| U.M. base prodotto | `products.um` |
| U.M. acquisto referenza fornitore | `product_supplier_links.purchase_unit_id` |
| U.M. ordinabili dal cliente | `product_sale_units` |
| U.M. di riferimento del prezzo | nuova `products.price_unit_id` |
| Conversione esatta o indicativa | `product_sale_units.conversion_factor` + `conversion_type` |
| Quantità/peso effettivo | futuro modulo preparazione (solo semantica) |

## Invariato

FASE A/B/C/D; inventario su U.M. base con una riga per prodotto e fotografia immutabile; formule giacenza e fabbisogno; Lista della Spesa sulla singola referenza; ordini fornitore, ricevute, lotti; Danea read-only (non tocca uso U.M., U.M. prezzo, unità di vendita, prodotti interni); `product_prices`; permessi, route, layout.

## Dettagli tecnici

- Enum `unit_usage` (`acquisto`,`vendita`,`entrambi`) + colonna su `units_of_measure`, default `entrambi`.
- Enum `sale_conversion_type` (`esatta`,`indicativa`) + colonna su `product_sale_units`, default `indicativa` solo come valore iniziale, modificabile sempre a mano.
- Colonna `products.price_unit_id` FK `units_of_measure(id)`.
- RPC: `manage_unit_of_measure` (+ uso), `apply_product_sale_unit_batch` (+ operazione `conversion_type`), `manage_internal_product` (+ U.M. prezzo). SECURITY DEFINER, `search_path = public`, solo amministratori.
- UI: `unit-catalogue.tsx`, `sales-unit-manager.tsx`, `internal-product-dialog.tsx`, `product-detail-sheet.tsx`, catalogo cliente per l'etichetta prezzo/conversione.

## Test (transazionali, con rollback)

1. U.M. "cassa" marcata `acquisto`: assente tra le U.M. ordinabili, presente tra le referenze fornitore.
2. U.M. già assegnata e poi ristretta: assegnazione esistente valida e funzionante.
3. POMODORI €2,00/kg con kg/cassa/pezzo: prezzo sempre €2,00/kg, "1 cassa ≈ 8 kg", mai €16 come prezzo.
4. Cartone con conversione esatta: etichetta "= 12 pz", nessun "≈".
5. Nessun importo definitivo derivato da una conversione.
6. Inventario: una riga per prodotto, fotografia immutabile, U.M. base invariata.
7. Import Danea: nessuna modifica a uso U.M., U.M. prezzo, unità di vendita, prodotti interni.
8. Nessuna regressione su fabbisogno, Lista della Spesa, ordini fornitore, ricevute, lotti.
