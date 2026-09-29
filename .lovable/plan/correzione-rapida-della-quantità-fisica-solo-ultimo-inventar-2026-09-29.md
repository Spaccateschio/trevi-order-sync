# Correzione rapida della quantità fisica (solo ultimo inventario chiuso)

## Come funzionerà
1. Nella pagina Inventario, dopo la chiusura, ogni prodotto mostra la **Quantità fisica attuale** come valore principale (conteggio + eventuali correzioni successive), con sotto «Contato il 28/09: 5 cs».
2. Pulsante in alto **«Sblocca quantità»** (tutti gli articoli) e piccola icona matita su ogni riga (singolo articolo).
3. Sbloccato, il campo diventa modificabile: scrivi 6 e premi Invio/esci dal campo → salvato subito, **senza motivazione obbligatoria**.
4. Il valore si aggiorna immediatamente per tutti: se un collega apre la pagina (o ce l'ha già aperta) vede 6, e può a sua volta correggerlo. Ogni correzione successiva parte dall'ultimo valore.
5. Sotto il campo compare «Modificato da Mario alle 08:15» e un link **«Cronologia»** con tutte le modifiche (chi, quando, da→a).
6. **Motivazione obbligatoria solo per le perdite reali**: se la nuova quantità è diversa dalla giacenza che il magazzino si aspettava (es. risultano 10, scrivo 5), resta obbligatoria la nota come già avviene nella conferma dell'inventario. Le semplici correzioni di errori di battitura tra colleghi non la chiedono.
7. Solo l'ultimo inventario chiuso è correggibile; lo storico «Visualizza inventario» resta com'è, in sola lettura.
8. Il semaforo e la Lista della Spesa non cambiano; resta l'avviso «Ricontrolla la quantità da acquistare».

## Da confermare
- Chi può correggere: tutti i collaboratori o solo amministratori? (oggi solo amministratori)

## Dettagli tecnici
- Nessuna modifica al database: la correzione usa la rettifica esistente (riferita all'ultimo conteggio) calcolando la differenza rispetto alla quantità fisica attuale; quando il motivo non è richiesto viene salvato automaticamente «Correzione quantità fisica».
- Aggiornamento immediato: rilettura dei dati dopo il salvataggio + aggiornamento automatico periodico/al ritorno sulla pagina (senza nuove tabelle o canali).
- File toccati: `inventory-count-panel.tsx`, `inventory-session-counter.tsx` (solo la vista principale, non lo storico).
- Nessun dato reale creato nei test.
