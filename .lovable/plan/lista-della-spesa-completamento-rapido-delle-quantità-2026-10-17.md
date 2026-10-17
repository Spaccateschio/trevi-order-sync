# Lista della Spesa — completamento rapido delle quantità

## Cosa cambierà
- Premendo «Genera ordini», le quantità mancanti o non confermate apriranno una finestra di completamento, invece di chiedere di cercare le card nella pagina.
- La finestra prenderà i prodotti dall'intera Lista, anche quelli nascosti da Preferiti, ricerca o altri filtri.
- Ogni riga mostrerà descrizione ben marcata, ultimo conteggio inventario con la sua U.M., giacenza con la sua U.M. quando disponibile, quantità da acquistare e U.M. preimpostata ma modificabile secondo le opzioni già consentite. Un dato inventario assente sarà «—», non zero.
- Ricerca, numero di prodotti da completare, elenco scorrevole e conferma per riga; comando finale «Continua» quando i quantitativi sono stati sistemati. I valori scritti ma non ancora confermati resteranno visibili.
- Confermare 0 significherà «Non acquistare», riutilizzando il comando di esclusione già previsto per quella riga: non verrà inviata una quantità zero a una funzione che accetta solo quantità positive. Anche «Non acquistare» dovrà risultare coerente sulla card e nel riepilogo, non «Quantità mancante».
- Una quantità positiva riuserà il salvataggio atomico esistente della card, con quantità, U.M. e quote secondo le regole attuali. Nessuna conferma o ordine automatico.
- Dopo il completamento si aprirà il riepilogo ordini già esistente. Eventuali problemi di fornitore o ripartizione resteranno distinti dalla quantità mancante.

## Rischio già individuato
Oggi la conferma rifiuta 0 e lo stato «Non acquistare» della valutazione è distinto dall'esclusione nella Lista: nella foto la card mostra contemporaneamente «Non acquistare» e «Quantità mancante». Non basta togliere un blocco grafico. La correzione riuserà i comandi esistenti, senza cancellare quote, modificare ordini o inventare conversioni. Se i controlli del database impediscono questo comportamento, mi fermerò e proporrò un intervento separato prima di modificarli.

## File previsti
- Nuovo `src/components/shopping/missing-quantities-dialog.tsx`: finestra compatta con componenti shadcn/ui.
- `src/components/shopping/shopping-list-panel.tsx`: apertura della finestra, dati dell'intera Lista e riuso della coda di salvataggio.
- `src/components/shopping/shopping-list-card.tsx`: coerenza dello stato e della conferma 0/Non acquistare.
- `src/components/shopping/shopping-quantity-state.ts` e relativo test: distinguere campo vuoto, zero esplicito e quantità positiva.
- `src/components/shopping/generate-orders-dialog.tsx`: accesso al completamento rapido dagli eventuali problemi di quantità del riepilogo, senza cambiare generazione/invio.
- Nuovo `src/components/shopping/missing-quantities.test.ts` ed eventuale piccolo modulo puro omonimo: selezione delle righe da completare indipendente dai filtri.

Nessuna modifica al database, a Inventario, Danea, consegne, prezzi, stati degli ordini, semaforo, guide, `AGENTS.md` o `roadmap.md`. La Fase 2 delle guide resta sospesa.

## Verifiche
- Test: zero esplicito distinto dal vuoto; «Non acquistare» non richiesto come quantità mancante; righe mancanti comprese anche fuori dai filtri; valori positivi ancora soggetti a conferma.
- Anteprima in sola lettura su 3 EMME: apertura, ricerca e disposizione della finestra su telefono e computer. Nessun salvataggio operativo, ordine o invio eseguito dall'assistente.
- Andrea eseguirà il collaudo manuale dei salvataggi e della prosecuzione. Nessuna pubblicazione.