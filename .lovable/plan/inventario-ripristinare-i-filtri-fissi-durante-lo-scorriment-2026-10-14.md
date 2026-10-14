# Inventario: ripristinare i filtri fissi durante lo scorrimento

## Problema individuato
La barra che resta in alto contiene la ricerca rapida, ma i filtri sono rimasti soltanto nella parte della pagina che scorre. Per questo scompaiono quando si scende tra i prodotti.

## Intervento proposto
- Ripristinare accanto alla ricerca fissa gli stessi comandi già presenti: Preferiti/Tutti, Azzera, Tutti gli stati, Altri stati, Zona abituale, Filtri, Colonne e Stampa.
- Usare gli stessi comandi e valori nelle due posizioni, senza modificare il comportamento dei filtri.
- Mantenere la disposizione compatta, con comandi su più righe quando lo spazio è ridotto.

## File autorizzati
- `src/components/inventory/inventory-count-panel.tsx`: solo presentazione della barra e riuso degli stessi controlli.
- `roadmap.md`: annotare e chiudere esclusivamente questa correzione.

## Salvaguardie
Nessuna modifica a quantità, card, zone, riepiloghi, regole di chiusura, permessi, database, Lista della Spesa o ordini. Solo anteprima, nessuna pubblicazione.

## Verifiche
- Scorrere l'Inventario e verificare che ricerca e filtri restino visibili insieme.
- Provare un filtro dalla barra fissa e verificare che l'elenco si aggiorni.
- Controllare spazio e leggibilità su schermo stretto e computer, senza scrivere conteggi o dati di prova.
- Controllare gli errori dell'anteprima e riportare file e righe modificate.

## Dettaglio tecnico
Riutilizzare lo stesso gruppo di controlli nel blocco `compactBar` e nella barra iniziale, evitando due implementazioni divergenti.