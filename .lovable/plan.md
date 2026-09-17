# Punto 4 — Immagini prodotti Trevi Fruit

## Obiettivo e confini

Aggiungere a ogni prodotto una sola immagine effettiva Trevi Fruit, separata dai campi Danea `ImageFileName` e `ImageFolder`.

- L’immagine è collegata all’identificativo stabile del prodotto, che appartiene già a una specifica azienda e a uno specifico Archivio Danea.
- Due prodotti con lo stesso codice in archivi diversi restano distinti e possono avere immagini differenti.
- I riferimenti Danea restano invariati, in sola lettura e visibili nella sezione Dati Danea.
- Nessun tentativo di leggere cartelle locali del PC Danea e nessun backfill automatico.
- Non vengono modificati U.M., listini, archivi, regole FULL/INCREMENTAL, Inventario, Ordina, Preparazione o ritorno ordini.

## Stato attuale verificato

- `products.image_file_name` e `products.image_folder` sono già campi Danea distinti e vengono aggiornati dall’import.
- Non esistono bucket o file immagine nel progetto.
- La pagina Prodotti carica i dati dell’azienda, mostra 50 righe per pagina e conserva per utente/dispositivo visibilità, ordine e larghezza delle colonne.
- Il dettaglio prodotto mostra prima le U.M. Trevi Fruit e poi i Dati Danea richiudibili: l’immagine entrerà fra queste due sezioni.
- Le scritture operative protette usano già funzioni server autenticate, controllo amministratore e audit.

## 1. Modello dati

Nuova tabella `product_images`, separata da `products` e quindi mai inclusa negli upsert Danea:

- `id uuid` chiave primaria;
- `company_id uuid` obbligatorio;
- `archive_id uuid` obbligatorio;
- `product_id uuid` obbligatorio e univoco: una sola immagine corrente per prodotto;
- `image_path text` e `thumbnail_path text`, univoci;
- `content_type text` dell’immagine normalizzata (`image/webp`);
- `width`, `height`, `byte_size` della versione principale;
- `thumbnail_width`, `thumbnail_height`, `thumbnail_byte_size`;
- `checksum_sha256` per integrità e idempotenza;
- `uploaded_by uuid`, `created_at`, `updated_at`.

Vincoli e controlli database:

- `UNIQUE(product_id)`;
- dimensioni e byte positivi, MIME consentito;
- trigger `SECURITY DEFINER SET search_path = public` che verifica che prodotto, archivio e azienda coincidano;
- nessun `ON DELETE CASCADE`: un prodotto Danea oggi viene depubblicato, non eliminato; un’eventuale cancellazione fisica futura dovrà prima gestire esplicitamente l’immagine;
- indice su `(company_id, archive_id, product_id)`;
- audit append-only per caricamento, sostituzione e rimozione.

Questa tabella resta riutilizzabile in futuro da catalogo cliente, Ordina e Preparazione: quei moduli leggeranno la stessa immagine, senza copie.

## 2. Storage privato

Creare un bucket privato `product-images`, mai pubblico.

Percorsi generati esclusivamente dal server, senza usare codice prodotto, nome file Danea o nome originale caricato:

```text
{company_id}/{archive_id}/{product_id}/{version_id}/image.webp
{company_id}/{archive_id}/{product_id}/{version_id}/thumb.webp
```

`version_id` cambia a ogni sostituzione. Questo evita collisioni, attraversamento di percorsi e sovrascritture parziali.

Il browser non riceve credenziali storage e non può scegliere un percorso arbitrario. Le immagini vengono lette con URL firmati a breve durata; nel database si salvano solo i percorsi, mai URL firmati.

## 3. Autorizzazioni e RLS

### Metadati

- `GRANT SELECT` a utenti autenticati e `GRANT ALL` al servizio server.
- RLS attiva su `product_images`.
- Lettura consentita solo ai membri attivi dell’azienda tramite la funzione aziendale già esistente.
- Nessuna scrittura diretta dal browser: insert/update/delete avvengono soltanto tramite funzioni server protette.

### File

- Nessuna policy pubblica e nessuna lettura diretta generica del bucket.
- Upload, firma URL, sostituzione e rimozione passano da funzioni server autenticate.
- Il server ricava azienda e ruolo dalla sessione, verifica che il prodotto appartenga a quell’azienda e usa l’`archive_id` letto dal prodotto: non si fida di `company_id`, `archive_id` o path inviati dal browser.
- Caricamento/sostituzione/rimozione: solo `amministratore`.
- Visualizzazione iniziale: membri attivi dell’azienda venditrice. In futuro l’autorizzazione potrà essere estesa ai clienti con rapporto attivo senza cambiare tabella o duplicare file.
- Le URL firmate durano circa 10 minuti e non vengono salvate né registrate nell’audit.

## 4. Formati, limiti e validazione reale

Formati sorgente accettati:

- JPEG/JPG;
- PNG;
- WEBP.

Limiti proposti:

