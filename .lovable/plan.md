# Unità di misura: distinguere acquisto e vendita

## Situazione attuale (verificata)

- L'anagrafica `units_of_measure` è **un unico elenco aziendale** (sigla, descrizione, stato). Non dice se una U.M. serve per comprare o per vendere.
- La distinzione però **esiste già dove conta**:
  - **Vendita** → `product_sale_units`: per ogni prodotto puoi assegnare più U.M. di vendita (cassa, kg, pezzo) con conversione, visibilità al cliente e una predefinita.
  - **Acquisto** → `product_supplier_links.purchase_unit_id`: ogni referenza fornitore ha la propria unità d'acquisto con conversione verso l'U.M. base.
- Manca invece: (a) poter marcare a catalogo l'uso previsto di ogni U.M., (b) poter dire "vendo a cassa ma il prezzo è al kg".

## Cosa propongo

### 1. Uso dell'unità di misura (acquisto / vendita / entrambi)

- Nuovo campo sull'anagrafica U.M.: uso = `acquisto`, `vendita`, `entrambi` (predefinito `entrambi`; tutte le U.M. esistenti diventano `entrambi`, nessun dato cambia).
- Nella schermata Impostazioni → Unità di misura: pulsanti/segmenti per scegliere l'uso, colonna "Uso" in elenco.
- I selettori filtrano di conseguenza:
  - U.M. di vendita del prodotto → solo `vendita` + `entrambi`.
  - U.M. d'acquisto della referenza fornitore → solo `acquisto` + `entrambi`.
  - U.M. base del prodotto (scheda Nuovo prodotto) → tutte.
- È un **filtro di comodità, non un blocco retroattivo**: le assegnazioni già esistenti restano valide anche se l'uso viene poi ristretto.

### 2. Prezzo espresso su un'unità diversa da quella di vendita

Sul singolo abbinamento prodotto ↔ U.M. di vendita si aggiunge:
- modalità prezzo: **per unità di vendita** (es. € a cassa) oppure **per U.M. base** (es. € al kg, moltiplicato dal fattore di conversione);
- l'U.M. di riferimento del prezzo quando la modalità è "per U.M. base".

Così "vendo a cassa, prezzo al kg" diventa configurabile per prodotto, senza duplicare prodotti né listini.

Nota: i listini (`product_prices`) restano invariati in questa fase — la modalità dice **come si legge** il prezzo, non cambia come è memorizzato. Se serve un prezzo diverso per ogni U.M. di vendita, è una fase successiva da concordare.

## Cosa resta invariato

FASE A/B/C/D, inventario (sempre su U.M. base, una riga per prodotto), fabbisogno, Lista della Spesa (referenza singola), Danea (import read-only, non tocca l'uso delle U.M. né i prodotti interni), permessi, route, layout approvati.

## Dettagli tecnici

- Nuovo enum `unit_usage` (`acquisto`,`vendita`,`entrambi`) + colonna su `units_of_measure` con default `entrambi`.
- Nuovo enum `sale_price_mode` (`per_unita_vendita`,`per_um_base`) + colonne `price_mode` e `price_reference_unit_id` su `product_sale_units`.
- RPC aggiornate: `manage_unit_of_measure` (parametro uso), `apply_product_sale_unit_batch` (operazioni `price_mode` / `price_reference`). SECURITY DEFINER, `search_path = public`, solo amministratori come oggi.
- UI toccata: `unit-catalogue.tsx`, `sales-unit-manager.tsx`, `unit-picker.tsx`, `product-suppliers-manager.tsx`, `internal-product-dialog.tsx`.

## Test previsti (transazionali, con rollback)

1. U.M. "cassa" marcata `acquisto`: non appare tra le U.M. di vendita, appare tra le referenze fornitore.
2. U.M. già assegnata e poi ristretta: l'assegnazione esistente resta e continua a funzionare.
3. Prodotto con tre U.M. di vendita (cassa, kg, pezzo) e prezzo in modalità "al kg": conversioni corrette.
4. Inventario: una sola riga per prodotto, fotografia immutabile.
5. Import Danea: nessuna modifica a uso U.M., unità di vendita, prodotti interni.
6. Nessuna regressione su Lista della Spesa, ordini, ricevute, lotti.
