# Correzione etichette nella vista compatta Prodotti

## Obiettivo
Rendere immediatamente chiaro cosa rappresenta ogni dato nella lista mostrata su smartphone e nelle finestre strette.

## Modifica proposta
- Aggiungere una riga d’intestazione compatta sopra l’elenco con **Codice / Descrizione** e **Listino 1**.
- Nella riga secondaria di ogni prodotto mostrare le etichette **Categoria** e **U.M. Danea** accanto ai rispettivi valori.
- Mantenere invariati selezione, apertura del dettaglio, prezzi, filtri, griglia desktop e dati.
- Conservare la disposizione attuale su smartphone, evitando sovrapposizioni e testo tagliato.

## File interessato
- `src/components/products/product-mobile-list.tsx`

## Verifica
- Controllo visivo a 605 px, come nella schermata inviata.
- Controllo smartphone a 390 px.
- Verifica compilazione e apertura del dettaglio prodotto.
