# Fornitore deciso prima del Conferma

## Risposte (sola lettura, 3 EMME)

**1. Da dove arriva il fornitore proposto**
- Collegamento: `product_supplier_links` attivo; stella `is_preferred` (messa in automatico se il collegamento è uno solo); anagrafica `supplier_record_id`; articolo B2B `b2b_item_id`.
- Quote scritte: `shopping_list_item_suppliers` (righe con `deselected_at` nullo). Si scrivono solo al Conferma, insieme alla quantità.
- Su 3 EMME, nelle Liste aperte, **tutte** le righe senza quote hanno un collegamento attivo, preferito e B2B (trevi). Esempi: 00-005 BASILICO A MAZZI, 00-022 ANANAS ORSERO, 00-014 ALLORO, 00-013 AGLIO (2 collegamenti, 1 stella). **Non c'è nessun prodotto senza fornitore.**
- Causa vera di «Fornitore da assegnare»: il Carrello e «Cosa confermi» prendono il nome del fornitore solo dalle quote già salvate. Prima del Conferma le quote non esistono ancora, quindi la riga finisce sotto «Fornitore da assegnare», anche se la card mostra già trevi spuntato. Al Conferma il fornitore viene comunque assegnato in automatico.

**2. Dove si decide nel codice**
- Proposta sulla card: `visualPick` (`src/lib/supplier-selection.ts`) e `chooseListDestinations` (`src/lib/supplier-memory.ts`), usati in `card-suppliers.tsx` (~riga 685) e `shopping-list-card.tsx` (~641).
- Blocchi reali: `card-suppliers.tsx` ~709-792 (`notPurchasable`, `noUnits`, «Non in catalogo del fornitore»).
- Scritta «Fornitore da assegnare»: `entryCartLinesBySupplier` (`src/lib/local-entry-cart.ts:77`) quando `supplierNames` è vuoto. I nomi vengono riempiti in `shopping-list-panel.tsx` `cartLines` (~1662-1687): righe in Lista solo dalle quote salvate, prodotti «in attesa» sempre vuoti.

**3. Pannello esistente**
- Sulla card c'è già la zona fornitori: spunta = acquisto in questa Lista, quota e U.M. per ciascuno, stella, «+ Aggiungi fornitore», «Acquisto diretto (compro io)», «Togli da questa Lista», «Scollega».
- Con un solo fornitore la quota segue tutta la quantità. Il prezzo B2B si legge e non si modifica.
- Rispetto a Efficio mancano: confronto prezzi affiancato e «Nuovo fornitore rapido». Sono fuori da questo piano, a meno che tu non li chieda.

**4. Memoria fornitore**
- Fonte: ultima Lista chiusa (`shopping_list_item_suppliers`). Ricorda fornitore, U.M. e proporzioni, mai le quantità. Si applica alle righe senza quote. La stella cambiata a mano dopo quella Lista ha la precedenza.
- Copertura: le regole 1, 2 e 5 sono già coperte (la 5 solo dopo la chiusura della Lista). La 3 è coperta in parte: il motivo compare solo per i blocchi B2B. La 4 **manca**: è il difetto descritto sopra.

## Piano (solo schermata, nessuna modifica a DB, ciclo, quantità o salvataggio)

1. **Carrello e «Cosa confermi» con il fornitore già deciso.** In `cartLines` (shopping-list-panel.tsx), per le righe senza quote salvate si usano i nomi del fornitore proposto dalla stessa `chooseListDestinations` usata dalla card. Per le righe «in attesa» si usano i fornitori collegati già letti. Quello che si vede è esattamente ciò che il Conferma assegnerà. Nessuna lettura nuova: i dati sono già nella lettura unica della pagina.
2. **«Fornitore da assegnare» solo se è vero.** Il gruppo resta solo quando `chooseListDestinations` non trova nessuna destinazione. Il nome diventa «Senza fornitore», con il motivo esatto: nessun collegamento, articolo non acquistabile, U.M. non disponibili oppure più fornitori con stella da ripartire.
3. **Card senza fornitore valido.** Mostra subito il motivo e i due tasti «+ Aggiungi fornitore» e «Acquisto diretto», riusando quelli che esistono già. Non serve aspettare il Conferma.
4. **Regole 1, 2 e 5:** si riusano proposta, pannello e memoria esistenti, senza modifiche.

### File toccati
- `src/components/shopping/shopping-list-panel.tsx` (cartLines, confirmedCartLines invariato)
- `src/lib/local-entry-cart.ts` (etichetta e motivo del gruppo)
- `src/components/shopping/card-suppliers.tsx` (riga motivo + tasti quando non c'è destinazione)
- Nuovo helper puro `proposedSupplierNames` in `src/lib/supplier-memory.ts`, con test in `list-preselection.test.ts`

### Verifica
Su 3 EMME, da telefono e senza confermare: BASILICO 00-005 e ANANAS 00-022 nel gruppo trevi srl in Carrello e «Cosa confermi»; AGLIO con trevi; nessun «Fornitore da assegnare».
