# Preparazione: collegamento agli ordini reali

## Risultato
La pagina Preparazione conserva il mockup approvato: prima le card per nome cliente, poi, al click, l'ordine con i prodotti. Quantità, pesi confermati, preparatore e avanzamento restano salvati anche uscendo dalla pagina. Stampa singola e multipla disponibili sui dati reali.

## Fase 1 — Preparazione e stampa
- Mostrare esclusivamente gli ordini ricevuti dall'azienda autorizzata, con cliente, numero, consegna, indirizzo, note e stato; mantenere ricerca e filtri.
- Nel dettaglio distinguere quantità richiesta, quantità preparata nella stessa U.M. e peso effettivo in kg. Nessuna equivalenza automatica fra casse, mazzi e chili.
- Salvare soltanto con conferma esplicita; quantità positiva per una riga preparata, peso positivo quando inserito, «Mancante» separato da una quantità zero. Il peso resta facoltativo per la registrazione della preparazione.
- Preparatore scelto fra amministratori e operatori attivi dell'azienda. Registrare anche chi esegue realmente ciascuna conferma e quando.
- Più preparatori possono lavorare su righe diverse: se qualcuno modifica nel frattempo la stessa riga, rifiutare la sovrascrittura e chiedere di ricaricarla. Applicare lo stesso controllo alla chiusura dell'ordine.
- Matita per correggere una riga prima della chiusura; riepilogo e conferma «Ordine pronto» solo quando tutte le righe sono confermate o mancanti e il preparatore è assegnato. Gli ordini pronti restano consultabili e stampabili, senza introdurre una riapertura non presente nel mockup.
- Stato di preparazione indipendente da consegna e carico: nessun aumento di giacenza, nessuna comunicazione al cliente o invio automatico.
- Stampare uno o più ordini con dati salvati, U.M., pesi, mancanti, stato e preparatore, un ordine per pagina; eliminare il testo «dati inventati» solo dai fogli reali.
- Immagini reali dove disponibili; nessuna foto dimostrativa attribuita a un prodotto reale. Stati espliciti per elenco vuoto, caricamento, errore e salvataggio.

## Fase 2 — Pesi nello scarico Danea
Obiettivo approvato, esecuzione NON autorizzata. Fermarsi alla fine della Fase 1 e attendere una nuova autorizzazione esplicita dopo la verifica dell'utente; nessuna modifica alle funzioni di esportazione Danea in Fase 1.

- Preparazione modificabile solo prima dello scarico: blocco nel database, non solo nei pulsanti. Ordini già scaricati in sola consultazione, senza nuovi dati retroattivi o cambi di stato.
- Per un ordine pronto e non ancora scaricato, usare le quantità preparate confermate; se la riga è richiesta in kg, usare il peso effettivo confermato quando presente.
- Se l'U.M. ordinata è diversa da kg ma la base prezzo è kg, usare il peso effettivo esplicitamente confermato per la riga fatturabile in kg, conservando la quantità preparata e la sua U.M. nello storico e nelle note. Senza peso non inventare conversioni: mantenere la gestione attuale con prezzo da verificare.
- Righe mancanti escluse dalle righe merce esportate e indicate nelle note; se tutte sono mancanti, non generare un documento vuoto e segnalare il motivo.
- Ordini non completati in Preparazione conservano il comportamento attuale dello scarico: nessun obbligo nuovo di prepararli prima. Mostrare chiaramente che, una volta scaricati, non saranno più modificabili in Preparazione.
- Congelare quantità, U.M. e pesi effettivamente esportati insieme allo scarico, coordinando i blocchi con conferme e modifiche dell'ordine: nessun documento misto se qualcuno lavora contemporaneamente.
- Prezzi sempre dal listino del cliente al momento dello scarico, tramite il flusso esistente; quantità richiesta e prezzo dell'ordine cliente non riscritti.
- Riscarichi identici allo storico congelato; ordini storici senza preparazione mantengono la logica precedente. Nessuna modifica a numerazione o filtri Danea.

## Voce
Il dialogo AI reale con microfono sarà una fase separata, con un proprio piano e collaudo. In questa fase non trasformare il dialogo simulato in un servizio reale né presentarlo come operativo: il mockup resta conservato separatamente.

## Sicurezza e collaudo
- Accesso operativo solo ad amministratori e operatori attivi dell'azienda fornitrice; nessun privilegio derivato da scelte o valori salvati nel browser.
- Nuove tabelle con permessi espliciti e RLS aziendale; scritture esclusivamente tramite funzioni DB `SECURITY DEFINER` con `search_path = public`, controlli dell'utente autenticato, blocchi transazionali e storico delle azioni.
- Nessuna modifica a Lista della Spesa, Inventario, Fabbisogno, Consegne, Carico Merce o anagrafiche; nessuna cancellazione di codice esistente.
- Test delle regole quantità/peso, mancanti, completamento, accessi, concorrenza, scarico immutabile e compatibilità dei riscarichi; conservare i test nel progetto.
- Verifiche in anteprima autenticata dell'elenco, apertura ordine e stampa, senza scritture sui dati operativi. I salvataggi riusciti, la collaborazione fra utenti e lo scarico da Danea richiedono il collaudo manuale di Andrea su dati di prova autorizzati; non dichiararli verificati senza quella prova.
- Nessuna chiamata agli indirizzi Danea reali senza autorizzazione specifica. Nessuna pubblicazione.

## File previsti
**Nuovi:**
- Migrazione generata dagli strumenti in `drizzle/migrations/` — sole tabelle, storico e funzioni di preparazione in Fase 1; integrazione dello scarico esclusivamente nella futura Fase 2.
- `src/lib/preparation.ts` — tipi e regole condivise.
- `src/lib/preparation.functions.ts` — letture e comandi autenticati.
- `src/lib/preparation.test.ts`, `src/lib/preparation.functions.test.ts` — test delle regole e degli accessi.
- `src/components/preparation/preparation-panel.tsx` — pagina reale, distinta dal mockup conservato.
- `src/components/preparation/preparation-print.ts` — stampa dei dati reali.
- `src/lib/preparation-export.test.ts` — quantità/pesi esportati e compatibilità.

**Esistenti:**
- `src/routes/_authenticated/operativo.tsx` — collegamento alla pagina reale e metadati aggiornati.
- Solo nella futura Fase 2: `src/lib/danea-orders-export.server.ts`, `src/lib/danea-orders-xml.ts` — applicazione dello snapshot di preparazione ai soli nuovi scarichi.
- Solo nella futura Fase 2: `src/lib/danea-orders-xml.test.ts`, `src/lib/danea-orders-legacy-reexport.test.ts`, `src/lib/preparation-export.test.ts` — regressioni mirate dell'esportazione.
- `src/lib/guides/preparation-guide.ts` — guida allineata ai comandi reali.
- `src/lib/AGENTS.md`, `AGENTS.md`, `roadmap.md` — regole tecniche e stato del lavoro.

Tipi e metadati delle migrazioni generati dagli strumenti, senza modifiche manuali ai file gestiti. `src/start.ts` già collega la sessione alle chiamate: non occorre modificarlo. Il mockup e i suoi dati/test restano intatti.

## Punto di controllo obbligatorio approvato
Eseguire solo Fase 1. Al termine mostrare risultato, file e migrazioni effettivamente modificati, test superati e mancanti, problemi di pesi/U.M./concorrenza e impatto previsto sullo scarico Danea. Attendere conferma prima della Fase 2. Voce AI reale esclusa e pubblicazione non autorizzata.