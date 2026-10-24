# Pannello fisso a destra anche in Clienti e Fornitori

## Cosa cambia per te

Nelle pagine **Clienti** (Vendite) e **Fornitori** (Acquisti), sui monitor grandi (da 1280 px in su):

- La scheda del cliente/fornitore si apre in un **pannello fisso a destra**, come nella pagina Prodotti: l'elenco resta sempre attivo a sinistra, senza oscuramenti.
- Il clic su una riga **evidenzia** il cliente/fornitore e aggiorna subito la scheda a destra.
- Con le **frecce ↑/↓ della tastiera** scorri da un cliente/fornitore all'altro velocemente; la scheda a destra segue il movimento.
- Il **tab aperto** (es. Dettagli, Destinazioni, Prodotti forniti) resta quello quando cambi riga.
- Il pulsante **×** chiude il pannello e torna all'invito «Seleziona un cliente/fornitore».
- Su **telefono e tablet** (sotto 1280 px) tutto resta com'è ora: la scheda si apre in finestra al centro.

## Cosa NON cambia

- Le **caselle di spunta** per selezionare più clienti/fornitori (esportazione, eliminazione multipla) restano separate: la spunta seleziona per le azioni di gruppo, il clic sulla riga apre la scheda.
- Il pulsante **«Nuovo cliente» / «Nuovo fornitore»** continua ad aprire la finestra al centro (è una creazione, non una consultazione).
- Il menu ⋮ di ogni riga (Dettagli, Elimina, ecc.) resta invariato.
- Nessuna modifica al database, nessuna pubblicazione, roadmap.md invariato.

## Dettagli tecnici

- `src/components/companies/customer-records-panel.tsx` (1585 righe): estrarre il contenuto del Dialog «Dettagli cliente» in un componente riutilizzabile; su ≥1280 px renderizzarlo in un pannello laterale affiancato all'elenco (stesso approccio di `product-detail-panel.tsx`), sotto soglia mantenere il Dialog attuale.
- `src/components/companies/supplier-records-panel.tsx` (1135 righe): stessa lavorazione.
- Stato di selezione riga + navigazione da tastiera: logica pura di riga adiacente (pattern già usato in `product-grid.tsx` / `products-workspace.tsx`): frecce ↑/↓ si muovono nell'elenco filtrato/ordinato visibile, ignorano i campi di input (quando si scrive in un campo, le frecce restano al campo).
- Il contenuto della scheda (tab, campi, salvataggio) resta identico: cambia solo **dove** viene mostrato su schermo grande.
- Aggiornare `src/components/companies/AGENTS.md` (se esiste) o quello più vicino con la nuova regola di presentazione.

## Verifica

- Prova automatica con Playwright su dati fittizi: apertura pannello, cambio riga con clic, frecce ↑/↓, tab che resta, chiusura con ×, vista stretta (dialogo classico), spunte multiple ancora funzionanti.
- Collaudo manuale su 3 EMME lasciato ad Andrea.
