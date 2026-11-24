# Conteggio corretto nella barra Carrello

## Causa
La scritta della barra («1 prodotto · 1 fornitore») conta solo le quantità appena modificate e non ancora confermate (bozze). Appena ce n'è almeno una, le quantità già salvate ma non ancora in un ordine spariscono dal conteggio. Nel tuo caso hai modificato 1 sola card (es. ANGURIA 8 pezzi), quindi conta solo quella.

## Correzione (solo visiva)
- La barra conterà sempre gli stessi prodotti che vedi aprendo il Carrello / «Cosa confermi»: nuove quantità + quantità salvate non ancora ordinate, con i loro fornitori (es. 8–9 prodotti · 3 fornitori).
- Il pulsante «Conferma» e il salvataggio restano identici: si salvano sempre e solo le quantità nuove.

## Dettagli tecnici
- Unico file: `src/components/entry-cart/entry-cart-dock.tsx`, riga 109: usare `reviewMetrics` (già calcolato da `entryCartReviewLines`) al posto di `metrics`.
- Nessuna modifica a database, funzioni, salvataggi o altri file.
