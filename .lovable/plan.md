# Genera ordini apre il riepilogo

## Problema individuato
Il comando «Genera ordini» apre automaticamente «Completa le quantità» quando trova prodotti da completare. Inoltre la finestra ordini può iniziare dall'avviso anziché dal riepilogo. Lo sblocco individuale aggiunto prima non corregge questi due passaggi.

## Correzione in anteprima
- «Genera ordini» apre direttamente il riepilogo con fornitori, prodotti, acquisti diretti e articoli «Non acquistare» con «Riprendi».
- Le quantità mancanti restano segnalate nel riepilogo, senza aprire automaticamente la modifica.
- Dal riepilogo si sceglie se modificare il solo articolo con il lucchetto oppure aprire «Sistema tutte le quantità mancanti».
- «Riprendi» resta limitato al prodotto scelto e lo apre subito modificabile.
- Nessun numero scritto viene salvato o confermato automaticamente; i prodotti non pronti non vengono ordinati e i controlli esistenti di generazione restano attivi.

## File autorizzati
- `src/components/shopping/shopping-list-panel.tsx`: togliere la deviazione automatica al completamento, mantenendo la protezione dei numeri scritti non confermati.
- `src/components/shopping/generate-orders-dialog.tsx`: avvio dal riepilogo e comandi individuali/collettivi accessibili nella sezione dei prodotti non pronti.
- `src/components/shopping/shopping-list-ready-state.ts` e `shopping-list-ready-state.test.ts`: verifica mirata della scelta iniziale del riepilogo, anche con quantità mancanti.
- `src/components/shopping/AGENTS.md`: documentare il percorso iniziale senza cambiare i salvataggi.

## Verifiche
Prova isolata su cellulare e computer: ingresso nel riepilogo con un prodotto mancante, «Riprendi» individuale, completamento collettivo solo su richiesta e conservazione dei numeri non confermati. Test mirati e controllo degli errori dell'anteprima.

Nessuna modifica di dati reali, database, ordini, ritiri, avviso ORD o `roadmap.md`; nessuna pubblicazione.