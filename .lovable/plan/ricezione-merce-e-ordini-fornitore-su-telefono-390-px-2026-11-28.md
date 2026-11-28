# Ricezione merce e Ordini fornitore su telefono (390 px)

Solo interfaccia. Database, `receive_purchase_order`, contestazioni, Danea e Incassi restano invariati. Gli esiti interni (eccedenza preimpostata, tetto sul DDT, OK esatto) non cambiano: cambia solo come si vedono.

## A) «Registra arrivo merce»

1. Testata: «DDT n. {numero} del {data}» in evidenza (dal primo documento Incassi abbinato); senza DDT si mostra solo il numero d'ordine. Sotto, in piccolo, «ORD-… · {fornitore}».
2. Un solo pulsante largo «Segna OK tutte le righe» (48 px), stesso comportamento di oggi: le righe già preimpostate dal DDT restano come sono, le altre diventano OK.
3. Lista compatta in un unico riquadro, una riga per articolo (≥ 56 px):
   - a sinistra spunta verde (riga a posto) oppure «!» ambra (da controllare);
   - nome in grassetto, sotto «Richiesto 2 pz · Preparato 1,3 kg» con l'unità di ciascun lato;
   - freccia a destra; nessun prezzo.
4. Nessuna parola «eccedenza», «in più», «maggiore dell'ordinato» e nessun rosso per differenze di peso in kg. Il «!» ambra compare solo per le righe «da controllare» di oggi (unità diversa, non abbinata, abbinamento incerto) o senza esito scelto e non risolvibili con «Segna OK».
5. Tocco sulla riga: pannello dal basso con codice e «DDT n. … del …», nome, quattro riquadri «Richiesto», «Preparato», «Prezzo» (prezzo DDT con unità) e «Importo», nota «Prodotto a peso: la quantità è quella pesata alla preparazione» solo per le righe in kg. Pulsanti in riga «OK», «Parziale», «Mancante» (campi di oggi per quantità parziale e motivo), sotto il link «Altro: contesta» che apre l'esito «Danneggiato» e il flusso di contestazione esistenti. Nelle righe kg con DDT sopra il richiesto, «OK» applica la quantità del DDT (esito interno invariato), senza nominarlo. «Sostituisci» non si implementa.
6. Barra fissa in basso: «N controllate · M da controllare. Tocca una riga per prezzo e dettagli.» e «Conferma carico», disattivato finché resta un «!» non risolto. Nulla va in magazzino prima del click. Si tolgono il riepilogo lungo e le liste di eccedenze.
7. Righe del DDT non abbinate e «Merce in più» in un blocco chiuso in fondo («Altre righe del documento ({n})»), apribile.

## B) «Ordini fornitore» (Card e Righe)

- Per gli ordini in attesa di merce (stessa regola `isAwaitingGoods` di oggi) pulsante «Registra arrivo merce» a tutta larghezza, 48 px, visibile anche con la riga chiusa; apre direttamente la ricezione. Ordini non pronti: nessun pulsante.
- Con DDT arrivato: «DDT n. {numero} arrivato · {N} righe» sulla riga e sulla card.

Punto da confermare: oggi l'elenco non legge i DDT (il cliente li vede solo dentro la ricezione, tramite lettura protetta lato server). Per il testo del DDT nell'elenco serve una nuova lettura in sola lettura nello stesso modo (`getOrdersDdtSummary`: verifica che l'utente veda gli ordini, poi restituisce solo numero, data e numero righe). Nessuna modifica al database. Se preferisci non aggiungerla, nell'elenco resta solo il pulsante.

## Dettagli tecnici

File toccati:
- `src/components/purchase/receive-outcomes.ts`: nuove funzioni pure `receiveRowIndicator(line, draft)` → `ok | da_controllare`, `requestedPreparedLabel(line)`, `canConfirmReceipt(lines, drafts)`, `receiveCountsLabel(...)`; `confirmUntouched` invariata (si verifica che includa le preimpostate). Nessun cambio a `receivePayload`.
- `src/components/purchase/receive-goods-panel.tsx`: nuova testata, lista compatta, bottom sheet (shadcn `Drawer`/`Sheet side="bottom"`), barra fissa, blocco chiuso (`Collapsible`).
- `src/components/purchase/order-list-presentation.ts`: `ddtArrivedLabel(doc)` e `showsReceiveButton(order)`.
- `src/components/purchase/purchase-orders-panel.tsx`: pulsante sempre visibile in Card e Righe, testo DDT.
- `src/lib/purchase.functions.ts` (solo se approvato il punto sopra): `getOrdersDdtSummary` in sola lettura.
- Test vitest: `receive-outcomes.test.ts`, `order-list-presentation.test.ts` (indicatore, testo Richiesto/Preparato, abilitazione Conferma carico, Segna OK tutte, etichetta DDT senza «eccedenze»).
- Colori solo da token di `src/styles.css`; aree toccabili ≥ 44 px; nessuna emoji.

Verifica: browser a 390 px con dati simulati intercettati (nessuna chiamata di conferma eseguita), controllo assenza di parole vietate e di overflow.
