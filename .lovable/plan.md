# Inventario: prodotti in primo piano e scelta Card / Righe

## Problemi da correggere
- Scorrendo, rimangono fissi il riepilogo completo, la descrizione dello stato, i contatori, la ricerca e i filtri: nello schermo allegato occupano troppo spazio rispetto ai prodotti.
- Nel conteggio attuale è presente la griglia di card ma non compare la scelta Card / Righe; non basta cercarla nel menu Colonne.

## Intervento proposto
1. **Parte alta compatta durante lo scorrimento**: il riepilogo completo resta all'inizio della pagina. Scorrendo, resta solo una riga breve con stato e avanzamento, la ricerca e i filtri compatti. Descrizioni e contatori dettagliati non occupano permanentemente lo schermo; eventuali azioni di stato restano raggiungibili.
2. **Scelta Card / Righe sempre visibile** accanto alla ricerca, anche durante lo scorrimento, con due icone riconoscibili e relative etichette accessibili.
3. **Vista Righe realmente utilizzabile**: prodotti disposti in elenco compatto, con nome, fornitore, zona del conteggio, quantità calcolata, quantità fisica, U.M., differenza e conferma. Riutilizzare gli stessi comandi e le stesse protezioni delle card, senza un secondo sistema di salvataggio. Le informazioni facoltative restano governate da Colonne.
4. **Card invariate**: conservare le dimensioni uniformi e il comando «+ zona» appena approvati. Il cambio vista non deve perdere quantità scritte, filtri o selezioni.

## File autorizzati
- `src/components/inventory/inventory-count-panel.tsx`: parte alta, selettore vista e presentazione per righe.
- `roadmap.md`: registrare e chiudere questa sola attività.

## Salvaguardie
Solo presentazione dell'Inventario, in anteprima. Nessuna modifica a database, permessi, conteggi, regole di completamento, preferiti, zone, Lista della Spesa, ordini o consegne. Nessuna pubblicazione e nessun dato di prova scritto.

## Verifica prima del resoconto
- Schermate a 390, 607 e 1280 px, all'inizio e durante lo scorrimento: più spazio ai prodotti, ricerca/filtri e scelta vista raggiungibili, nessun testo sovrapposto.
- Passaggio Card → Righe → Card con filtri attivi, senza scrivere dati operativi.
- Controllo dei comandi di quantità e conferma senza eseguire salvataggi reali.
- Test esistenti pertinenti e verifica degli errori dell'anteprima.
- Resoconto con file e righe modificate, poi attesa del controllo dell'utente.