- massimo 12 MB per il file scelto;
- massimo 8.000 × 8.000 pixel;
- rifiuto di file vuoti, corrotti, non decodificabili o con firma binaria non coerente;
- niente SVG, GIF, HEIC o formati eseguibili.

La sola estensione o il `Content-Type` dichiarato dal browser non bastano. Il flusso verifica:

1. firma binaria e decodifica reale nel browser prima dell’elaborazione;
2. dimensioni e formato del risultato;
3. nuovamente sul server firma binaria, MIME, byte e dimensioni delle due varianti prima di renderle definitive.

## 5. Ridimensionamento, compressione e miniature

Per evitare fotografie da smartphone molto pesanti:

- il browser decodifica l’immagine, corregge l’orientamento e rimuove i metadati incorporati;
- genera una versione principale WEBP entro 1.600 × 1.600 px, proporzioni conservate, qualità circa 82%;
- genera una miniatura WEBP entro 160 × 160 px, proporzioni conservate, qualità circa 75%;
- non viene conservato il file originale pesante: si archiviano solo la versione ottimizzata e la miniatura;
- limiti finali: circa 2 MB per la principale e 150 KB per la miniatura; se non rispettati, nuova compressione controllata o rifiuto con messaggio chiaro.

Il server non userà librerie native incompatibili con il runtime. La validazione finale dei WEBP resta server-side.

## 6. Flusso upload sicuro

1. L’amministratore sceglie il file nel dettaglio prodotto.
2. Il browser valida e crea `image.webp` e `thumb.webp`.
3. Una funzione server verifica amministratore e prodotto, crea una versione temporanea e restituisce permessi di upload validi soltanto per quei due path e per pochi minuti.
4. Il browser carica le due varianti private.
5. Una seconda funzione server scarica e valida realmente entrambe, calcola checksum e dimensioni.
6. Una funzione SQL protetta aggiorna `product_images` e scrive l’audit in un’unica transazione, restituendo gli eventuali vecchi path.
7. Solo dopo il commit il server elimina i vecchi file.

Se upload o validazione falliscono, la vecchia immagine resta visibile e i nuovi file temporanei vengono rimossi. Caricamenti concorrenti saranno protetti con versione attesa/lock sul prodotto, evitando che una richiesta più vecchia sovrascriva quella più recente.

## 7. Sostituzione, rimozione e file orfani

### Sostituzione

- Carica e valida prima la nuova coppia immagine/miniatura.
- Cambia il riferimento database solo quando entrambi i file nuovi sono validi.
- Elimina i vecchi file dopo il cambio riuscito.
- Se la cancellazione fisica fallisce, l’immagine applicativa resta coerente e i vecchi path entrano in una coda di pulizia.

### Rimozione

- Conferma esplicita “Rimuovere l’immagine di questo prodotto?”.
- Rimuove prima il riferimento corrente in una transazione con audit.
- Cancella poi i due file; un eventuale errore viene accodato senza lasciare la pagina collegata a file mancanti.

### Pulizia orfani

Nuova tabella tecnica `storage_cleanup_queue` con `company_id`, path, motivo, tentativi e data del prossimo tentativo; RLS senza accesso browser, servizio server soltanto. Una rotta periodica protetta dal segreto già disponibile riprova le cancellazioni. Ogni nuovo caricamento/rimozione può inoltre smaltire una piccola parte della coda della stessa azienda. Nessuna scansione indiscriminata di file di altre aziende.

## 8. Lettura efficiente e URL firmati

La query Prodotti aggiunge soltanto i metadati necessari a sapere se l’immagine esiste; non scarica immagini originali.

- Nel dettaglio viene firmata e caricata la versione principale solo quando il pannello del prodotto è aperto.
- Nella griglia vengono firmate e caricate solo le miniature dei prodotti visibili nella pagina corrente e solo se la colonna Immagine è attiva.
- Firma in batch per la pagina corrente, cache breve coerente con la scadenza e `loading="lazy"`.
- Dimensioni CSS fisse per evitare salti della griglia.
- Nessun download delle immagini dei risultati fuori pagina o delle immagini principali.

## 9. UX dettaglio prodotto

Ordine invariato nelle priorità richieste:

1. Impostazioni Trevi Fruit / U.M.;
2. Immagine prodotto;
3. Dati Danea richiudibili.

Se presente:

- miniatura/anteprima compatta, proporzionata e non ritagliata in modo distruttivo;
- pulsanti `Sostituisci` e `Rimuovi`;
- stato di caricamento e messaggi di errore senza chiudere il pannello.

Se assente:

- indicazione discreta `Nessuna immagine`;
- pulsante `Carica immagine` per amministratori;
- i non amministratori vedono soltanto lo stato/anteprima.

Desktop e tablet usano un blocco orizzontale compatto; smartphone usa miniatura più piccola e azioni a capo senza occupare l’intero schermo. U.M. e Dati Danea non vengono modificati.

## 10. Griglia Prodotti

Aggiungere `Immagine` a `PRODUCT_COLUMNS`:

