# Inventario reale: collegare il mockup approvato alla logica esistente

Obiettivo: mantenere esattamente l'interfaccia approvata (tabellone, navigazione visuale, card compatte, pulsanti +1/+3/+5/+10, tastierino, filtri) e sostituire i dati finti con quelli reali, riusando tutto ciò che esiste.

## 1. Cosa esiste già e si collega direttamente

- **Zone di magazzino**: già reali (zone aziendali con nome, codice, predefinita, attiva/disattivata) e già gestibili con la funzione esistente e con la schermata reale `inventory-locations-manager`. La schermata Azienda → Magazzino userà quella, sostituendo la versione finta. Nessuna nuova tabella.
- **Sessione di conteggio**: già esiste (apertura, rinomina, chiusura, annullamento) con il vincolo di una sola sessione aperta per azienda/zona.
- **Registrazione conteggio**: già esiste ed è **già idempotente**: un solo conteggio per (sessione, prodotto, zona). Premere Conferma due volte aggiorna la stessa riga, non ne crea due, e conserva la giacenza di riferimento originale. Conserva già prodotto, zona, giacenza di riferimento, quantità contata, differenza, operatore, data/ora, nota.
- **Giacenza calcolata**: già esiste la formula unica (ultimo conteggio valido + rettifiche e movimenti successivi), anche in versione per tutta la zona in una sola lettura. Non verrà scritta nessuna seconda formula.
- **Categorie e sottocategorie**: già presenti sui prodotti reali.
- **Immagini prodotto**: già esiste l'archivio immagini unico con miniature; verranno usate quelle (nessun secondo archivio). Le foto finte restano fuori dall'uso operativo.
- **Nota operatore sulla differenza**: il conteggio ha già un campo nota, quindi la motivazione inserita nella finestra di conferma può essere salvata subito. Nessun collegamento AI: il blocco Analisi AI resta dichiaratamente dimostrativo.
- **Riconciliazione con lotti/provenienze (FASE D)**: resta separata e invariata.
- **Fabbisogno**: già reale, resta come è.

## 2. Cosa manca realmente

1. **L'elenco dei prodotti previsti nella sessione.** Oggi non esiste: senza di esso "137 / 200" non ha un totale stabile e i filtri finirebbero per cambiarlo. Serve uno scatto dei prodotti inclusi al momento dell'apertura del conteggio.
2. **I contatori di avanzamento** generale e per zona/categoria/sottocategoria calcolati sulla sessione.
3. **Il riepilogo di chiusura** (controllati / invariati / con differenze) e l'elenco dei soli prodotti con differenza.
4. **Preferiti sui propri prodotti**: NON esistono. L'unico "preferiti" presente è quello dell'acquirente B2B sul catalogo di un fornitore, quindi non è riutilizzabile qui. Vedi punto 5: mi serve una tua decisione.
5. **Apertura sessione riservata agli amministratori**: oggi solo un amministratore può aprire o chiudere un conteggio, mentre qualsiasi membro può contare. Va bene così o l'operatore deve poter aprire il conteggio?

## 3. Modifiche al database previste (una sola migration)

- Nuova tabella **prodotti previsti nella sessione**: una riga per prodotto+zona da controllare, creata all'apertura del conteggio. È ciò che rende "200" un numero vero e immutabile rispetto ai filtri, anche se il catalogo cambia durante la giornata.
- Nuova funzione **avanzamento sessione**: restituisce in un'unica lettura, per la sessione corrente, totale previsto, controllati, con differenze, mancanti e gli stessi contatori raggruppati per zona, categoria e sottocategoria.
- Nuova funzione **righe di conteggio della sessione**: prodotto, codice, U.M., zona, categoria, sottocategoria, giacenza calcolata, quantità contata, differenza, stato, nota, operatore, data/ora — con filtro per zona/categoria/sottocategoria/testo e paginazione.
- Estensione della chiusura sessione: consentita solo a sessione aperta e con le condizioni previste, restituendo il riepilogo finale. La chiusura non crea movimenti; la giacenza deriva dal conteggio come già previsto.
- Regole di accesso: lettura ai soli membri dell'azienda, scritture solo dalle funzioni protette, storico dei conteggi non sovrascritto silenziosamente.

Nessuna modifica a conteggi, rettifiche, movimenti, lotti, provenienze, formule di disponibilità, Fabbisogno, Lista della Spesa e FASE D.

## 4. Concorrenza e idempotenza

- Doppia pressione su Conferma, retry di rete, refresh della pagina: la riga di conteggio è unica per sessione+prodotto+zona, quindi si aggiorna, non si duplica. Nessuna rettifica o movimento generato dalla conferma.
- Due operatori sullo stesso prodotto: vince l'ultima conferma, con operatore e orario aggiornati; il valore di riferimento iniziale non viene riscritto. L'interfaccia rilegge l'avanzamento dal server dopo ogni conferma, quindi il tabellone non dipende dallo stato della pagina.
- Sessione già chiusa o annullata: il database rifiuta il conteggio con un messaggio chiaro e l'interfaccia riporta l'operatore al riepilogo.
- Chiusura contemporanea da due amministratori: la seconda chiusura non produce effetti aggiuntivi.
- "Conferma visibili invariati" invia le singole conferme in blocco tramite la stessa funzione idempotente.

## 5. Decisioni approvate

