# Inventario: azzeramento coerente e barra stabile

## Problemi verificati
- «Azzera» nei filtri cancella soltanto le quantità non confermate: quelle confermate restano bloccate. L’altro «Azzera quantità» riapre invece un inventario concluso, con controlli già esistenti.
- Dopo una riapertura, la pagina non aggiorna esplicitamente tutte le letture delle card e conserva le quantità locali: può mostrare valori e blocchi precedenti.
- La barra superiore cambia contenuto e altezza sulla soglia di scorrimento; la sua stessa posizione contribuisce a decidere quando cambiare.

## Correzione proposta
1. Distinguere «Svuota bozze» da «Rifai inventario» nei comandi e nelle conferme. Non trasformare un semplice svuotamento in cancellazione di conteggi confermati.
2. Dopo una riapertura riuscita con azzeramento, annullare i salvataggi locali in attesa, svuotare le quantità locali e rileggere card, avanzamento e bozze prima di dichiarare il successo. In caso di rifiuto mantenere tutto invariato.
3. Stabilizzare la soglia della barra compatta, con margine tra attivazione e disattivazione, evitando cambi ripetuti mentre si scorre verso l’alto. Conservare filtri, ricerca e comandi.

## Limite da rispettare
Su 3 EMME l’ultimo inventario ha già generato un ordine inviato: la protezione esistente impedisce di riaprirlo e cancellarne i conteggi. Resta invariata; mostrare chiaramente il motivo. Non azzerare giacenze, non cancellare lo storico e non modificare ordini o Lista della Spesa.

## File previsti
- `src/components/inventory/inventory-count-panel.tsx`: comandi distinti, aggiornamento dopo riapertura e stabilizzazione della barra.
- `src/lib/inventory-reset.ts` e `src/lib/inventory-reset.test.ts`: decisione condivisa dei comandi e verifica delle letture da aggiornare.
- `src/lib/inventory-scroll.ts` e `src/lib/inventory-scroll.test.ts`: soglia stabile e test delle oscillazioni.
- `src/components/inventory/AGENTS.md` e `AGENTS.md`: regole della correzione.
- `roadmap.md`: soltanto aggiunta e chiusura di questi due interventi, senza modificare le attività precedenti.

## Verifiche
Test mirati su azzeramento riuscito/rifiutato, bozze e protezioni; controllo della pagina autenticata e dello scorrimento su cellulare, senza scritture sui dati operativi. Il collaudo con azzeramento reale resta ad Andrea su dati di prova consentiti.

Nessuna migrazione, modifica SQL, invio o pubblicazione.