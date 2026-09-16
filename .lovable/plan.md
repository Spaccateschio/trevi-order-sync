# Trevi Fruit — Fase 2: ricezione prodotti da Danea Easyfatt

Solo piano tecnico. Nessuna implementazione, nessuna pagina Prodotti, nessun listino assegnato ai clienti, nessuna U.M. alternativa, nessun ordine.

## 1. Protocollo Danea individuato (verificato sulle specifiche ufficiali)

- Danea invia i prodotti con un **POST HTTP** verso una URL nostra, indicata dall'utente in Easyfatt. Il file viaggia come **multipart/form-data** con il campo chiamato `file`, esattamente come un upload da form HTML. [1](https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/)
- L'autenticazione prevista dal protocollo è **login + password HTTP Basic** (i campi "Login" e "Password" nelle Impostazioni di Easyfatt), pensate per cartelle protette. In alternativa, la prassi diffusa è mettere un **token nella URL** (`...?token=xxxx`). Prevediamo **entrambi**: token obbligatorio in URL + Basic opzionale. [1](https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/)
- La risposta deve essere il **testo esatto `OK`**. Qualsiasi altra risposta viene mostrata all'utente in Easyfatt come messaggio di errore. Questo è il nostro canale per comunicare gli esiti.
- Radice XML: `<EasyfattProducts AppVersion="2" Mode="full|incremental" Warehouse="..." ImageFolder="...">`.
  - **FULL**: unica lista `<Products>`, `Mode="full"`. Se `Mode` manca, è una vecchia versione e va trattato come full.
  - **INCREMENTAL**: liste `<UpdatedProducts>` (nuovi/modificati) e `<DeletedProducts>`, `Mode="incremental"`.
  - Nei `DeletedProducts` il prodotto contiene **solo `<Code>`**: la cancellazione si riconosce dal codice, non dall'ID interno.
