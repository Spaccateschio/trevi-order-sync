# Stampa dei soli prodotti selezionati

## Problema verificato
La selezione funziona: il foglio contiene i quattro prodotti richiesti. Le regole di stampa nascondono il resto della pagina senza eliminarne lo spazio; quello spazio viene impaginato come pagine vuote. Non occorre cambiare la selezione dei prodotti.

## Intervento proposto
- Separare l'elenco stampabile dalla pagina normale durante la stampa, senza lasciare spazio per elenco, navigazione o scheda prodotto.
- Conservare prodotti selezionati, colonne visibili e ordine attuale.
- Applicare le regole soltanto alla stampa Prodotti, senza interferire con Inventario o Lista della Spesa.

## File previsti
- `src/components/products/products-workspace.tsx`: collocazione separata dell'elenco stampabile e attivazione delle regole specifiche.
- `src/styles.css`: regole di stampa dedicate, senza spazio residuo della pagina.
- `src/components/products/AGENTS.md`: regola di isolamento della stampa Prodotti.

## Verifica
Controllare con dati fittizi che quattro prodotti e le colonne mostrate occupino una sola pagina; verificare anche un elenco lungo su più pagine e il ritorno alla schermata normale dopo la stampa. Nessuna modifica ai dati aziendali, nessun invio, nessuna pubblicazione; roadmap invariata.