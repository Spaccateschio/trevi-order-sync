# Selezione del numero nei campi quantità

## Modifica proposta
- Al primo clic, tocco o ingresso da tastiera in un campo quantità modificabile, evidenziare l'intero numero presente: quello digitato lo sostituisce.
- Applicare lo stesso comportamento alle card della Lista, ai prodotti da valutare e alla finestra «Completa le quantità».
- Lasciare invariati blocco delle card, conferme, salvataggi e U.M.

## File autorizzati
- `src/components/shopping/shopping-list-panel.tsx`: soli eventi di selezione nei tre campi quantità.

## Verifica
- In anteprima 3 EMME, verificare selezione e sostituzione del numero nelle card e nel popup senza confermare o salvare.
- Nessuna modifica a dati, database, ordini, AGENTS.md o roadmap.md; nessuna pubblicazione.

Il pulsante per azzerare tutte le quantità resta separato da questa correzione: non viene aggiunto in questo intervento.