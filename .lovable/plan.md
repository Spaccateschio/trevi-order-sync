# Elenco prodotti uguale in Inventario, Lista della spesa e Catalogo cliente

## Obiettivo
Lo stesso elenco prodotti che vedi in Prodotti (foto, codice, descrizione, categoria, U.M., prezzo) deve comparire anche dove oggi manca o è diverso: nell'inventario, nella lista della spesa e nel catalogo che vede il cliente.

## Situazione attuale
- Prodotti (venditore): elenco completo con foto, codice, descrizione, categoria, U.M. e prezzo.
- Inventario → conteggio: card con foto e codice, ma senza categoria, U.M. e prezzo mostrati in modo uniforme.
- Lista della spesa: per aggiungere un prodotto c'è solo un menu a tendina con codice e descrizione, senza foto.
- Catalogo cliente: tabella senza foto del prodotto.

## Cosa faccio
1. Creo un unico elenco prodotti riusabile (foto, codice, descrizione, categoria, U.M., prezzo) con ricerca, con la stessa resa su smartphone e desktop.
2. Lista della spesa: sostituisco il menu a tendina con questo elenco sfogliabile e cercabile; scegli il prodotto, metti la quantità e lo aggiungi.
3. Inventario → conteggio: allineo le card del conteggio allo stesso elenco, aggiungendo categoria e U.M. accanto alla foto (il campo quantità e la conferma restano identici).
4. Catalogo cliente: aggiungo la foto del prodotto alle righe, mantenendo prezzo e scelta dell'unità già presenti.

## Regole rispettate
- Nessun nuovo elenco prodotti parallelo: si leggono sempre gli stessi prodotti dell'anagrafica.
- Nessuna modifica a database, permessi o logiche di calcolo (giacenze, fabbisogno, prezzi).
- Le foto arrivano dalle immagini già caricate sul prodotto; dove manca l'immagine resta il segnaposto.

## Fuori scope
- Nuove colonne calcolate (giacenza, fabbisogno) dentro questi elenchi.
- Modifiche ai listini o alle unità di misura.
