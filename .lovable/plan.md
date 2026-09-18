# Abbinamento manuale dei listini all'importazione clienti

## Cosa ho scoperto

L'importazione funziona: sui 58 clienti importati, 3 hanno ricevuto il listino corretto, 55 no.

Il motivo è che il nome scritto nel file **non esiste** tra i listini dell'archivio:

- l'archivio attuale ha i listini **Listino 1, Listino 2, Listino 3** (nomi arrivati da Danea con l'invio prodotti);
- il file clienti contiene nomi diversi (es. **BAR**, **Listino 13**, **Rompi**) che provengono dal vecchio database.

Quando il nome non esiste, il programma non assegna nulla (giustamente: non inventa listini). Serve quindi un abbinamento fatto da te, una volta sola.

## Cosa farò

Nell'anteprima dell'importazione, sotto la scelta dell'archivio, comparirà un blocco **Listini del file**:

- una riga per ogni valore di listino trovato nel file, con il numero di clienti interessati;
- accanto, l'esito: riconosciuto (es. "Listino 2 → Listino 2") oppure un menu per scegliere a mano quale listino dell'archivio usare (o "nessun listino");
- le scelte manuali vengono ricordate per l'archivio, così alla prossima importazione dello stesso tipo di file sono già impostate;
- l'importazione applica il listino riconosciuto o quello che hai abbinato.

Resta il messaggio di avviso quando un archivio non ha ancora ricevuto i listini da Danea.

## Dettagli tecnici

- `src/components/companies/customer-import-dialog.tsx`: nuovo stato `listMap: Record<string, number | null>`, elenco dei valori distinti di `row.price_list` con conteggio, `Select` per i non riconosciuti, persistenza in `localStorage["trevi:clienti:listini:<archiveId>"]`, uso in `confirmImport` come fallback di `resolvePriceListNumber`.
- Nessuna modifica al database, alle RPC, ai prodotti o alla logica di visibilità del catalogo.

## Verifiche

- File con "BAR"/"Listino 13"/"Rompi": abbinamento manuale, reimport e controllo che i clienti mostrino il listino scelto.
- Valori già riconosciuti: nessun intervento richiesto.
- Typecheck e build.
