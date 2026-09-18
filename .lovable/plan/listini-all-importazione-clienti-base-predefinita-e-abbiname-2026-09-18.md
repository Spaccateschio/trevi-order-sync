# Listini all'importazione clienti: base predefinita e abbinamento manuale

## Cosa ho scoperto

L'importazione funziona: sui 58 clienti importati, 3 hanno ricevuto il listino, 55 no.

Il motivo è che il nome scritto nel file **non esiste** tra i listini dell'archivio:

- l'archivio attuale ha i listini **Listino 1, Listino 2, Listino 3** (nomi arrivati da Danea con l'invio prodotti);
- il file clienti contiene nomi diversi (es. **BAR**, **Listino 13**, **Rompi**) che vengono dal vecchio database.

Quando il nome non esiste il programma non assegna nulla, quindi il cliente resta "prezzi su richiesta".

## Cosa farò

### 1. Listino base per chi non ne ha uno

Se il file non indica un listino, oppure il nome non viene riconosciuto, il cliente riceve il **primo listino dell'archivio** (il listino base, quello dei prezzi prodotti). Nessun cliente resta senza prezzi. Il listino resta sempre modificabile dalla scheda del cliente.

### 2. Abbinamento manuale dei nomi non riconosciuti

Nell'anteprima, sotto la scelta dell'archivio, compare il blocco **Listini del file**:

- una riga per ogni valore trovato nel file, con quanti clienti riguarda;
- accanto, l'esito: riconosciuto (es. "Listino 2 → Listino 2") oppure un menu per scegliere a mano quale listino dell'archivio usare (predefinito: il listino base);
- le scelte vengono ricordate per quell'archivio, così alla prossima importazione sono già pronte.

### 3. Avviso archivio senza listini

Se l'archivio scelto non ha ancora ricevuto i listini da Danea, resta l'avviso già introdotto: in quel caso i clienti vengono importati senza listino e basterà reimportare dopo l'invio dei prodotti.

## Dettagli tecnici

- `src/components/companies/customer-import-dialog.tsx`: stato `listMap: Record<string, number | null>` con persistenza in `localStorage["trevi:clienti:listini:<archiveId>"]`; elenco dei valori distinti di `row.price_list` con conteggio; `Select` per ogni valore; risoluzione in `confirmImport` nell'ordine `resolvePriceListNumber` → scelta manuale → listino base (`priceLists[0].listNumber`).
- Nessuna modifica al database, alle RPC, ai prodotti o alla visibilità del catalogo. Il listino assegnato resta modificabile solo dalla scheda cliente, come oggi.

## Verifiche

- File con "BAR"/"Listino 13"/"Rompi": clienti importati con il listino base, o con quello abbinato a mano.
- Valori riconosciuti ("Listino 2"): invariati.
- Typecheck e build.
