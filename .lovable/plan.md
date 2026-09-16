# Importazione manuale del file Danea (Opzione B)

Prima cosa, una notizia importante che si legge nella tua ultima schermata: Danea ha scritto
"Ricezione completata con 1 segnalazioni (1 prodotti)". Quel messaggio è **generato da Trevi
Fruit**, quindi il collegamento diretto ha funzionato: Danea si è autenticato, ha inviato il
file, noi lo abbiamo elaborato e gli abbiamo risposto. Danea mostra quel testo dentro una
finestra rossa solo perché accetta come esito positivo esclusivamente la parola "OK". Lo
sistemiamo separatamente; questo piano riguarda l'importazione manuale che hai chiesto.

## Come riutilizzo la logica esistente, senza duplicarla

Oggi il percorso è: indirizzo pubblico → verifica utente e password della postazione →
lettura del file → **un unico motore di importazione** (`importDaneaCatalog`) che si appoggia
a **un unico lettore XML** (`parseDaneaProducts`).

Il caricamento manuale entrerà esattamente in quel motore. Cambia solo la porta d'ingresso:

```text
Danea diretto  → indirizzo pubblico → utente/password → \
                                                          → stesso lettore → stesso motore
File dal computer → pagina Prodotti → utente autenticato → /
```

Non scrivo un secondo lettore né un secondo motore. Restano identici riconoscimento del file,
completo/incrementale, prodotti nuovi, aggiornati e cancellati, identificativo interno, codice,
descrizione, categorie, unità di misura, IVA, i nove listini con i loro nomi, costi e dati del
fornitore, note, immagini, pubblicazione e depubblicazione, ripetibilità senza duplicati e la
protezione sul file completo incompleto o corrotto.

Le due sole modifiche al motore esistente:

1. accetterà come origine sia una postazione sia un'importazione manuale (oggi pretende una
   postazione);
2. l'anteprima userà lo stesso lettore in sola lettura, senza scrivere nulla.

## Sicurezza

L'azienda viene ricavata solo dall'utente collegato e dalla sua appartenenza verificata sul
server: nessun dato dell'azienda può essere indicato o alterato dal file. L'importazione è
riservata agli amministratori dell'azienda che vende (stesso controllo già usato per le
postazioni).

## Nuova pagina Prodotti (Vendite → Prodotti)

Oggi la voce Prodotti non esiste ancora: la creo come **unico** elenco prodotti. Tutto quello
che arriva da Danea, sia dal collegamento diretto sia dall'importazione manuale, si vede qui:
nessun catalogo separato.

Elenco compatto, pensato per molti prodotti, con: codice, descrizione, categoria e
sottocategoria, unità di misura, IVA, prezzo del listino principale e stato
Pubblicato / Non pubblicato. Ricerca rapida per codice o descrizione, filtri per categoria e
per stato, paginazione. In alto il pulsante **Importa da Danea**.

Cliccando un prodotto si apre il dettaglio in sola consultazione dei dati ricevuti da Danea:
identificativo interno, codice, descrizione, categoria e sottocategoria, unità di misura, IVA,
i listini da 1 a 9 presenti con i rispettivi nomi, note, nome e cartella dell'immagine quando
presenti, stato di pubblicazione e ultimo aggiornamento ricevuto da Danea. I dati e il costo
del fornitore compaiono solo agli amministratori dell'azienda.

Nessuna modifica dei prodotti da qui: Danea resta il gestionale dell'anagrafica.

La finestra di importazione ha tre passaggi:

1. **Seleziona file Danea** — scelta del file salvato con "Salva su file" di Danea.
2. **Analizza file** — riepilogo prima di applicare: tipo di invio (completo/incrementale),
   prodotti trovati, nuovi, da aggiornare, da depubblicare, listini trovati con i loro nomi,
   segnalazioni. Se il file completo non è integro, lo dico subito e spiego che nessun prodotto
   verrà depubblicato.
3. **Conferma importazione** — solo qui vengono applicate le modifiche, e alla fine compare
   "Importazione Danea completata" con creati, aggiornati, invariati e depubblicati.

## Storico

Ogni importazione manuale finisce nello stesso storico degli invii, indicata come
**Importazione manuale** invece del nome della postazione, con data, utente che l'ha fatta,
tipo completo/incrementale, numero di prodotti ed esito.

## Cosa non tocco

Indirizzo pubblico fisso, postazioni, credenziali, protezione delle password, collegamento
diretto, struttura di prodotti e listini: tutto invariato.

## Dettagli tecnici

- Migrazione su `danea_sync_runs`: `station_id` diventa opzionale, si aggiungono
  `source` ('postazione' | 'manuale', default 'postazione') e `imported_by`; nessun dato
  esistente perso.
- `importDaneaCatalog` passa da `station` a un `origin` discriminato
  (`{ kind: 'station', ... } | { kind: 'manual', companyId, userId }`); i rami che aggiornano
  la postazione (campi rilevati, `last_success_at`) si eseguono solo per `kind: 'station'`.
- Due nuove funzioni server in `src/lib/danea.functions.ts`, entrambe con
  `requireSupabaseAuth` + `is_company_admin` + `company_sells`: `analyzeDaneaFile` (solo
  `parseDaneaProducts` + confronto con i codici esistenti, nessuna scrittura) e
  `importDaneaFile` (chiama `importDaneaCatalog` con origine manuale + audit log). XML inviato
  come stringa, limite 25 MB come l'endpoint.
- Nuova rotta `src/routes/_authenticated/vendite.prodotti.tsx`, voce di menu con chiave
  stabile `vendite.prodotti` in `src/lib/navigation.ts`, dialog shadcn/ui.
- Verifiche: import manuale del tuo file reale, ripetizione dello stesso file senza duplicati,
  file completo troncato che non depubblica nulla, storico con origine "Importazione manuale",
  utente non amministratore respinto, endpoint diretto ancora funzionante.
