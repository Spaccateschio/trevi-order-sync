# Lista della Spesa: vista Card / Righe e acquisto dello stesso prodotto da più fornitori

Le modifiche fatte per errore alla pagina Inventario sono state annullate. La pagina è tornata com'era, e resta la correzione di «Stampa giacenze».

## Risposte alle tue 8 domande

1. **File reali della Lista della Spesa**: la pagina è `shopping-list-panel.tsx`. La card è `shopping-list-card.tsx` e la finestra «Fornitori e ripartizione» è `supplier-split-dialog.tsx`. La sezione «Prodotti da valutare» (`inventory-to-evaluate.tsx`) non si tocca.
2. **Come si salva oggi il fornitore**: ogni scelta è una **ripartizione** separata, collegata alla riga del prodotto nella Lista. Contiene fornitore, quantità d'acquisto, U.M. d'acquisto (per esempio 3 cs) ed equivalente in U.M. di magazzino. L'equivalente resta vuoto se manca una conversione. Il prodotto non viene mai duplicato.
3. **Cosa fa oggi «Fornitori e ripartizione»**: elenca i fornitori attivi del prodotto. Per ognuno si scrivono quantità e U.M. d'acquisto, e si può salvare o togliere. In alto mostra «Richieste / Assegnate / Da assegnare». Cambiare un fornitore non modifica gli altri.
4. **Più fornitori per lo stesso prodotto**: **sì, è già supportato**, anche con più U.M. per lo stesso fornitore.
5. **Serve duplicare la card?** **No.** Il sistema ha già più assegnazioni sulla stessa riga. Propongo di mostrarle **dentro la stessa card** (e la stessa riga), senza creare una seconda logica.
6. **Quantità totale da acquistare**: è l'obiettivo scritto sulla riga, in U.M. di magazzino (per esempio 20 kg). La suggerita dell'inventario resta separata e non cambia. «Assegnato» somma gli equivalenti dei fornitori. Un'assegnazione senza conversione (per esempio 3 cs senza equivalenza in kg) **non viene sommata né inventata**: compare come «non convertibile».
7. **Dopo, negli Ordini**: quando la Lista è confermata e si generano gli ordini, nasce **un ordine per fornitore**. Ogni ripartizione diventa una riga d'ordine con quantità e U.M. d'acquisto.
8. **Database**: per la ripartizione tra fornitori **nessuna modifica**. Serve solo per il blocco quantità se deve restare dopo il ricaricamento (vedi sotto).

## Cosa costruisco

1. **Selettore «▦ Card | ☷ Righe»** in alto sopra i prodotti della Lista. Scelta ricordata sul dispositivo (`shopping-list-view-mode`), Card come predefinita.
   - Card: il numero per riga si adatta allo spazio reale, **massimo 4**. Su un telefono largo diventano 2 solo se restano leggibili.
   - Righe: su schermo largo `Foto | Codice · Prodotto | Da acquistare | Ripartizione | Azioni`. Su telefono una riga compatta su 3-4 linee.
   - Stessi dati e stessi comandi. Cambiare vista non perde quantità, fornitori, ripartizioni, U.M. o modifiche non confermate.
2. **Riepilogo ripartizione nella card/riga**:

```text
Da acquistare: 20 kg
  Fornitore A   10 kg
  Fornitore B    8 kg
Assegnato 18 kg / 20 kg · Da assegnare 2 kg
```

   Se si supera il totale compare l'avviso in rosso. Nessuna quantità degli altri fornitori cambia da sola.
3. **«+ Aggiungi fornitore»** nella card e nel menu ⋮ apre la **stessa** finestra «Fornitori e ripartizione», già esistente. Non c'è un secondo sistema.
4. **Tasti rapidi +1 +3 +5 +10** con l'U.M. scritta (per esempio «+1 kg»), sulla quantità da acquistare. Nessuna conversione.
5. **Filtro Fornitore**: mostrerà **tutti i fornitori attivi dell'anagrafica**, non solo quelli già scelti.

## Da decidere

**Blocco «Conferma / Sblocca» della quantità da acquistare**: deve restare anche dopo aver ricaricato la pagina o su un altro telefono?
- **Sì** → serve un campo in più nel database sulla riga della Lista. Te lo proporrei a parte, prima di farlo.
- **No** → il blocco vale finché la pagina resta aperta, senza toccare il database.

## Non si tocca

Inventario, «Prodotti da valutare» (salvo il passaggio alla Lista), Fabbisogno, Ordini, Consegne, Carico Merce, semaforo, database.

## Dettagli tecnici

- File: `shopping-list-panel.tsx` (selettore, griglia adattiva, vista righe, filtro da `supplier_records` attivi), `shopping-list-card.tsx` (prop `layout`, riepilogo ripartizione, tasti rapidi, «+ Aggiungi fornitore»).
- Ripartizioni lette dai dati già caricati dal pannello (`shopping_list_item_suppliers`). Si scrive solo attraverso `assign_shopping_list_supplier`, già usato dalla finestra esistente.
- Griglia: `repeat(auto-fill, minmax(max(<min>, (100% - 3 gap)/4), 1fr))`, con card che si compatta sotto i 300 px di larghezza.
