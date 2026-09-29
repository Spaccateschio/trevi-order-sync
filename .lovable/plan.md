# Lista della Spesa: vista card/righe, tasti rapidi, secondo fornitore, blocco quantità, filtro fornitori

## Cosa cambia per l'utente

1. **Interruttore «Card / Righe»** in alto sopra i prodotti della Lista.
   - Card (predefinita): come l'Inventario, 2 per riga su computer/tablet, 1 su telefono.
   - Righe: vista compatta e veloce da controllare a lista completata.
   - La scelta resta memorizzata sul dispositivo.
   - La sezione «Prodotti da valutare» resta com'è.

2. **Tasti rapidi +1 +3 +5 +10** nella card, sotto «Quantità da acquistare», come nella card Inventario (più il tasto per azzerare/cancellare il valore). Il campo resta anche scrivibile a mano.

3. **Stesso prodotto da un altro fornitore**: nel riquadro «Fornitore» un pulsante **«+ Acquista anche da un altro fornitore»**. Apre la scelta del fornitore (tra quelli che vendono il prodotto), con la sua quantità e la sua U.M. d'acquisto. La card mostra poi una riga per ogni fornitore, per esempio «Rossi — 3 cs» e «Bianchi — 2 cs». Usa la ripartizione già esistente (Step 2), senza modifiche al database.

4. **Blocco della quantità**: dopo aver inserito la quantità, il tasto **«Conferma»** la blocca (campo e tasti rapidi disattivati, lucchetto visibile). Il tasto **«Sblocca»** la rende di nuovo modificabile.

5. **Filtro «Fornitore»**: oltre a «Tutti i fornitori» elencherà **tutti i fornitori veri dell'anagrafica** attivi, non solo quelli già scelti nella Lista.

## Da decidere (una domanda)

Il blocco della quantità deve restare anche dopo aver ricaricato la pagina o su un altro dispositivo?
- **Sì** → serve un piccolo campo in più nel database per le righe della Lista (si chiede conferma a parte, prima).
- **No** → il blocco vale solo finché la pagina resta aperta, senza toccare il database.

## Non si tocca

Inventario (compresa la sua card), «Prodotti da valutare» (salvo il passaggio alla Lista), Fabbisogno, Ordini, Consegne, Carico Merce, semaforo, database Step 2.

## Dettagli tecnici

- File: `shopping-list-card.tsx` (tasti rapidi, blocco, pulsante secondo fornitore), `shopping-list-panel.tsx` (interruttore, vista a righe, opzioni del filtro da `supplier_records` attivi dell'azienda).
- Secondo fornitore: riuso di `supplier-split-dialog` / `assign_shopping_list_supplier`, una riga per fornitore+U.M. d'acquisto; quantità d'acquisto e U.M. d'acquisto per fornitore, equivalente NULL se manca conversione.
- Tasti rapidi: sommano alla quantità obiettivo in U.M. di magazzino (mai cassette nei kg).
- Preferenza vista in localStorage letta dopo l'avvio della pagina.
