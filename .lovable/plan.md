# Ciclo chiuso = pagine pulite + storici a un click

## Regola
Quando la Lista è chiusa e il semaforo è verde (o arancione), il ciclo è finito:
- **Inventario**: nessuna quantità del ciclo precedente nelle card. Le card mostrano solo il prodotto, con il campo vuoto da contare. In alto c'è un riquadro: «Ultimo inventario: 02/10/2026 alle 07:30, fatto da Mario — Visualizza storico».
- **Lista della Spesa**: vuota, con il messaggio «Nessuna lista in corso — l'ultima (LS-000001) è stata chiusa il 02/10 — Storico liste».
- **Semaforo rosso** (Lista ancora aperta): il lavoro a metà resta visibile, con l'avviso «Lavoro iniziato il 02/10 da Mario: continua o completa».

I dati non vengono cancellati: giacenze, conteggi e liste chiuse restano nello storico. Cambia solo cosa si vede.

## Storici a un click
- **Inventario**: pulsante «Storico inventari», che apre l'elenco dei conteggi chiusi con data, autore e quantità (in sola lettura, stampabile).
- **Lista**: resta «Storico liste», già esistente.

## Pagina Ricezione ordini
Nuova voce Acquisti → «Ricezione ordini», con gli ordini inviati in attesa di consegna. Per ognuno: fornitore, numero, data e fascia di consegna, prodotti ordinati e il pulsante per registrare cosa è arrivato. Questo riusa il Carico Merce esistente, senza crearne un secondo.

## Cosa non cambia
Lista della Spesa (logica di chiusura), ordini, semaforo, giacenze, Carico Merce (regole).

## Dettagli tecnici
- inventory-count-panel.tsx: quando non c'è una sessione aperta e il ciclo non è rosso, non passare stockHistory alle card. Aggiungere un banner con l'ultima sessione chiusa (data, autore) e un dialog «Storico inventari» basato su inventory_count_history.
- shopping-list-panel.tsx: il banner vuoto con l'ultima LS chiusa c'è già in parte; va completato con data e autore.
- Nuova route /acquisti/ricezione-ordini: elenco da purchase_order_overview filtrato su send_status=inviato e status non consegnato/chiuso; link al Carico Merce dell'ordine.
