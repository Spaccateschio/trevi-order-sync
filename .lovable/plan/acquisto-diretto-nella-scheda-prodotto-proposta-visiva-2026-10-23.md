# Acquisto diretto nella scheda prodotto — proposta visiva

## Risultato
Una pagina di prova separata riproduce la sezione Acquisto del prodotto, con «Acquisto diretto — compro io» accanto ai fornitori. La scheda operativa resta invariata.

## Proposta
- Mostrare il pulsante «+ Acquisto diretto» vicino a «+ Fornitore».
- Il pulsante aggiunge una voce distinta dai fornitori, con icona e nome «Acquisto diretto — compro io».
- Una stella permette di provare la scelta abituale: una sola scelta abituale alla volta tra acquisto diretto e fornitori. Cambiare scelta non elimina nessun fornitore.
- Consentire di togliere la voce dalla proposta e aggiungerla nuovamente.
- Usare un prodotto e un fornitore inventati; segnalare chiaramente «Anteprima — nessun salvataggio».

## Limiti
Solo prova visiva, con stato locale: nessuna lettura o scrittura di prodotti, liste, ordini, acquisti diretti o giacenze. Nessun fornitore fittizio nel database. Nessuna pubblicazione.
L'impostazione abituale reale e il suo effetto sulla Lista della Spesa saranno progettati e approvati separatamente dopo la valutazione della proposta.

## File autorizzati
- Creare `src/components/products/direct-purchase-mockup.tsx`: proposta interattiva con componenti shadcn e colori esistenti.
- Creare `src/routes/_authenticated/acquisti.acquisto-diretto-anteprima.tsx`: pagina separata con titolo e descrizione specifici, disponibile all'indirizzo `/acquisti/acquisto-diretto-anteprima`.
- Aggiornare `AGENTS.md`: regola di isolamento della proposta dai comandi operativi.
- Non modificare scheda prodotto reale, gestore fornitori, database o roadmap.

## Verifiche
Provare aggiunta, scelta abituale, cambio scelta e rimozione su telefono e computer; verificare che nessuna azione richiami comandi operativi. A fine lavoro indicare file toccati e righe cambiate.