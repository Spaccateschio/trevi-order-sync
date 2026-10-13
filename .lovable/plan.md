# Inventario: contatori · Prodotti: viste Acquisti/Vendite

Le parti sono due e le faccio una alla volta: prima la A e, dopo il tuo controllo, la B. Lavoro solo in anteprima: nessun dato modificato, nessuna regola del database cambiata, nessuna pubblicazione.

## Cosa esiste già (per non fare doppioni)

- **Inventario**: sopra le card c'è già il riepilogo dell'**intera sessione**: contati su totale, percentuale, confermati, differenze e mancanti. Una quantità 0 confermata conta già come contata. Una bozza (quantità scritta ma non confermata) non conta. Quando non c'è un inventario in corso, il riepilogo non mostra prodotti obbligatori. Manca invece il riepilogo della **vista attuale** (Preferiti/Tutti, ricerca, filtri).
- **Prodotti**: ogni azienda ha già due impostazioni esplicite, «acquista» e «vende». Oggi 3 EMME acquista e basta, Trevi acquista e vende. Le uso al posto di criteri indovinati.
- La scelta delle colonne si salva già per ogni utente e dispositivo.
- I collegamenti ai fornitori e la stella sono già letti dalla pagina. Le U.M. d'acquisto invece no.

## Parte A — Inventario

- Sotto il riepilogo della sessione, che resta invariato, aggiungo una riga «**Vista attuale**»: card da contare, contate, mancanti e percentuale. La riga si basa sulle stesse card che vedi a schermo con Preferiti/Tutti, ricerca e filtri.
- L'unità di misura del conteggio è la **card** (prodotto + fornitore), la stessa usata dal controllo di completamento. Lo scrivo in chiaro: «card».
- Si aggiorna dopo ogni conferma, perché legge gli stessi dati delle card.
- Senza inventario in corso non compare.
- Non cambia quali card fanno parte della sessione, né la chiusura dell'inventario.

## Parte B — Prodotti

- **Selettore «Acquisti | Vendite»**: compare solo se l'azienda acquista e vende (Trevi). Chi acquista soltanto (3 EMME) vede solo Acquisti; chi vende soltanto vede solo Vendite.
- **Vista Acquisti**:
  - Colonne: Codice, Descrizione, Categoria, U.M. magazzino, Fornitori collegati, **U.M. acquisto per fornitore**, Fornitore preferito ★, Prezzo d'acquisto (se c'è).
  - Nuovo filtro «Fornitore».
  - «U.M. Danea» si può attivare dal menu Colonne, ma all'apertura è nascosta.
- **U.M. acquisto per fornitore**:
  - Una sintesi nella cella (per esempio «Trevi: cs, mz · +1»). Toccandola si apre il dettaglio per fornitore, senza aprire la scheda.
  - Fornitori sulla piattaforma: solo le U.M. che il fornitore ha davvero pubblicato, lette dal database con la stessa regola già usata nella Lista della Spesa.
  - Fornitori esterni: le U.M. d'acquisto configurate nel collegamento.
  - Se una U.M. manca compare «Non configurata». Nessuna conversione e nessuna U.M. inventata.
- **Vista Vendite**: U.M. Danea, U.M. vendita, U.M. predefinita, visibilità ai clienti e listini. La gestione delle U.M. di vendita resta com'è oggi.
- **Menu Colonne**: in alto le colonne della vista scelta, sotto «Altre colonne».
- Ricerca, ordinamento, esportazione e stampa continuano a funzionare.
- Le colonne restano gestibili su telefono e tablet.
- La scelta della vista e le colonne vengono ricordate per ogni utente e azienda, con il salvataggio colonne che esiste già: nessuna tabella nuova.
- Permessi invariati: la vista cambia solo cosa vedi, non quello che puoi fare.

## Verifiche

- Test automatici sul conteggio della vista attuale: 0 confermato = contato, bozza = da contare, solo le card della sessione.
- Test sulla scelta della vista: chi acquista soltanto, chi vende soltanto, chi fa entrambe le cose.
- Test sulla sintesi delle U.M.: «Non configurata», B2B solo le U.M. pubblicate.
- Typecheck e build.
- Controlli a schermo su 3 EMME (Acquisti) e Trevi (Acquisti/Vendite) a 390 e 1280 px.
- L'Inventario non ha sessioni aperte dopo l'azzeramento: la parte A la verifico con i test e sul caso «nessun inventario in corso», senza creare inventari di prova.

## Dettagli tecnici

- A: `inventory-count-panel.tsx` (riepilogo) + funzione pura `inventory-view-progress.ts` con test. La riga usa `sessionCards`/righe filtrate già calcolate.
- B: `products-workspace.tsx` + nuovi `products-view.ts` (colonne per vista, test) e `supplier-units-cell.tsx`. Lettura di `product_supplier_link_units` e delle U.M. B2B tramite la funzione di sola lettura già esistente usata dalla Lista. Se non bastasse per tutti i prodotti in una sola chiamata, mi fermo e ti chiedo prima di fare qualunque cosa nel database.
- La vista si salva in `user_grid_preferences` con `grid_key` distinto per vista.
- Le U.M. di conteggio di ALLORO/UOVA restano come sono.
