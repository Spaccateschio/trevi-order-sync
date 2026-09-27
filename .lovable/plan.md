# Conferma inventario: tre scelte per gli articoli senza quantità

## Decisioni fissate
- L'inventario resta **in corso** anche per più giorni, e "Conferma inventario" non lo chiude. Nessuna modifica al database.
- **Quali articoli controlla:** in vista **Preferiti** tutti i preferiti dell'inventario, qualunque siano la ricerca, la categoria, la zona o gli altri filtri. In vista **Tutti** tutti i prodotti dell'inventario.
- **Campo vuoto:** non diventa mai 0 da solo e non prende mai la quantità calcolata. **0 scritto a mano** è un conteggio valido.
- **Esaurito** = conteggio a 0 deciso esplicitamente dall'operatore.
- Le bozze restano salvate senza scadenza e il Fabbisogno resta facoltativo.

## Il pulsante
"Conferma visibili invariati" diventa **Conferma inventario**, nella stessa posizione.

Quando lo premi:
1. **Articoli con quantità scritta** (anche 0): diventano conteggi.
2. **Articoli già confermati in precedenza e non ritoccati:** restano come sono, senza un nuovo conteggio.
3. **Articoli senza quantità e mai confermati:** li elenco nella finestra.

Se non ci sono articoli senza quantità, conferma e basta: nessuna finestra, resti nel Conteggio e vedi il messaggio "N quantità confermate".

## La finestra "Inventario incompleto"
"Ci sono N articoli senza quantità inserita. Potresti aver dimenticato di contarli oppure potrebbero essere prodotti esauriti."

Elenco Codice | Descrizione | U.M., scorrevole se è lungo.

**1. Riprendi e inserisci**
- Non conferma nulla, nemmeno le quantità scritte, che restano in bozza.
- Torna al Conteggio con il filtro "Da controllare" e mette il cursore sul primo campo vuoto.

**2. Conferma gli articoli senza quantità come esauriti**
- Conferma le quantità scritte e registra **0** per ciascun articolo dell'elenco.
- Lo 0 viene registrato nella U.M. della giacenza del prodotto, così diventa davvero giacenza 0.
- Nota automatica: "Esaurito — confermato dall'operatore". Serve perché, quando la giacenza calcolata non era 0, il sistema chiede sempre il motivo della differenza.
- Resti nel Conteggio e l'inventario resta aperto.

**3. Conferma solo quanto inserito e vai alla Lista della Spesa**
- Conferma solo le quantità scritte. Gli articoli vuoti restano **non controllati** e le loro eventuali bozze restano.
- L'inventario resta aperto e poi si apre la Lista della Spesa.

In tutti e tre i casi, un articolo con quantità scritta **diversa dalla calcolata nella stessa U.M.** apre come oggi la finestra della nota obbligatoria. Finché le note non sono compilate, non passo alla Lista della Spesa.

## Cosa non cambia
- **Bozze:** vengono cancellate solo per gli articoli appena confermati. Le altre restano.
- **Storico:** ogni conferma è un nuovo conteggio che si aggiunge, e i precedenti non vengono toccati.
- **U.M.:** la quantità scritta mantiene la U.M. scelta dall'operatore. Un conteggio in U.M. diversa resta "U.M. non confrontabili" e non diventa giacenza.
- **Giacenze:** vale sempre l'ultimo conteggio nella U.M. della giacenza. "Non controllato" resta sconosciuto.
- **Fabbisogno e Lista della Spesa:** nessuna modifica. Il pulsante del Fabbisogno "Aggiungi alla Lista della Spesa" e il suo avviso restano com'erano.

## Dettagli tecnici
- File: solo `src/components/inventory/inventory-count-panel.tsx`.
- Articoli da controllare: prendo le righe complete dell'inventario (`allRowsQuery`). In vista Preferiti le filtro con l'insieme dei preferiti (`previewFavoriteQuery.data`), ignorando ricerca, categoria, zona, fornitore e filtro di lavoro. In vista Tutti le prendo tutte, sempre solo per i prodotti gestiti dalla mia azienda.
- Quali confermare: righe con bozza non vuota e valida → `countMutation` con `countUnitsValue.selected(row)`. Senza bozza e `counted === null` → elenco della finestra. Senza bozza e `counted !== null` → nessuna azione. Una bozza non valida blocca con l'errore attuale "Quantità non valida".
- Opzione 2: `countMutation` con `value: 0`, `unit: rowUnit(row)` e `notes: "Esaurito — confermato dall'operatore"`.
- Opzione 3: dopo il salvataggio `navigate({ to: "/acquisti/lista-spesa" })`, se non restano note da compilare.
- `runConfirmAll` riscritto per le tre modalità (`resume`, `soldOut`, `enteredOnly`). Rimossi il percorso "quantità calcolata" e "Conferma e vai al Fabbisogno".
- Nessuna modifica a database, funzioni server, U.M., Fabbisogno o Lista della Spesa.

## Prove
1. Tutti gli articoli compilati → nessuna finestra, conteggi salvati, l'inventario resta in corso.
2. Vista Preferiti con un filtro di ricerca attivo → la finestra elenca comunque i preferiti vuoti che non si vedono.
3. Riprendi → nessun conteggio nuovo e bozze intatte.
4. Esauriti → 0 nella U.M. della giacenza, con la nota e senza chiedere niente.
5. Solo inseriti → i vuoti restano non controllati, si apre la Lista della Spesa e l'inventario è ancora in corso.
6. 0 scritto a mano → salvato come 0 e non compare nella finestra.
7. Quantità in U.M. diversa → mantiene la sua U.M. e va tra le "U.M. non confrontabili".

Le prove 4, 5 e 6 creano conteggi veri, che poi si possono correggere ricontando. Le faccio solo con il tuo via.