- non visibile nelle impostazioni predefinite;
- disponibile nel menu Colonne, che resta aperto per selezioni consecutive;
- mantiene ordine, larghezza e visibilità nelle preferenze personali già esistenti;
- larghezza iniziale compatta e minima fissa;
- miniatura piccola se presente, indicatore discreto `—` se assente;
- nessun uso di `ImageFileName`/`ImageFolder` come URL.

Il filtro aggiuntivo sarà `Tutte / Con immagine / Senza immagine`, combinabile con ricerca, categoria, archivio e stato. La lista smartphone non aggiunge immagini automaticamente al riepilogo: resta veloce; l’immagine si vede aprendo il dettaglio.

Ordinamento della colonna: prima con immagine/senza immagine. CSV: valore `Sì/No`. Stampa: indicatore testuale `Sì/No`, non download massivo delle miniature. Selezione globale, stampa ed esportazione mantengono il comportamento già esistente.

## 11. Aggiornamenti Danea

Nessuna modifica al parser e nessuna immagine binaria entra nell’import.

- FULL e INCREMENTAL continuano ad aggiornare `products.image_file_name` e `products.image_folder` come riferimenti Danea.
- `product_images` non viene mai toccata dall’import, dalla riconciliazione FULL o dalla depubblicazione.
- Un cambio di `ImageFileName` aggiorna soltanto i Dati Danea.
- L’immagine Trevi Fruit resta associata allo stesso `product_id` e archivio.
- Nessun recupero automatico dal percorso locale Danea.

## 12. Migrazione e file previsti

1. Creare bucket privato `product-images` con limite coerente ai file finali.
2. Migrazione SQL: `product_images`, `storage_cleanup_queue`, GRANT, RLS, trigger di coerenza, funzioni SQL atomiche e audit.
3. Nuove funzioni server per preparazione upload, finalizzazione/validazione, URL firmati, rimozione e pulizia.
4. Nuovo componente immagine nel dettaglio, senza modificare `SalesUnitManager`.
5. Estensione del tipo/query prodotto con presenza immagine e metadati minimi.
6. Colonna Immagine, filtro e firma batch delle sole righe visibili.
7. Aggiornamento dei tipi generati dal database e della roadmap dopo test conclusi.

Nessun backfill: tutti i prodotti iniziano correttamente come `Senza immagine`, anche quando Danea ha fornito un nome file.

## 13. Test

### Database e isolamento

- amministratore azienda A carica/sostituisce/rimuove immagini dei propri prodotti;
- operatore e trasportatore non possono modificare;
- utente azienda B non può leggere metadati, ottenere URL firmate, caricare o rimuovere file di A;
- prodotto con stesso codice in due archivi riceve immagini differenti;
- prodotto/archivio/azienda incoerenti vengono rifiutati;
- audit registra attore e azione senza URL firmate o contenuto file.

### File

- JPEG, PNG e WEBP validi accettati;
- estensione falsa, MIME falso, file corrotto, SVG/GIF/HEIC, file oltre 12 MB o oltre 8.000 px rifiutati;
- orientamento corretto, proporzioni mantenute, metadati rimossi;
- principale e miniatura rispettano dimensioni e limiti;
- URL scaduta non permette più lettura.

### Ciclo di vita

- sostituzione riuscita mostra subito la nuova immagine e rimuove la vecchia;
- errore durante upload/finalizzazione conserva la precedente;
- rimozione mostra `Nessuna immagine`;
- fallimento di cancellazione crea una voce di pulizia e il retry elimina l’orfano;
- due sostituzioni concorrenti non lasciano attiva una versione obsoleta.

### Interfaccia e prestazioni

- ordine del dettaglio: U.M. → Immagine → Dati Danea;
- desktop, tablet e smartphone compatti e senza sovrapposizioni;
- colonna nascosta di default, attivabile, ridimensionabile, spostabile e persistente per dispositivo;
- filtro Con/Senza immagine corretto insieme agli altri filtri;
- griglia scarica solo miniature della pagina visibile quando la colonna è attiva;
- CSV e stampa restituiscono Sì/No e rispettano filtri/selezione;
- nessuna immagine falsa quando esistono solo i riferimenti Danea.

### Regressione Danea e U.M.

- FULL e INCREMENTAL aggiornano i riferimenti Danea ma lasciano invariata l’immagine Trevi Fruit;
- depubblicazione del prodotto conserva l’immagine;
- archivi, prezzi, costi, U.M. e conversioni — inclusa CICORIA `1 cs ≈ 15 kg` — restano invariati;
- build e test runtime senza errori.

## Decisioni proposte da approvare

- Un’immagine corrente per prodotto, con versione principale e miniatura.
- Sorgenti fino a 12 MB/8.000 px; salvataggio normalizzato WEBP 1.600 px + miniatura 160 px.
- Bucket privato, URL firmate brevi e nessun accesso diretto generico dal browser.
- Modifica riservata agli amministratori; lettura iniziale ai membri dell’azienda, estendibile in futuro ai clienti autorizzati.
- Filtro Con immagine / Senza immagine incluso già in questa fase.
