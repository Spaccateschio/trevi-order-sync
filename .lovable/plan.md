# Preparazione — prima il mockup

## Obiettivo
Sostituire il segnaposto attuale di `/operativo` con una pagina Preparazione interattiva, usando esclusivamente ordini, clienti e preparatori inventati, chiaramente indicati come dimostrativi.

## Cosa potrai provare
1. Elenco ordini con cliente, data, note e stato: da preparare, in lavorazione, pronti. Ricerca e filtri.
2. Apertura dell'ordine con prodotti, immagini disponibili, quantità richiesta e relativa U.M., quantità preparata e peso effettivo distinti.
3. Inserimento manuale dei valori, conferma esplicita per riga e correzione; segnalazione di un prodotto mancante senza sostituirlo automaticamente.
4. Scelta del preparatore e avanzamento per ordine, simulati nella pagina; riepilogo prima di segnare un ordine pronto.
5. Esempio dimostrativo del dialogo vocale: proposta del peso → conferma o correzione, senza attivare microfono o servizi AI.
6. Guida ⓘ della pagina, coerente con le guide esistenti.

## Limiti e rischi già individuati
- Oggi Preparazione è soltanto un segnaposto: non esistono salvataggio dei pesi o gestione del lavoro simultaneo.
- Il mockup non prova la collaborazione tra più preparatori: serviranno controlli dedicati nella successiva fase con dati reali.
- Nessun peso viene inviato a Danea; quel collegamento sarà pianificato separatamente, senza modificare ordini già scaricati.
- Nessuna scrittura nei dati aziendali, nessuna comunicazione reale, nessuna pubblicazione. Le modifiche dimostrative si perdono ricaricando la pagina.
- Lista della Spesa, Inventario, Ordini, Consegne, Carico Merce e Danea restano invariati.

## File previsti e dettagli tecnici
- `src/routes/_authenticated/operativo.tsx`: collegamento del mockup, titolo Preparazione e metadati specifici; conservare i controlli di accesso esistenti.
- `src/components/preparation/preparation-demo-data.ts`: dati inventati, tipi e regole pure della simulazione.
- `src/components/preparation/preparation-mockup.tsx`: schermata e finestre interattive con shadcn/ui, token e immagini già disponibili nel progetto.
- `src/components/preparation/preparation-demo-data.test.ts`: test per conferma esplicita dei pesi, quantità/U.M. separate e completamento coerente delle righe.
- `src/lib/guides/preparation-guide.ts`: guida dimostrativa con il sistema già presente, dopo lettura delle istruzioni locali.
- `AGENTS.md`: regola tecnica di isolamento dei mockup dai dati operativi.
- `roadmap.md`: avanzamento del lavoro approvato.

## Verifiche
Test delle regole dimostrative; apertura, selezione ordine, modifica e conferma di una riga, riepilogo e completamento nel mockup; verifica della guida, dei controlli di accesso e dell'impaginazione su telefono e computer. Nel riepilogo finale indicare file toccati e righe cambiate.

## Conferma richiesta
Approvare solo questo mockup. La fase con dati reali richiederà un nuovo piano e una nuova conferma.