# Selezione prodotto e navigazione con le frecce

## Risultato
- Nella pagina Prodotti, il prodotto aperto ha la riga chiaramente evidenziata, senza spuntare la casella di selezione multipla.
- Sui monitor grandi, dopo il clic sulla riga, ↑ e ↓ aprono subito il prodotto precedente o successivo nel pannello a destra.
- Il tab attivo (Prodotto, Vendita, Acquisto o Inventario) rimane lo stesso.
- La riga attiva resta visibile scorrendo l'elenco; raggiunto il confine di una pagina si prosegue nella precedente o successiva, rispettando filtri e ordinamento.
- Le frecce non interferiscono con la ricerca, i campi modificabili o altri comandi. Telefono e tablet mantengono il comportamento attuale.

## Intervento
Solo presentazione e selezione temporanea nella pagina reale, senza nuove pagine, salvataggi di preferenze, modifiche ai prodotti o pubblicazione.

## File previsti e dettagli tecnici
- `src/components/products/product-grid.tsx`: evidenziazione del prodotto aperto, focus sulla riga e gestione delle frecce limitata all'elenco desktop; scorrimento della riga attiva.
- `src/components/products/products-workspace.tsx`: passaggio del prodotto attivo alla griglia e cambio prodotto/pagina, senza modificare il tab del pannello.
- `src/components/products/product-row-navigation.ts`: piccolo calcolo puro del prodotto precedente/successivo e dei limiti dell'elenco.
- `src/components/products/product-row-navigation.test.ts`: prove per ordine filtrato, estremi e passaggio di pagina.
- `src/components/products/AGENTS.md` e `AGENTS.md`: regola della navigazione locale, distinta dalla selezione multipla.

## Verifica
Eseguire le prove mirate e controllare evidenziazione, ↑/↓, tab invariato, scorrimento e passaggio di pagina. Le verifiche visive useranno dati fittizi isolati, senza operazioni su Trevi o altre aziende reali; il collaudo con dati reali resta ad Andrea su 3 EMME.