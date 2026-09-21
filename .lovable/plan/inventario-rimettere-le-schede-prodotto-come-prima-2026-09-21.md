# Inventario: rimettere le schede prodotto come prima

Niente è stato cancellato: la schermata di conteggio con le schede (foto, codice, U.M., quantità calcolata, quantità fisica, differenza, Conferma, +1 +3 +5 +10, "Conferma visibili invariati") e la **nota obbligatoria quando la quantità è superiore o inferiore** a quella calcolata sono ancora tutte nel programma. Compaiono solo quando c'è un conteggio aperto **e** quando la tua azienda ha dei prodotti: 3 EMME oggi ha 0 prodotti propri, quindi la pagina resta vuota.

## Cosa faccio

1. **Trasformo i 6 articoli già stellati sul catalogo di trevi in prodotti di 3 EMME** (0246, 0247, 0255, 0312, 0433, 1043), collegati alla referenza del fornitore. Nessuna anagrafica doppia: si usa la stessa funzione che usa la stella da adesso in poi.
2. **Conteggio senza conteggio aperto**: al posto dell'elenco a righe semplice mostro le stesse schede di prima (foto, nome, `Cod. · U.M.`, categoria, badge "Mai contato"), in sola lettura, con sopra l'invito ad avviare il conteggio. Premendo "Nuovo conteggio" quelle stesse schede diventano contabili con i campi e i pulsanti rapidi.
3. **Nota sulle differenze**: resta com'era — appena la quantità fisica è maggiore o minore della calcolata si apre la finestra con calcolata / fisica / differenza, la motivazione obbligatoria e le scorciatoie (Merce deteriorata, Errore di carico, Reso al fornitore, Uso interno).

## Dettagli tecnici

- Conversione preferiti → prodotti propri: chiamate a `add_catalog_product_to_own_products` (già idempotente) per i 6 preferiti di 3 EMME. Nessuna migrazione, nessuna nuova tabella.
- `inventory-count-panel.tsx`: la sezione senza `sessionId` riusa lo stesso markup della scheda prodotto (variante in sola lettura) invece della lista `<ul>` attuale; immagini via `getProductImageUrls`.
- Nessuna modifica a formule di giacenza/fabbisogno, permessi, RPC o database.

## Fuori scope

FASE A/B/C/D, nuovo componente grafico condiviso dell'elenco prodotti, listini e U.M.