- Danea invia **solo i prodotti attivi per la pubblicazione**: non esiste un campo "pubblicato". Un prodotto depubblicato semplicemente non arriva più (assente in full, o presente in `DeletedProducts` in incremental). [2](https://help.danea.it/easyfatt/Aggiornamento_catalogo_prodotti.htm)
- Le immagini sono opzionali e vengono inviate **solo se le chiediamo** nella risposta (`ImageSendURL=...`). In Fase 2 **non le chiediamo**.

### Campi realmente trasmessi (da specifica + schema ufficiale `prodotti.xsd`)
`InternalID`, `Code` (obbligatorio), `Barcode`, `ExtraBarcodes` (con `PackageQty`), `Description`, `DescriptionHtml`, `Category`, `Subcategory`, `Subcategory2…9`, `Vat` (con attributi `Perc`, `Class`, `Description`), `Um`, `ProductType`, `NetPrice1…9`, `GrossPrice1…9`, `NetEcoFee`/`GrossEcoFee`, `SupplierCode`, `SupplierName`, `SupplierProductCode`, `SupplierNetPrice`, `SupplierGrossPrice`, `SupplierNotes`, `ProducerName`, `Link`, `Notes`, `CustomField1…4`, `ManageWarehouse`, `WarehouseLocation`, `MinStock`, `AvailableQty`, `OrderedQty`, `OrderWaitDays`, `OrderStep`, dimensioni/pesi, `Variants` (taglia/colore), `ImageFileName`.

Tutti i campi che hai chiesto esistono, quindi li riceviamo tutti. Giacenza (`AvailableQty`) e dati fornitore (incluso il **prezzo di acquisto**) esistono ma dipendono da come Easyfatt è configurato.

### Punti da confermare con il primo invio reale
- Se il tuo Easyfatt compila `InternalID` su ogni prodotto (è dichiarato ma non obbligatorio).
- Formato numerico effettivo (punto o virgola decimale) e valuta.
- Se `AvailableQty` e i campi fornitore arrivano valorizzati.
- Se viene usato il multi-magazzino (attributo `Warehouse`).
- Se la tua versione supporta `AppVersion="2"` e l'invio incrementale.
Questi punti li verifichiamo sul file vero, senza dare nulla per scontato.

## 2. Flusso Danea → Trevi Fruit

```text
Easyfatt  --POST multipart (file=XML)-->  endpoint Trevi Fruit
                                          |
                                     1. autentica il collegamento (token + Basic)
                                     2. salva il payload grezzo + apre un job di sync
                                     3. valida e legge l'XML
                                     4. upsert prodotti della company
                                     5. chiude il job, scrive il log
                                          |
                                    risponde  "OK"  oppure testo di errore
```

## 3. Endpoint

- `POST /api/public/danea/products/:connectionToken` — riceve il catalogo. Server-side, fuori dall'area autenticata dell'app perché il chiamante è Easyfatt.
- Nessun altro endpoint pubblico in Fase 2 (immagini e ordini non li attiviamo).

## 4. Autenticazione e sicurezza

- Ogni collegamento Danea ha un **token opaco** in URL e, opzionalmente, **login/password Basic**. Password e token sono conservati **solo come hash**; il valore in chiaro si vede una sola volta al momento della creazione.
- Token **revocabile** e **rigenerabile**: revocando, l'endpoint risponde con errore e Danea lo mostra a schermo.
- Il token identifica **una sola company**: il `company_id` non arriva mai dalla richiesta, si ricava dal collegamento. Isolamento garantito dalle stesse regole della Fase 1.
- Limite dimensione payload, timeout, e nessuna credenziale Danea nel frontend.
- Il frontend (solo amministratore della propria azienda) potrà creare/revocare il collegamento e vedere i log, mai i segreti.

## 5. Nuove tabelle

- **danea_connections** — un collegamento per company: nome, token hash, login, password hash, stato (attivo/revocato), versione protocollo rilevata, magazzino, data ultimo invio riuscito.
- **danea_price_lists** — i 9 listini tecnici per company: numero 1–9 (riferimento tecnico immutabile), nome visualizzato (es. 1 → BAR), attivo sì/no. Nessuna assegnazione ai clienti in questa fase.
- **danea_sync_runs** — un record per invio: modalità (full/incremental), esito, conteggi (ricevuti, creati, aggiornati, depubblicati, scartati), inizio/fine, hash del payload, messaggio di errore.
- **danea_sync_issues** — righe problematiche del singolo invio: codice prodotto, campo, motivo. Serve al confronto dopo il test reale.
- **products** — anagrafica ricevuta, per company: `danea_internal_id`, `code`, descrizione, descrizione HTML, categoria, sottocategorie, U.M. Danea, IVA (percentuale, classe, descrizione), barcode, tipo prodotto, produttore, link, note, campi liberi 1–4, dati fornitore (codice, nome, codice articolo fornitore, prezzo netto/ivato di acquisto), giacenza e dati magazzino, dimensioni/pesi, stato pubblicazione (`pubblicato` / `non_pubblicato`), data prima ricezione, data ultima ricezione, id dell'ultimo invio che l'ha toccato, XML grezzo del prodotto per non perdere nulla.
- **product_prices** — una riga per prodotto e per listino 1–9: prezzo netto, prezzo ivato. Separata dall'anagrafica: i listini Danea restano intatti e identificati dal numero.
- **product_extra_barcodes** — barcode aggiuntivi con quantità per confezione.
- **product_variants** — taglia/colore/barcode/giacenza, per non perdere il dato se arriva.

Il prezzo di acquisto fornitore resta memorizzato ma **non sarà mai esposto** verso i clienti: lo tratteremo come dato riservato all'azienda, con letture limitate agli amministratori.

## 6. Come riconosciamo lo stesso prodotto (idempotenza)

Chiave di identità: **(company_id, danea_internal_id)** quando `InternalID` è presente, con **(company_id, code)** come chiave alternativa e fallback.

Perché entrambe: `Code` è l'unico campo obbligatorio ed è **l'unico dato disponibile nei `DeletedProducts`**, quindi ci serve comunque un indice su `code`; `InternalID` è invece stabile anche se l'utente cambia il codice in Danea.

Regola di risoluzione, in ordine:
1. cerco per `danea_internal_id` → se trovo, aggiorno (allineando anche il `code` se è cambiato);
2. altrimenti cerco per `code` → se trovo, aggiorno e salvo l'`InternalID` se ora è presente;
3. altrimenti creo.

Un prodotto inviato dieci volte resta una sola riga. Nessun duplicato, nessuna cancellazione fisica.

## 7. FULL

1. Apro un job `full`.
2. Upsert di ogni prodotto ricevuto, con `ultima_ricezione` e id del job.
3. Al termine, tutti i prodotti della company **non toccati da questo job** passano a `non_pubblicato` (non vengono cancellati).
4. Prezzi: aggiorno i 9 listini per i prodotti ricevuti; azzero solo i listini effettivamente assenti nel messaggio.
5. Se l'XML è illeggibile o l'elaborazione fallisce, **non applico niente**: nessuna depubblicazione a metà.

## 8. INCREMENTAL

1. Apro un job `incremental`.
2. `UpdatedProducts` → stesso upsert del full, e riportano a `pubblicato` un prodotto tornato disponibile.
3. `DeletedProducts` (solo `Code`) → il prodotto passa a `non_pubblicato`, con data e job che l'hanno determinato. Nessuna cancellazione fisica.
4. Nessun effetto sui prodotti non menzionati.

## 9. Depubblicazione

Un prodotto non più pubblicato mantiene riga, storico, prezzi e riferimenti. Cambia solo lo stato e la data. Se torna in un invio successivo, torna `pubblicato` senza perdere nulla. Così gli ordini futuri potranno sempre puntare a prodotti storici.

## 10. NetPrice1–9

- I 9 listini restano identificati dal **numero Danea**, mai da un nome.
- Salvo sia netto sia ivato quando presenti.
- I nomi visualizzati (BAR, RISTORANTI, …) stanno in una tabella separata e sono modificabili senza toccare i dati Danea.
- In questa fase nessun cliente viene collegato a un listino.

## 11. Reinvii, errori, log

- Ogni invio è tracciato con esito, conteggi, durata e hash del payload.
- Payload identico ricevuto due volte di seguito: elaborato comunque in modo idempotente e segnalato nel log come possibile doppione.
- Errori di singole righe (codice mancante, numeri illeggibili): la riga viene scartata e registrata, il resto procede; il conteggio degli scarti finisce nella risposta.
- Errore grave: rispondo con un testo di errore leggibile che Danea mostra a schermo, e il job resta marcato come fallito.
- Il payload grezzo dell'ultimo invio viene conservato per il confronto del test reale.

## 12. Multi-azienda

Collegamento, prodotti, prezzi e log sono tutti legati alla company. Token distinti per azienda, nessuna possibilità di scrivere prodotti di un'altra azienda. Domani Azienda A e Azienda B avranno ciascuna il proprio Danea e i propri prodotti, senza mescolare né dati né credenziali.

## 13. Cosa non facciamo in Fase 2

Nessuna pagina Prodotti definitiva (solo una schermata tecnica di diagnostica con esiti degli invii e anteprima dei dati ricevuti), nessuna immagine, nessun ordine, nessuna U.M. alternativa, nessuna assegnazione listini ai clienti.

## 14. Procedura che eseguirai in Danea Easyfatt per il primo invio reale

1. `Tabelle > Opzioni > Generale > E-Commerce`: attiva la gestione e-commerce (1 sito).
2. Nella sezione **Prodotti**, sulla linguetta *Caratteristiche*, attiva "pubblicazione" sugli articoli da inviare (o attiva l'opzione che pubblica i nuovi prodotti).
3. `Strumenti > E-Commerce > Aggiorna articoli`.
4. Prima prova a vuoto: premi **Salva su file** e mandami l'XML. Così verifico i campi veri prima di aprire il collegamento.
5. Linguetta **Impostazioni**: incolla la URL che ti fornirò (contiene il token), ed eventualmente Login e Password.
6. Lascia **disattivata** "Invia solo voci modificate" per il primo invio (vogliamo un FULL).
7. Premi **Invia**. Se tutto è a posto Easyfatt non mostra errori; qualsiasi messaggio che compare è il testo che ti manda il nostro endpoint.
8. Secondo invio con "Invia solo voci modificate" attiva, dopo aver modificato un prodotto e depubblicato un altro, per verificare l'incrementale e la depubblicazione.
9. Confronto finale: numero prodotti inviati/ricevuti, codici, descrizioni, U.M., categorie, IVA e NetPrice1–9.

## 15. Note tecniche

- Endpoint TanStack server route sotto `src/routes/api/public/`, parsing XML server-side, nessuna dipendenza Node-only.
- Elaborazione batch a blocchi per reggere cataloghi ampi, senza superare i tempi della richiesta.
- Tutte le tabelle con protezione per riga e concessioni esplicite; la scrittura dall'endpoint avviene con privilegi di servizio dopo la verifica del token.
- Attenzione: se il catalogo fosse molto grande, il primo invio potrebbe richiedere elaborazione a più fasi; lo valuteremo sul volume reale del tuo catalogo.
