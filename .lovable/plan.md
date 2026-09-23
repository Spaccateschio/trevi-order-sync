# Inventario: icona prezzo con confronto costo pagato / costo odierno

Idea valida e la faccio: sotto la quantità calcolata (0,00) di ogni scheda/riga compare una piccola icona € cliccabile (e con tooltip al passaggio del mouse) che apre un riquadro con i prezzi. Tutto in sola lettura: nessun prezzo viene creato, modificato o copiato.

## Cosa mostra il riquadro

1. **Costo della giacenza** — quanto abbiamo pagato davvero la merce ancora in magazzino (media ponderata sulle quantità dei lotti ancora disponibili). Vuoto finché non c'è una ricevuta merce confermata.
2. **Costo odierno del fornitore** — l'ultimo costo valido: costo impostato a mano sul collegamento fornitore, costo arrivato da Danea, oppure prezzo del listino che il fornitore B2B ci ha assegnato. Indico sempre da dove arriva e la data.
3. **Confronto**: freccia in alto rossa se il costo odierno è più alto di quello pagato, freccia in basso verde se è più basso, uguale giallo ocra se identico (o entro l'1%). Accanto, differenza in euro e in percentuale.
4. Quando manca uno dei due numeri: icona € spenta e testo "Costo non disponibile — impostalo nella scheda prodotto → Acquisto", con collegamento rapido.

L'icona resta piccola e discreta, stessa resa su computer e smartphone (tap invece di passaggio mouse).

## Da dove arrivano i prezzi

- **Danea**: costo fornitore già importato con i prodotti.
- **Fornitore B2B**: prezzo del listino assegnato alla nostra azienda.
- **Collegamento fornitore**: costo inserito a mano.
- **Ricevuta merce**: costo effettivamente pagato sui lotti, quindi anche quello nato da un ordine dichiarato dal fornitore tramite il link esterno (il form che compila chi non è iscritto), una volta confermata la ricevuta.

## Cosa manca / mie note

- Il **form del fornitore esterno oggi chiede quantità, non prezzi**: se vuoi che il costo pagato si aggiorni anche da lì, serve aggiungere il campo prezzo su quella pagina. È un lavoro a parte: dimmi se lo vuoi e lo pianifico dopo.
- Serve un **piccolo storico dei costi** per dire "prezzo precedente": oggi il costo fornitore viene sovrascritto. In questa fase confronto costo pagato ↔ costo odierno, che è il confronto utile; uno storico completo dei prezzi nel tempo (con grafico) è un passo successivo.
- I prezzi vanno **riportati all'unità della giacenza** quando il fornitore vende in cassa/collo: uso il fattore di conversione già presente sul collegamento; se manca, segnalo "unità diversa" invece di mostrare un numero sbagliato.
- IVA: mostro il **netto** (costo di acquisto imponibile), coerente con il resto dell'app.

## Dettagli tecnici

- Nuovo componente `product-cost-popover.tsx` in `src/components/inventory/`, usato da `ProductCard` (conteggio) e dalla riga/tabella del Fabbisogno.
- Una query per azienda+archivio che raccoglie: `stock_lots` disponibili (`unit_cost`, quantità) per la media ponderata; `product_supplier_links` (`manual_cost`, `manual_cost_at`, `conversion_factor`, preferito/priorità); `product_supplier_costs` (costo Danea); prezzo listino B2B tramite la RPC esistente `buyer_catalog_prices`.
- Colori e frecce dai token esistenti in `src/styles.css` (rosso destructive, verde, giallo ocra del tema); nessun colore fisso.
- Nessuna migrazione, nessuna nuova tabella, nessuna modifica a RPC, RLS, formule di giacenza/fabbisogno, Lista della Spesa o ordini.

## Fuori scope

Modifica dei prezzi dall'inventario, campo prezzo nel form del fornitore esterno, storico prezzi con grafico, valorizzazione totale di magazzino.
