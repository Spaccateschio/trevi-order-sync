# Archivi Danea su clienti e listini

## Cosa ho verificato nel progetto

- **Prodotti**: già legati all'archivio. ✓
- **Listini**: la tabella dei listini **ha già** il campo archivio e la sincronizzazione dei nomi scrive già nell'archivio dell'import in corso. Manca però il vincolo di unicità su (azienda, archivio, numero): senza di esso l'aggiornamento dei nomi può creare righe doppie invece di aggiornare, ed è da lì che nascono nomi incoerenti. Oggi esiste un solo archivio ("Archivio principale", 9 listini, 14 prodotti), quindi nulla è stato sovrascritto tra archivi.
- **Clienti**: nessun campo archivio. Da aggiungere, con scelta obbligatoria all'import.
- **Prezzi e listini assegnati**: le funzioni di risoluzione (prezzi acquirente, listino predefinito, assegnazione listino) cercano il listino per azienda + numero, **senza archivio**: con due archivi il numero 2 diventa ambiguo.

## Cosa farò

### 1. Listini per archivio, senza ambiguità
- Rendo univoca la terna azienda + archivio + numero listino (unendo eventuali righe doppie preesistenti), così ogni archivio ha i suoi nomi e non li perde più.
- Gli elenchi "Listino assegnato" e "Listino predefinito" mostrano i listini raggruppati per archivio, con il nome dell'archivio accanto.

### 2. Archivio sui clienti
- Nuovo campo archivio sull'anagrafica cliente, vuoto per i clienti già presenti.
- Nell'importazione da file compare, prima dell'anteprima, la scelta obbligatoria dell'archivio Danea: nessuna deduzione dal nome o dal contenuto del file. L'archivio scelto viene salvato su ogni cliente creato o aggiornato.
- Il riconoscimento dei clienti già presenti (codice Danea, P.IVA, codice fiscale) avviene **solo all'interno dell'archivio scelto**: stesso codice o stessa P.IVA in due archivi restano due schede distinte, mai unite. I clienti senza archivio vengono confrontati solo per l'archivio "non assegnato".

### 3. Prezzi risolti nell'archivio del cliente
- Il listino assegnato a un cliente viene risolto sui listini del suo archivio; cliente senza archivio: comportamento identico a oggi.
- L'assegnazione manuale del listino accetta solo numeri esistenti nell'archivio del cliente.
- **La visibilità del catalogo non cambia**: l'archivio del cliente serve solo a risolvere i suoi listini, non limita i prodotti che può vedere o acquistare. Resta possibile, in futuro, comprare da più archivi.

## Fuori scope (confermato)
Applicazione automatica della colonna "Listino" del file clienti (resta al Punto 5c), cancellazione dati di test, fusione clienti tra archivi. Resta in coda anche la richiesta precedente su conferma/sovrascrittura dei dati in import e sul valore listino "Rompi" non riconosciuto: la affronto dopo, separatamente.

## Note tecniche
- Migrazione additiva: indice unico `danea_price_lists (company_id, archive_id, list_number)` dopo consolidamento dei duplicati; `customer_records.archive_id uuid NULL REFERENCES danea_archives(id)` + indice su (seller_company_id, archive_id); trigger di coerenza archivio↔azienda come per i prodotti.
- `manage_customer_record`: nuovo parametro `_archive_id uuid DEFAULT NULL`, scritto in create e in update (solo se passato), `SECURITY DEFINER`, `search_path = public`, controlli `is_company_admin` + `company_sells` invariati.
- `buyer_catalog_prices`, `resolve_default_price_list`, `set_customer_price_list`: risoluzione del listino vincolata all'`archive_id` del cliente (fallback attuale quando NULL). Nessun filtro prodotti per archivio: la visibilità del catalogo resta quella di oggi.
- Frontend: `fetchActivePriceLists` restituisce anche l'archivio (raggruppamento nelle select), selettore archivio in `customer-import-dialog.tsx`, matching per archivio in `buildPreview` (`src/lib/customer-import.ts`), archivio mostrato nella scheda cliente.
- Nessuna modifica a import prodotti, relazioni B2B, doppio consenso, inviti, destinazioni.

## Verifiche
- Due file con stessi codici e stesse P.IVA importati su due archivi → schede separate, nomi listini intatti su entrambi.
- Listino 2 assegnato a un cliente dell'archivio A → prezzi del listino 2 di A, mai di B.
- Un solo archivio: comportamento identico a oggi; build e controlli su computer e smartphone.
