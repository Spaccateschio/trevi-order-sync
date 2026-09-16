# Trevi Fruit — Fase 2: ricezione prodotti da Danea Easyfatt

Solo piano tecnico, aggiornato sui dati **reali** del tuo file `EcommProdotti.xml`. Nessuna implementazione, nessuna pagina Prodotti definitiva, nessun listino assegnato ai clienti, nessuna U.M. alternativa, nessun ordine.

## 1. Analisi del tuo file reale (81 prodotti)

Fatti verificati direttamente nel file, non ipotesi:

- Radice: `AppVersion="2"`, `Creator="Danea Easyfatt Enterprise 2026.59"`, `Mode="incremental"`, `DefaultPrice="1"`.
- **Nomi listino già inviati da Danea**: `PriceName1="BAR"`, `PriceName2="Listino 2"`, `PriceName3="Listino 3"`. Dal 4 al 9 assenti.
- Nessun attributo `Warehouse`: non stai usando il multi-magazzino.
- `<UpdatedProducts>`: **81 prodotti**. `<DeletedProducts>` presente ma **vuoto** (`<DeletedProducts></DeletedProducts>`).
- `InternalID`: presente su **tutti gli 81**, **nessun duplicato**. `Code`: presente su tutti, nessun duplicato, formato numerico con zeri iniziali (`0225`, `0446`, `1824`) — quindi va trattato come **testo**, non come numero.
- `Um`: solo due valori reali → **kg (62)** e **pz (19)**.
- `Category`: presente su 71 su 81 → **10 prodotti senza categoria** (CONFEZIONATO, FRUTTA, FUNGHI, INSALATA, ODORI, ORTAGGIO, PATATE, VERDURA). `Subcategory` su 19 (AGRUMI, FRUTTA ESOTICA, FRUTTI DI BOSCO, GRATINATI, POMODORI). Nessuna `Subcategory2…9`.
- `Vat`: sempre presente, con `Perc`, `Class="Imponibile"` e `Description`. Aliquote reali: 4% (74), 5% (3), 10% (3), 22% (1).
- Prezzi: valorizzati **solo NetPrice1–3 e GrossPrice1–3**, su tutti gli 81 prodotti. Dal 4 al 9 assenti. Separatore decimale **punto** (`2.3`, `5.62`), senza simbolo di valuta.
- **Costo d'acquisto**: `SupplierNetPrice` e `SupplierGrossPrice` presenti su **tutti gli 81 prodotti**. `SupplierCode` e `SupplierName` solo su 2 prodotti, `SupplierProductCode` su 1.
- `DescriptionHtml` presente come tag su tutti, valorizzato solo su alcuni, con HTML in forma codificata.
- `Notes` presente ma **vuoto su tutti**.
- `SizeUm="cm"` e `WeightUm="kg"` presenti su tutti, ma **senza alcun valore di dimensione o peso**: sono tag vuoti di contorno.
- **Assenti del tutto**: `Barcode`, `ExtraBarcodes`, `ProductType`, `CustomField1…4`, `ProducerName`, `Link`, `SupplierNotes`, `NetEcoFee`/`GrossEcoFee`, `ManageWarehouse`, `WarehouseLocation`, `MinStock`, **`AvailableQty` (nessuna giacenza)**, `OrderedQty`, `OrderWaitDays`, `OrderStep`, `Variants`, `ImageFileName`.

Nota importante: il file è `incremental`, quindi non dimostra nulla sul comportamento FULL. Il FULL lo verifichiamo con un invio dedicato.

## 2. Cosa cambia nel piano rispetto alla versione precedente

1. **Nomi listino**: Danea trasmette già `PriceName1…9`. Li importiamo come nome iniziale (Listino 1 → BAR), con possibilità di sovrascriverli in Trevi Fruit. Il riferimento tecnico resta sempre il numero.
2. **`DefaultPrice`** viene memorizzato sul collegamento: indica quale listino Danea considera predefinito.
3. **Identità prodotto**: `InternalID` diventa l'identificativo Danea **principale** (presente e univoco su tutti gli 81), `Code` resta riferimento commerciale e fallback — obbligatorio perché nei `DeletedProducts` Danea invia **solo `<Code>`**.
4. **`Code` come testo**: gli zeri iniziali vanno preservati.
5. **Categoria opzionale**: 10 prodotti senza categoria. Non inventiamo un valore né una categoria "Varie": il campo resta vuoto e la diagnostica lo segnala.
6. **Giacenza e magazzino**: non arrivano. Le colonne restano previste ma non valorizzate; nessuna logica di disponibilità basata su Danea.
7. **Barcode**: non arriva. Le tabelle barcode e varianti diventano **facoltative e rinviate**: le creiamo solo quando servono davvero, per non aggiungere struttura inutile.
8. **Costo d'acquisto**: arriva su tutti i prodotti, quindi va trattato come **dato riservato interno** da subito — visibile solo agli amministratori dell'azienda, mai esposto ai clienti né incluso in dati destinati al cliente.
9. **`DeletedProducts` può essere presente e vuoto**: da gestire senza errori.
10. **Numeri**: punto decimale, nessuna valuta; conversione rigorosa e scarto segnalato se un valore non è leggibile.
11. **Dimensioni e pesi**: solo le U.M. senza valori → non creiamo colonne per dimensioni e pesi in questa fase.
12. **Volume**: 81 prodotti, 60 KB. Un invio si elabora comodamente in una sola richiesta; il batch resta come accorgimento, non come necessità.

