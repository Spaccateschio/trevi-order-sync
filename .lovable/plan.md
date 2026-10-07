# Correzione del solo banner in Ordini fornitore

- Testo corto fermo e allineato a sinistra; testo lungo in ingresso dal bordo destro e in uscita dal bordo sinistro, senza sovrapporsi alle icone.
- Velocità costante di 60 px/s, aggiornata al ridimensionamento; pausa al passaggio del mouse e durante il tocco prolungato.
- Movimento ridotto: testo fermo con puntini di sospensione.
- Nessun riquadro scuro sul testo; focus-visible mantenuto su ✕ e +N. Freccia ed elenco invariati.
- Prova a schermo con testo corto/lungo, finestra smartphone, pausa e movimento ridotto; dati di prova solo nel browser, nessun ordine modificato.

## File autorizzati e dettagli tecnici
- `src/components/purchase/sent-orders-banner.tsx`: modalità dedicata alla pagina Ordini, misurazione con ResizeObserver di contenitore e testo, variabili --from/--to/durata, gestione della pausa.
- `src/routes/_authenticated/acquisti.ordini.tsx`: attivazione della modalità corretta solo qui.
- `src/styles.css`: regole specifiche della nuova modalità; animazione attuale degli altri banner invariata.

Nessuna modifica a database, ordini, Inventario, Lista della Spesa o altre funzionalità.