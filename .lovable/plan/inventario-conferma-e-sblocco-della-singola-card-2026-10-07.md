# Inventario — conferma e sblocco della singola card

- Dopo il salvataggio riuscito con **Conferma**, la card si blocca.
- La **matita** sblocca la singola card, rispettando le autorizzazioni e i blocchi del ciclo già esistenti.
- Una nuova conferma salva la quantità e blocca nuovamente la card. Se il salvataggio fallisce, resta modificabile.
- Quando è bloccata, quantità, U.M., pulsanti di incremento e azzeramento non possono modificare o salvare valori, nemmeno premendo Invio.
- Nessuna modifica a giacenze, conversioni, storico, Lista della Spesa, ordini o database. Il colore rosso non fa parte di questo intervento.

## File previsti e verifiche
- `src/components/inventory/inventory-count-panel.tsx`: stato della singola card, matita e protezioni dei comandi.
- `src/lib/inventory-card-lock.ts` e relativo `.test.ts`: regola del blocco e test su conferma, sblocco e salvataggio fallito.
- `AGENTS.md`: documentazione della regola tecnica.

Verifica sullo schermo senza salvare quantità su prodotti reali; test automatici sulle transizioni del blocco. Al termine, resoconto dei file e delle righe modificate.
