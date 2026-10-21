# Lista della Spesa: filtri coerenti e stampa dei risultati

## Problemi verificati
- Alcuni filtri nascondono automaticamente tutti i prodotti non ancora in Lista, anziché verificarne le condizioni.
- «Senza fornitore» e B2B/Non B2B non usano criteri uniformi tra prodotti in Lista e prodotti disponibili.
- Le categorie selezionabili non includono quelle presenti solo nei prodotti disponibili fuori Lista.
- Selezionare insieme alcuni stati opposti richiede entrambe le condizioni, producendo risultati vuoti.
- La stampa attuale è una fotografia storica di ordini e acquisti diretti: non riceve i filtri della pagina ed è disponibile solo per liste numerate.

## Correzione proposta, solo in anteprima
1. Uniformare ricerca, categoria, fornitore, Preferiti, B2B/Non B2B e gli stati delle card. Nessun prodotto escluso soltanto perché fuori Lista: ogni filtro verifica condizioni effettivamente disponibili. Gli stati di assegnazione e ordine continuano a provenire dai dati esistenti, senza inventare quote o ordini per i prodotti fuori Lista.
2. Nello stesso insieme di stati alternativi, selezionare più opzioni significa mostrarne l'unione; gruppi diversi, categoria, fornitore e ricerca si combinano restringendo i risultati. Preferiti rimane attivo all'ingresso come ora.
3. Includere nelle categorie anche quelle dei prodotti disponibili fuori Lista; mantenere azzeramento filtri e ordinamento.
4. Rendere disponibile «Stampa risultati» anche senza una lista aperta o numerata, su cellulare e computer, senza far ricomparire Storico liste o i collegamenti rimossi.
5. Aprire un'anteprima di stampa con tutti i prodotti corrispondenti ai filtri attuali, nello stesso ordine della pagina, anche oltre il limite di caricamento iniziale di 60 card. Mostrare filtri applicati, numero risultati e dati pertinenti: prodotto, codice, categoria, giacenza e U.M., quantità da acquistare e U.M., stato, fornitori e ripartizioni ove disponibili. Dati mancanti restano «—», mai zero inventato; quantità locali non confermate restano distinguibili dalle quantità salvate. Nessun totale economico.
6. Conservare la stampa storica delle liste e degli acquisti diretti: non modificarne fotografie, ordini o dati.

## File autorizzabili
- `src/components/shopping/shopping-list-panel.tsx`: collegamento dei filtri condivisi, categorie complete e comando/anteprima stampa.
- `src/components/shopping/catalog-entries.tsx`: dati di presentazione necessari a filtri e stampa, senza modificare i percorsi di conferma o acquisto.
- `src/components/shopping/shopping-list-filters.ts` (nuovo): regole pure di selezione e ordinamento comuni.
- `src/components/shopping/shopping-list-filters.test.ts` (nuovo): test concreti dei filtri singoli e combinati, inclusi prodotti fuori Lista.
- `src/components/shopping/shopping-list-print-preview.tsx` (nuovo): anteprima e stampa dei risultati filtrati, separata dalla stampa storica.
- `src/components/shopping/shopping-list-print-data.ts` e `.test.ts` (nuovi): preparazione e verifica del contenuto completo stampabile, senza limite delle card.
- `src/components/shopping/AGENTS.md`: documentare l'uso della stessa selezione per pagina e stampa.

## Verifiche
- Test di ogni filtro e delle combinazioni significative, risultati vuoti e azzeramento; confronto degli identificativi dei prodotti filtrati e stampati.
- Verifica con oltre 60 prodotti di prova locali: nessun risultato omesso dalla stampa.
- Controllo della pagina e anteprima stampabile su cellulare e computer, con letture autorizzate e dati di prova locali, senza salvare quantità o inviare ordini.
- Controllo che stampa e filtri non creino liste, non confermino quantità e non cambino l'avviso ORD.

## Limiti
Nessuna modifica a database, dati reali, permessi, regole di acquisto, ordini, ritiri, numerazioni o stampa storica. Nessuna migrazione, pubblicazione o modifica a `roadmap.md`. Se servono file ulteriori, fermarsi e proporre l'integrazione.

Attendere approvazione prima di implementare.