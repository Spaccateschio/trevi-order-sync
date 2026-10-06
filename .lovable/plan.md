# Lista della Spesa: aggiunta prodotti con filtri completi e U.M. d'acquisto

## Obiettivo
Nella Lista della Spesa, «Aggiungi prodotti» deve mostrare tutto ciò che l'azienda può comprare (prodotti propri + cataloghi dei fornitori collegati in B2B), con filtri per fornitore, categoria e sottocategoria, selezione multipla e impostazione della U.M. d'acquisto al momento dell'aggiunta.

## Stato attuale
- `add-products-dialog.tsx` mostra solo i prodotti già propri, ricerca solo per nome/codice, massimo 100 righe, nessuna scelta U.M.
- Il fornitore si associa da solo solo per prodotti aggiunti dal catalogo B2B (`add_catalog_product_to_own_products`).
- Prodotti Danea senza fornitore: restano senza fornitore (si sistemerà lato Danea, fuori da questo intervento).

## Modifiche

### 1. Sorgente prodotti allargata
- Il dialogo mostra: prodotti propri dell'azienda **più** i prodotti pubblicati nei cataloghi dei fornitori con rapporto attivo.
- Se l'utente aggiunge un prodotto del catalogo fornitore non ancora proprio, si riusa la RPC esistente `add_catalog_product_to_own_products`: il prodotto diventa proprio e il collegamento fornitore nasce in automatico (niente doppioni).

### 2. Filtri nel dialogo «Aggiungi prodotti»
- Filtro **Fornitore** (elenco fornitori attivi collegati + «senza fornitore»).
- Filtro **Categoria** e **Sottocategoria** (dai dati prodotto esistenti).
- Ricerca testuale nome/codice mantenuta.
- Rimosso il limite dei 100 con caricamento a scorrimento o paginazione semplice.

### 3. U.M. d'acquisto all'aggiunta
- Per ogni prodotto selezionato, nel dialogo si può impostare quantità e **U.M. d'acquisto**:
  - B2B: solo U.M. pubblicate dal venditore (regola esistente, invariata).
  - Non-B2B: U.M. configurate nei collegamenti fornitore + U.M. principale prodotto; «Altra U.M.» testuale come da regole esistenti.
- Se non impostata, il prodotto entra in lista come oggi (da completare in card).

### 4. Cosa NON cambia
- Filtro preferiti all'apertura di Lista e Inventario (resta com'è).
- Regole U.M. B2B/non-B2B, chiusura lista, semaforo, Inventario, Ordini, Consegne, Carico Merce: nessuna modifica.
- Nessuna modifica al database se non emergesse una lacuna (verrà segnalata prima).

## File previsti
- `src/components/shopping/add-products-dialog.tsx` (riscrittura del dialogo)
- eventuale nuovo hook/query in `src/lib/` per cataloghi fornitori (RPC esistenti: `available_suppliers`, `buyer_catalog_prices`, `add_catalog_product_to_own_products`)
- nessun altro file toccato senza segnalazione

## Verifica
- Prova a schermo: apertura dialogo, filtri fornitore/categoria, aggiunta multipla con U.M., prodotto B2B che nasce con fornitore già associato.
