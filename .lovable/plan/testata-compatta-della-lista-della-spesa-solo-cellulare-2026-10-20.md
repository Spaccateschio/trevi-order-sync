# Testata compatta della Lista della Spesa — solo cellulare

## Cosa cambia (solo sotto 768 px)
Testata della Lista vera, sul modello dell'anteprima approvata:
1. **Da inventario + stato + data** in due righe: «Serve Lun 19/10 · contati · non acquistare». Accanto ci sono i **3 puntini**, con le viste Card/Righe e «Cambia per quando serve».
2. **Riga che scorre di lato** con Bozze, Storico liste, Nuova lista e Annulla lista. Sono gli stessi tasti di oggi, cambia solo dove stanno.
3. **Cerca prodotto**, poi **Preferiti / Tutti** e il tasto **giallo oro con i 3 puntini**, che apre gli stessi filtri di oggi. Questo blocco resta fisso in alto.
4. Il riquadro «Preparazione Lista della Spesa» e il selettore «Vista prodotti» non compaiono più sul cellulare. Le viste passano nei 3 puntini. L'orario di preparazione resta raggiungibile da «Genera ordini» nella barra in basso, che già esiste: si apre la stessa finestra di oggi, senza nuove regole.
5. Il riepilogo «Prodotti · Preferiti · In Lista…» diventa una riga piccola.

## Cosa non cambia
- Tablet e computer: tutto come oggi.
- Gli stessi comandi, filtri, dati e salvataggi. Nessuna modifica al database, nessuna pubblicazione.
- Card, ricerca e finestra «Completa le quantità» restano invariate.

## Dettagli tecnici
- `src/components/shopping/shopping-list-panel.tsx` (zona righe ~1340–1730): ramo `isMobile` (<768) che rende le parti mobili riusando gli stessi gestori e lo stesso stato. Il ramo desktop resta identico.
- Nuovo `src/components/shopping/shopping-mobile-header.tsx`: solo presentazione, riceve i comandi esistenti come proprietà.
- Orario di preparazione: si apre dal comando esistente usato oggi dal riquadro, raggiunto dalla barra «Genera ordini».
- Prova in Playwright: iPhone 393 px, tablet 768 px e computer 1280 px, con confronto prima/dopo. Durante la prova non si fanno scritture.
- Aggiornare la nota in `src/components/shopping/AGENTS.md`.