**Preferiti — opzione (a)**: preferiti aziendali condivisi sui prodotti dell'azienda, distinti dai preferiti B2B già esistenti. L'amministratore aggiunge/rimuove, tutti gli operatori vedono la stessa selezione. Soluzione minima: una riga per azienda+prodotto, nessuna funzione aggiuntiva.

**Permessi**: apertura e chiusura dell'inventario solo all'amministratore; gli operatori partecipano a una sessione già aperta e confermano i conteggi; un operatore non può chiudere l'inventario. È esattamente ciò che il database già impone.

## 5-bis. Verifica architetturale: un solo inventario generale, le zone sono navigazione

Verificato sul database: **non serve nessun contenitore sopra le sessioni** e non ci sarà nessuna somma di sessioni fatta dal frontend.

La sessione di inventario esiste già in due forme alternative:

- **generale**: una sola aperta per azienda e archivio, senza zona propria, e i suoi conteggi possono riferirsi a **qualunque zona** dell'azienda;
- **per zona**: una sola aperta per singola zona, e i conteggi possono riferirsi solo a quella zona.

Il vincolo "una sola sessione aperta per zona" riguarda solo la seconda forma. Per l'interfaccia approvata useremo **sempre la forma generale**: un unico lavoro di inventario che comprende Mandrione, Frigo, Banco e Cella.

Rapporto rappresentato:

```text
Inventario generale (una sessione aperta per azienda)
└── Prodotti previsti: elenco fisso creato all'apertura, una riga per prodotto + zona
    ├── Mandrione   84 / 120
    ├── Frigo       32 / 40
    ├── Banco       21 / 25
    └── Cella        0 / 15
    Totale generale = numero di righe previste = 200
    Completati = righe previste che hanno un conteggio confermato nella sessione = 137
```

Conseguenze:

- il totale generale è lo scatto dei prodotti previsti al momento dell'apertura: non cambia con filtri, ricerca, Preferiti, né se il catalogo cambia durante il conteggio;
- zona, categoria e sottocategoria sono raggruppamenti delle stesse righe previste, quindi i loro avanzamenti sono sempre parti dello stesso 137/200 e non inventari separati;
- l'inventario si può interrompere e riprendere: riaprendo la schermata si ritrova la stessa sessione con lo stesso totale e lo stesso avanzamento;
- la chiusura è un unico atto sull'inventario generale, non quattro chiusure per zona.

Le sessioni per singola zona restano disponibili nell'architettura esistente (per conteggi mirati) ma la nuova interfaccia non le userà.



## 6. Piano di implementazione a step

1. **Step 1 — Zone**: Azienda → Magazzino passa alla gestione zone reale (elenco, aggiungi, modifica, attiva/disattiva, predefinita). Conteggio: con una sola zona attiva la usa automaticamente, con più zone propone la predefinita.
2. **Step 2 — Database**: migration con prodotti previsti nella sessione, avanzamento, righe di conteggio, chiusura con riepilogo.
3. **Step 3 — Avvio conteggio reale**: Nuovo conteggio apre una sessione vera e crea l'elenco dei prodotti previsti; se una sessione è già aperta la riprende invece di crearne un'altra.
4. **Step 4 — Card e tabellone reali**: stessa grafica approvata, con giacenza calcolata reale, immagine reale o placeholder neutro, differenza reale; il totale generale resta fisso al variare di zone, categorie, sottocategorie, Preferiti e ricerca.
5. **Step 5 — Conferma e nota**: conferma prodotto persistente, motivazione salvata sulla differenza, blocco AI solo dimostrativo.
6. **Step 6 — Filtri e navigazione**: Da controllare | Completati | Differenze e Zone → Categorie → Sottocategorie → Prodotti → Cerca sui dati reali, con avanzamento su ogni card.
7. **Step 7 — Chiusura**: riepilogo, elenco dei soli prodotti con differenza, conferma finale autorizzata.

## 7. Test previsti

1. Con una sola zona attiva, Nuovo conteggio entra direttamente nel conteggio.
2. Con più zone, viene proposta la predefinita e si può cambiare.
3. Il totale generale non cambia applicando zona, categoria, sottocategoria, ricerca o Preferiti.
4. La giacenza calcolata coincide con quella mostrata nella scheda prodotto esistente.
5. Somma pulsanti rapidi: +10 +10 +5 +3 = 28; virgola e punto accettati; azzera svuota.
6. Conferma con differenza: richiede la motivazione e la salva.
7. Doppia pressione su Conferma: una sola riga di conteggio, nessun movimento.
8. Refresh a metà conteggio: avanzamento e quantità confermate ancora presenti.
9. Due operatori sullo stesso prodotto: nessun duplicato, ultimo valore e autore corretti.
10. Sessione chiusa: nuovo tentativo di conteggio rifiutato con messaggio chiaro.
11. Conferma visibili invariati: differenza zero su tutti i prodotti visibili.
12. Riepilogo finale: controllati / invariati / con differenze coerenti e apertura dei soli prodotti con differenza.
13. Chiusura doppia: nessun effetto duplicato.
14. Fabbisogno, Lista della Spesa, ordini, carichi e lotti invariati dopo il conteggio.
15. Verifica su desktop, tablet e smartphone: densità, tastierino numerico, pulsanti rapidi e immagini come approvato.

Mi fermo qui: nessuna migration e nessuna modifica strutturale prima della tua approvazione e della risposta sui Preferiti.