## 3. Protocollo Danea (confermato da specifiche + tuo file)

- Invio con **POST HTTP multipart/form-data**, campo `file`, verso una URL che indichi tu in Easyfatt. [1](https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/)
- Autenticazione prevista dal protocollo: **login + password HTTP Basic**. Aggiungiamo un **token nella URL** come prassi consolidata. Useremo entrambi: token obbligatorio, Basic opzionale.
- La risposta deve essere esattamente **`OK`**; qualunque altro testo Easyfatt lo mostra a schermo come errore. È il nostro canale di ritorno.
- **FULL**: lista `<Products>`, `Mode="full"` (o `Mode` assente su versioni vecchie).
- **INCREMENTAL**: `<UpdatedProducts>` + `<DeletedProducts>`, `Mode="incremental"`.
- Danea invia **solo i prodotti attivi per la pubblicazione**: non esiste un campo "pubblicato". Un prodotto depubblicato non arriva più (assente in full, o dentro `DeletedProducts` in incremental). [2](https://help.danea.it/easyfatt/Aggiornamento_catalogo_prodotti.htm)
- Le immagini le riceviamo solo se le chiediamo: in Fase 2 **non le chiediamo**.

### Restano da confermare con l'invio reale
- Comportamento effettivo del FULL sulla tua versione (`Mode="full"`, lista `Products`).
- Contenuto reale di un `DeletedProducts` popolato (attendiamo solo `<Code>`).
- Se depubblicando un articolo la tua versione lo metta in `DeletedProducts` oppure lo ometta semplicemente.

## 4. Flusso

```text
Easyfatt  --POST multipart (file=XML)-->  endpoint Trevi Fruit
                                          |
                                     1. verifica token del collegamento (+ Basic)
                                     2. salva payload grezzo e apre un job di sync
                                     3. valida e legge l'XML
                                     4. upsert prodotti e prezzi della company
                                     5. chiude il job e scrive il log
                                          |
                                    risponde  "OK"  oppure testo di errore
```

## 5. Endpoint

`POST /api/public/danea/products/:connectionToken` — unico endpoint pubblico della Fase 2, interamente server-side.

## 6. Autenticazione e sicurezza

- Token opaco in URL + login/password Basic opzionali, conservati **solo come hash**; valore in chiaro mostrato una volta sola alla creazione.
- Token **revocabile e rigenerabile**: revocato, l'endpoint risponde con errore che Danea mostra a schermo.
- Il token identifica **una sola company**: il `company_id` non arriva mai dalla richiesta.
- Limite di dimensione del payload, nessuna credenziale Danea nel frontend.
- Solo l'amministratore della propria azienda può creare/revocare il collegamento e leggere i log; i segreti non sono mai leggibili.

## 7. Tabelle

- **danea_connections** — un collegamento per company: nome, token hash, login, password hash, stato (attivo/revocato), `AppVersion` rilevata, `Creator`, `DefaultPrice`, magazzino eventuale, data ultimo invio riuscito.
- **danea_price_lists** — i 9 listini per company: numero 1–9 (riferimento tecnico immutabile), nome ricevuto da Danea (`PriceName`), nome visualizzato Trevi Fruit (sovrascrivibile), attivo sì/no. Nessuna assegnazione ai clienti.
- **danea_sync_runs** — un record per invio: modalità, esito, conteggi (ricevuti, creati, aggiornati, depubblicati, scartati), inizio/fine, hash del payload, messaggio di errore.
- **danea_sync_issues** — righe problematiche: codice, campo, motivo.
- **products** — per company: `danea_internal_id`, `code` (testo), descrizione, descrizione HTML, categoria, sottocategoria (+ livelli extra per compatibilità), U.M. Danea, IVA (percentuale, classe, descrizione), note, dati fornitore (codice, nome, codice articolo fornitore), stato pubblicazione (`pubblicato`/`non_pubblicato`), prima e ultima ricezione, id dell'ultimo invio che l'ha toccato, XML grezzo del prodotto per non perdere nulla di ciò che arriva.
- **product_supplier_costs** — costo d'acquisto netto e ivato, **tabella separata e riservata**: letture consentite solo agli amministratori dell'azienda, così il costo non può finire per errore in una lettura destinata al cliente.
- **product_prices** — una riga per prodotto e listino 1–9: prezzo netto e ivato. Struttura completa 1–9 anche se oggi arrivano solo 1–3.

Barcode aggiuntivi, varianti, dimensioni, pesi e giacenza: **non li creiamo adesso**, perché il tuo Danea non li invia. Il lettore XML li riconosce comunque e li conserva nell'XML grezzo del prodotto, così nulla va perso.

## 8. Identità e idempotenza

Chiave principale di identità: **(company_id, danea_internal_id)**. Chiave alternativa: **(company_id, code)**.

Risoluzione, in ordine:
1. cerco per `danea_internal_id` → aggiorno, allineando il `code` se in Danea è cambiato;
2. altrimenti cerco per `code` (serve per `DeletedProducts`, che porta solo il codice) → aggiorno e registro l'`InternalID`;
3. altrimenti creo.

Stesso prodotto inviato dieci volte = una sola riga. Nessun duplicato, nessuna cancellazione fisica.

## 9. FULL

1. Apro un job `full`.
2. Upsert di ogni prodotto ricevuto con data e id del job.
3. Al termine, i prodotti della company **non toccati dal job** passano a `non_pubblicato`. Nessuna cancellazione.
4. Prezzi: aggiorno i listini presenti nel messaggio; svuoto solo quelli effettivamente assenti per quel prodotto.
5. Se l'XML è illeggibile o l'elaborazione fallisce, **non applico niente**: nessuna depubblicazione a metà.

## 10. INCREMENTAL

1. Apro un job `incremental`.
2. `UpdatedProducts` → stesso upsert, e riporta a `pubblicato` un prodotto rientrato.
3. `DeletedProducts` (solo `Code`, e può essere vuoto) → il prodotto passa a `non_pubblicato` con data e job. Nessuna cancellazione fisica.
4. Nessun effetto sui prodotti non menzionati.

## 11. Depubblicazione

Riga, storico, prezzi e riferimenti restano. Cambia solo lo stato e la data. Se il prodotto torna, torna `pubblicato` senza perdere nulla: gli ordini futuri potranno sempre puntare anche a prodotti storici.

## 12. Listini 1–9

- Riferimento tecnico sempre il **numero Danea**.
- Nome iniziale preso da `PriceName1…9` quando presente (oggi: 1 → BAR).
- Nome visualizzato Trevi Fruit sovrascrivibile senza toccare i dati Danea.
- Salviamo netto e ivato quando entrambi arrivano.
- Struttura pronta per tutti e 9 anche se oggi ne arrivano 3.
- Nessun cliente collegato a un listino in questa fase.

## 13. Log, errori, reinvii

- Ogni invio tracciato con esito, conteggi, durata e hash del payload.
- Payload identico due volte: elaborato in modo idempotente e segnalato come possibile doppione.
- Righe non valide (codice mancante, numero illeggibile): scartate e registrate, il resto procede; il conteggio finisce nella risposta.
- Errore grave: rispondo con testo leggibile che Danea mostra a schermo e il job resta segnato come fallito.
- Payload grezzo dell'ultimo invio conservato per il confronto del test reale.

## 14. Multi-azienda

Collegamento, prodotti, prezzi, costi e log sono tutti legati alla company, con token distinti. Nessuna possibilità di scrivere dati di un'altra azienda: stesse regole di isolamento della Fase 1.

## 15. Cosa non facciamo in Fase 2

Nessuna pagina Prodotti definitiva (solo una schermata tecnica di diagnostica con esiti degli invii e anteprima dei dati ricevuti), nessuna immagine, nessun ordine, nessuna U.M. alternativa, nessuna assegnazione listini ai clienti.

## 16. Procedura in Danea Easyfatt per il primo invio reale

1. `Tabelle > Opzioni > Generale > E-Commerce`: gestione e-commerce attiva (1 sito). Nel tuo caso è già così.
2. `Strumenti > E-Commerce > Aggiorna articoli`, linguetta **Impostazioni**: incolla la URL che ti fornirò (contiene il token), ed eventualmente Login e Password.
3. **Disattiva** "Invia solo voci modificate" e premi **Invia**: primo invio FULL con tutti i prodotti pubblicati.
4. Se Easyfatt non mostra messaggi, la ricezione è andata a buon fine; qualsiasi messaggio a schermo è il testo del nostro endpoint.
5. Secondo invio: modifica un prezzo, depubblica un articolo, **attiva** "Invia solo voci modificate" e premi **Invia**. Così verifichiamo incrementale e depubblicazione reale.
6. Confronto finale: numero prodotti inviati/ricevuti, codici, descrizioni, U.M., categorie, IVA e NetPrice1–9.

## 17. Note tecniche

- Server route TanStack sotto `src/routes/api/public/`, parsing XML server-side con libreria compatibile con il runtime edge.
- Scrittura con privilegi di servizio solo dopo la verifica del token; tutte le tabelle con protezione per riga e concessioni esplicite.
- `code` gestito come testo, numeri con punto decimale, `Code` case-sensitive come arriva.
- Nessun campo inventato: ciò che Danea non manda resta vuoto.
