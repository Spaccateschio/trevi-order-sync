# Pannello prodotto sempre attivo su computer

## Obiettivo
Su computer (≥1280 px) la scheda prodotto non è più una finestra che copre e oscura l'elenco: resta un pannello fisso a destra, sempre visibile. L'elenco a sinistra resta attivo e il clic su una riga aggiorna subito la scheda. Su smartphone e tablet tutto resta come oggi (scheda a tutto schermo).

## Comportamento richiesto (confermato da Andrea)
- Pannello destro **sempre visibile** su computer, dall'apertura della pagina: senza prodotto selezionato mostra un invito «Seleziona un prodotto».
- L'elenco a sinistra non si disattiva mai su computer: niente overlay oscurato.
- Clic su una riga → la scheda si aggiorna; clic su un'altra riga → passa direttamente a quel prodotto, senza chiusure intermedie.
- Pulsante × sul pannello per chiudere la scheda: torna al messaggio «Seleziona un prodotto».
- Smartphone e tablet (<1280 px): resta la Sheet a tutto schermo attuale, aperta dal clic sulla riga.

## Fasi
1. **Proposta visiva (mockup)** — pagina di prova separata `/acquisti/pannello-prodotto-anteprima` con dati finti: layout a due colonne, pannello sempre visibile, selezione delle righe con stato locale, pulsante ×. Nessuna scrittura.
2. **Collegamento alla pagina reale** — dopo l'approvazione del mockup, applicare il layout nella pagina Prodotti reale (Vendite e Acquisti) solo per deviceClass "desktop".
3. **Verifiche** — Playwright: apertura pagina, clic su riga → pannello aggiornato, clic su altra riga → cambio diretto, × → messaggio di invito; su viewport <1280 px resta la Sheet. Collaudo reale di Andrea su 3 EMME.

## Dettagli tecnici
- File toccati: `src/components/products/products-workspace.tsx` (layout a due colonne per desktop), nuovo componente `src/components/products/product-detail-panel.tsx` (versione non modale di `product-detail-sheet.tsx`, stessa scheda con i 4 tab), pagina mockup `src/routes/_authenticated/acquisti.pannello-prodotto-anteprima.tsx`, `src/components/products/AGENTS.md`.
- `ProductDetailContent` viene riusato: il pannello è lo stesso contenuto della Sheet attuale, senza Radix Sheet ma in un contenitore scrollabile con intestazione e ×.
- La larghezza dell'elenco si riduce per fare posto (pannello ~560–960 px in base allo spazio); la griglia mantiene le preferenze colonne esistenti.
- `sheetOnly` (apertura dall'Inventario) resta invariata: continua a usare la Sheet.

## Vincoli
- Nessuna modifica al database, a ordini, giacenze, Danea o `roadmap.md`; nessuna pubblicazione; nessun invio.
- Nessun codice esistente eliminato se non il necessario al nuovo layout desktop.
- Collaudo solo su 3 EMME ROMA SRL.
