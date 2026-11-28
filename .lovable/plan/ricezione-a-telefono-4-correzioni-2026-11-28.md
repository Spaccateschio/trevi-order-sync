# Ricezione a telefono: 4 correzioni

Solo interfaccia e regole di presentazione. `receive_purchase_order`, contestazioni, Danea e Incassi restano invariati.

## Cosa ho verificato (sola lettura)

1. Frecce indietro
   - Freccia della testata: torna alla pagina visitata prima nel browser (`AppShell.handleBack`, cronologia; senza cronologia la Dashboard). L'ordine aperto non è una pagina a sé: aprendolo l'indirizzo resta `/acquisti/ordini`, quindi la freccia esce del tutto dagli ordini.
   - «Torna agli ordini»: chiude l'ordine aperto e mostra di nuovo l'elenco (stato locale in `purchase-orders-panel.tsx`).
2. «!» sulle melanzane: la riga è «da controllare» perché il DDT è in kg e l'ordine in pz.
3. Prezzo e Importo «—»: il pannello legge il prezzo dal DDT solo se la riga non è «da controllare», altrimenti dal prezzo della riga, che è vuoto. Il DDT però ha prezzo e quantità (MELANZANE ORD-2026-00005, DDT 16784: 1,3 kg a 1,35 €/kg, totale 1,76 €).
4. «OK» su riga pz ordinata / DDT kg (stessa riga): ordinati 2 pz; l'unità di magazzino fotografata nella riga è kg; prezzo dell'ordine a kg.
   - Oggi «OK» registrerebbe: arrivati 2 pz, ma la quantità di magazzino in kg è vuota, quindi la conferma si ferma già nell'app con «indica la quantità effettiva per il magazzino». Niente viene scritto, neanche per le altre righe.
   - La riga non può restare fuori: la funzione di carico richiede tutte le righe da ricevere («Controlla tutte le righe da ricevere»). Lasciarla fuori richiederebbe di cambiare la funzione: non lo propongo ora.

## Correzioni proposte

1. Una sola freccia: l'ordine aperto e la ricezione diventano passi nell'indirizzo (`/acquisti/ordini?ordine=…&ricevi=1`). La freccia della testata torna così all'elenco da cui sei arrivato (e dall'elenco alla pagina precedente). Tolgo «Torna agli ordini» dal dettaglio e dalla ricezione (anche dall'acquisto diretto, per coerenza).
2. Al posto del «!»: etichetta «Da confermare» sulla riga e sotto il nome una frase semplice, per esempio «Ordinate a pezzi, consegnate a kg: tocca per confermare». Per gli altri casi: «Il documento non indica bene la quantità: tocca per confermare».
3. Pannello compatto: una fila di 4 riquadri piccoli (Richiesto, Preparato, Prezzo, Importo), poi OK / Parziale / Mancante visibili senza scorrere su 390 px, «Altro: contesta» e «Dettagli riga» chiuso di default. Prezzo e Importo sempre dal DDT quando ci sono (1,35 €/kg × 1,3 kg = 1,76 €), anche con unità diversa; «—» solo se il DDT non ha il prezzo.
4. Carico in un solo gesto senza giacenze sbagliate:
   - Se l'unità del DDT è l'unità di magazzino della riga (melanzane: kg), la riga si prepara già con quantità di magazzino = quantità del DDT (1,3 kg) e prezzo del DDT (1,35 €/kg sulla stessa quantità). Non è più «Da confermare» e «Segna OK tutte le righe» la sistema. «OK» registra allora 2 pz arrivati, 1,3 kg in magazzino e 1,35 €/kg × 1,3 kg: è il percorso già accettato oggi dalla funzione di carico, senza modificarla.
   - Se l'unità del DDT non è né quella d'ordine né quella di magazzino, la riga resta «Da confermare». Nel pannello il cliente indica la quantità di magazzino (stesso campo di oggi) oppure segna «Mancante». «Conferma carico» resta disattivato solo finché c'è una di queste righe. In fondo una frase dice quale riga manca, al posto di un pulsante spento senza spiegazione.
   - Lasciare fuori una riga dal carico richiede di modificare la funzione: resta un'idea separata da approvare.

## Dettagli tecnici

- `src/routes/_authenticated/acquisti.ordini.tsx`: `validateSearch` con `ordine` e `ricevi` (facoltativi).
- `src/components/purchase/purchase-orders-panel.tsx`: la selezione e `receiveOnOpen` si leggono dall'indirizzo; l'apertura fa `navigate`; tolti i due «Torna agli ordini».
- `src/components/purchase/receive-outcomes.ts`:
  - `receiveSheetMoney` usa prezzo e quantità del DDT anche con stato `da_controllare`, con l'importo quando l'unità del prezzo è quella della quantità del DDT;
  - in `baseReceiveDraft` il precompilato `stockQuantity`/`unitCost`/`priceUnitCode`/`priceQuantity` dal DDT solo se l'unità del DDT è uguale a `stockUnitCode` e la riga ha unità diverse;
  - `receiveRowNeedsReview` esclude quel caso;
  - nuova `receiveRowHint(line)` per la frase in italiano semplice.
  - `receivePayload` non cambia.
- `src/components/purchase/receive-goods-panel.tsx`: etichetta e frase sulla riga, pannello compatto (`grid-cols-4`, testo piccolo, altezza massima ridotta).
- Test vitest: precompilato kg da DDT; nessun precompilato con unità DDT ≠ magazzino; `receivePayload` della riga melanzane (2 pz, 1,3 kg, 1,35 €/kg, quantità del prezzo 1,3); Prezzo e Importo con unità diversa; abilitazione di «Conferma carico» dopo «Segna OK tutte»; testi della frase.
- Verifica a 390 px con dati simulati, senza confermare carichi reali.
