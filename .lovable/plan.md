# Ripristinare il riferimento all’ordine nella Lista della Spesa

## Diagnosi verificata
La pagina si apre senza errori, ma appare vuota: i controlli e il riquadro inventario sono stati nascosti mentre c’è un ordine in attesa di ritiro. L’avviso ORD, invece, mostra soltanto gli ordini inviati nelle ultime 12 ore: trascorso quel tempo scompare anche lui. Le due condizioni non sono coerenti.

## Correzione proposta
- Nella sola Lista della Spesa, mantenere visibile l’avviso degli ordini inviati o parzialmente consegnati fino alla conferma del ritiro, senza scadenza di 12 ore.
- In questa modalità l’avviso non sarà chiudibile, per non lasciare nuovamente la pagina senza il riferimento ORD.
- Conservare il comportamento attuale dell’avviso nelle altre pagine.
- Lasciare nascosti il testo già rimosso e il riquadro inventario, che resta riapribile; non creare liste né modificare prodotti o ordini.

## File autorizzati per l’intervento
- `src/components/purchase/sent-orders-banner.tsx`: modalità di visualizzazione fino al ritiro.
- `src/routes/_authenticated/acquisti.lista-spesa.tsx`: attivazione della modalità soltanto nella Lista della Spesa.
- `src/components/purchase/sent-orders-banner-state.ts`: regole condivise della modalità.
- `src/components/purchase/sent-orders-banner-state.test.ts`: test degli ordini pendenti senza scadenza e del comportamento precedente nelle altre pagine.
- `AGENTS.md`: documentazione della modalità condivisa.

## Verifica e limiti
Verifica in sola lettura nell’anteprima sul cellulare e sul computer; nessuna conferma di ritiro, creazione lista, invio o modifica di dati reali. Nessuna migrazione, pubblicazione o modifica di roadmap.md.
