# Statistiche reali con consigli per migliorare l’esperienza utente

## Risultato

La scheda **Piattaforma → Statistiche**, riservata al super amministratore, abbandona completamente i dati dimostrativi e mostra:

- pagine viste, clic, andamento e classifiche reali;
- filtri per periodo, area, dispositivo e pagina;
- tre blocchi con **evidenza numerica + suggerimento pratico scritto**:
  1. **Pagina da migliorare**: quale pagina prioritaria rendere più semplice o veloce.
  2. **Esperienza da telefono**: quale differenza mobile/computer correggere.
  3. **Comando da semplificare**: quale azione rendere più immediata, soprattutto se ripetuta nella stessa visita.

Esempio di risultato: «**Riduci i passaggi di Conferma quantità nella Lista della Spesa**: 36 clic in 6 visite; verifica se le conferme ripetute rallentano l’inserimento.» Il testo effettivo dipenderà dai dati, senza affermare cause non dimostrate.

## Raccolta anonima

Creo una raccolta interna per alimentare automaticamente la pagina. Registra soltanto:

- pagina e tipo di evento: apertura, clic, tempo di caricamento, tempo attivo o errore;
- dispositivo smartphone/computer e area aziende/piattaforma;
- nome tecnico stabile del comando, tradotto in italiano nella pagina;
- identificativo casuale della sola visita, necessario a riconoscere le ripetizioni.

Non registra utente, azienda, email, IP, prodotti, quantità, note o altri contenuti inseriti. La misurazione non deve rallentare o bloccare i comandi operativi: parte dopo l’azione e un suo errore non interrompe il lavoro.

Le statistiche storiche già raccolte da Lovable restano disponibili in **Analytics**. Non le copio nella nuova tabella e non le presento come aggiornate: la pagina indicherà chiaramente la data di inizio della raccolta interna e mostrerà **«Dati insufficienti»** finché il campione non basta.

## Regole dei suggerimenti

Le regole sono deterministiche e provabili, non testi generati a discrezione dell’AI:

- ogni consiglio riporta periodo, pagina/comando e numeri che lo motivano;
- una pagina diventa prioritaria solo con un campione minimo e un segnale concreto: molto utilizzo, caricamento lento o errori;
- il confronto telefono/computer richiede dati sufficienti per entrambi i dispositivi;
- un comando viene segnalato per volume o ripetizioni nella stessa visita, non soltanto perché esiste;
- sotto la soglia compare quanti dati mancano;
- il consiglio propone un intervento da verificare, senza sostenere di conoscere il motivo del comportamento.

## Modifiche tecniche

1. **Nuova migrazione** per eventi e aggregazioni:
   - tabella `public.platform_usage_events`, senza riferimenti a utenti o aziende;
   - RLS attiva, nessuna lettura/scrittura diretta dal browser e `GRANT` espliciti nella stessa migrazione;
   - funzione di registrazione con campi ammessi e `SECURITY DEFINER ... search_path = public`;
   - funzione di aggregazione per periodo/filtri, eseguibile soltanto dal super amministratore attivo;
   - indici per periodo, pagina e comando.

2. **Nuovi file**:
   - `src/lib/platform-usage.ts`: tipi, catalogo pagine/comandi, calcoli e testi dei suggerimenti;
   - `src/lib/platform-usage.functions.ts`: registrazione autenticata e lettura aggregata riservata;
   - `src/lib/platform-usage-tracking.ts`: identificativo temporaneo della visita e invio non bloccante;
   - `src/lib/platform-usage.test.ts`: soglie, filtri, ripetizioni e testi nei casi sufficienti/insufficienti.

3. **File esistenti**:
   - `src/routes/__root.tsx`: aperture, tempi e navigazione senza doppi conteggi;
   - `src/lib/lovable-error-reporting.ts`: collegamento degli errori alla stessa pagina anonima;
   - `src/components/platform/platform-usage-mockup.tsx`: sostituzione del mockup con dati e suggerimenti reali;
   - `src/routes/piattaforma.statistiche.tsx`: nuovo pannello e metadati non più “Mockup”;
   - handler dei comandi principali delle pagine già previste dal mockup, aggiungendo soltanto la misurazione senza cambiarne il comportamento;
   - `src/lib/AGENTS.md`: regola architetturale della raccolta anonima, perché il file radice ha esaurito lo spazio;
   - `roadmap.md`: stato dell’attività.

4. **Rimozione circoscritta dei soli dati finti**:
   - `src/lib/platform-usage-mock.ts` e `src/lib/platform-usage-mock.test.ts` non saranno più usati e verranno eliminati dopo la sostituzione.

## Verifica

- test automatici su filtri, soglie e suggerimenti, inclusi campione scarso e comando ripetuto;
- controllo che un amministratore non super admin non possa leggere le statistiche;
- prova di una visita e di un comando con account 3 EMME, senza modificare dati operativi né inviare ordini; eventi di prova eliminati subito dopo;
- verifica desktop e telefono della pagina e controllo che conferme quantità/conteggio restino altrettanto immediate;
- nessuna pubblicazione automatica.

## Nota separata sulla metrica principale

La metrica «**Ordini fornitore ricevuti in magazzino ogni giorno**» non risulta ancora coperta da un evento dedicato. Non la aggiungo in questo intervento; posso predisporla separatamente se richiesto.
