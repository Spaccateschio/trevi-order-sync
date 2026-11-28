# Eccedenze kg da DDT preimpostate nella ricezione

## Cosa cambia per chi riceve la merce
- Le righe kg con DDT Incassi sopra l'ordinato e senza dichiarazione del fornitore si aprono gi�� con esito «Eccedenza», quantità e prezzo del DDT. Non c'è più un pulsante da premere riga per riga.
- «Conferma carico» le registra insieme alle altre righe. «Conferma tutte come arrivate» non le trasforma in OK: le lascia come eccedenze.
- Il riepilogo sopra «Conferma carico» le elenca sempre (ordinati, da caricare, numero DDT) e le conta come eccedenze, non come «da verificare».
- Si può ancora scegliere un altro esito (OK, Parziale, ecc.): in quel caso tornano la quantità ordinata e il prezzo originale (come oggi).
- Restano «da verificare» con le regole attuali: pezzi, unità diverse e righe non abbinate.

## Fuori perimetro
`receive_purchase_order`, contestazioni, Danea, Incassi, database: nessuna modifica. Per la funzione di carico l'esito inviato resta lo stesso (eccedenza + conferma + DDT).

## Dettagli tecnici
File: `src/components/purchase/receive-outcomes.ts`, `src/components/purchase/receive-goods-panel.tsx`, `src/components/purchase/receive-outcomes.test.ts`.

1. `initialReceiveDraft(line, hasDelivery = false)`: se `canReceiveExcess(line, hasDelivery)` → `outcome: 'eccedenza'`, `quantity` = qty DDT, `unitCost` = prezzo DDT, `priceUnitCode: 'kg'`, `priceQuantity` = qty DDT. Altrimenti invariato.
2. `receiveSummary` e `confirmUntouched`: usano la bozza iniziale quando la riga non ha bozza, così le eccedenze preimpostate contano come eccedenze e non vengono mai sovrascritte con OK.
3. `chooseReceiveOutcome`: invariata (uscendo da eccedenza ripristina baseline e prezzo originale).
4. Pannello: passa `Boolean(delivery)` a `initialReceiveDraft` (anche nel payload di conferma); il pulsante «Registra eccedenza» diventa l'opzione «Eccedenza» nella stessa fila di OK/Parziale/…, visibile solo se `canReceiveExcess`, già selezionata; l'elenco del riepilogo legge la bozza iniziale per le righe non toccate.
5. Test vitest aggiornati: bozza iniziale = eccedenza con qty/prezzo DDT; con consegna/dichiarazione resta null; pz, unità diverse e non abbinate restano null; «Conferma tutte» conserva l'eccedenza e mette OK alle altre; riepilogo conta 1 eccedenza e 0 da verificare senza click; payload senza click contiene `excess_confirmed` e `ddt_document_id`. Il test «conferma collettiva non accetta eccedenza» viene sostituito da quest'ultimo.
