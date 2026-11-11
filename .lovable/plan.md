# Archivi Danea su clienti e listini

## Cosa ho verificato nel progetto
- **Prodotti**: già legati all'archivio.
- **Listini**: hanno già il campo archivio e la sincronizzazione dei nomi aggiorna per azienda + archivio + numero. Verificato oggi nel database: l'indice unico su questa terna **esiste già**, quindi non va toccato.
- **Clienti**: nessun campo archivio. Da aggiungere, con scelta obbligatoria all'import.
- **Prezzi e listini assegnati**: le funzioni di risoluzione cercano il listino per azienda + numero, senza archivio: con due archivi il numero 2 diventa ambiguo.

## Cosa farò

### 1. Listini per archivio
- L'unicità azienda + archivio + numero è già garantita: nessuna modifica.
- Gli elenchi "Listino assegnato" e "Listino predefinito" mostrano i listini raggruppati per archivio.

### 2. Archivio sui clienti
- Nuovo campo archivio sull'anagrafica cliente, vuoto per i clienti già presenti.
- All'importazione da file, prima dell'anteprima, scelta obbligatoria dell'archivio Danea: nessuna deduzione dal file. L'archivio scelto viene salvato su ogni cliente creato o aggiornato.
- Riconoscimento dei clienti già presenti (codice Danea, P.IVA, codice fiscale) solo dentro l'archivio scelto: stessi dati in due archivi restano due schede distinte.

### 3. Prezzi risolti nell'archivio del cliente
- Il listino del cliente si risolve sui listini del suo archivio; cliente senza archivio: come oggi.
- L'assegnazione manuale accetta solo listini dell'archivio del cliente.

### 4. Catalogo limitato all'archivio del cliente (decisione del titolare)
- Cliente collegato a un'anagrafica con archivio: vede solo i prodotti di quell'archivio in vetrine, «Tutti i prodotti», pagina prodotto e preferiti.
- Anagrafica senza archivio: comportamento identico a oggi.
- Filtro applicato dal server, mai solo nella pagina: un prodotto di un altro archivio non è leggibile né acquistabile neppure da link diretto.
- Effetto da sapere: un preferito su un prodotto di un altro archivio smette di comparire (non viene cancellato).

## Fuori scope (confermato)
Colonna "Listino" del file clienti (Punto 5c), cancellazione dati di test, fusione clienti tra archivi. Restano in coda conferma/sovrascrittura in import e valore listino "Rompi".

## Note tecniche
- **Indice listini**: `danea_price_lists_archive_unique (company_id, archive_id, list_number)` verificato presente nel database live (migrazione 20260917043558) → nessun DROP né ricreazione. Solo se al momento dell'applicazione risultasse assente: consolidamento duplicati + `CREATE UNIQUE INDEX IF NOT EXISTS`.
- **Clienti**: `customer_records.archive_id uuid NULL REFERENCES danea_archives(id)` + indice (seller_company_id, archive_id); trigger di coerenza archivio↔azienda come per i prodotti.
- **`manage_customer_record` senza overload**, nella stessa migrazione: `DROP FUNCTION` della firma attuale esatta → `CREATE FUNCTION` con la nuova firma che aggiunge in coda `_archive_id uuid DEFAULT NULL` → `REVOKE ALL ... FROM PUBLIC, anon` → `GRANT EXECUTE ... TO authenticated` sulla nuova firma. Mai `CREATE OR REPLACE` con parametro aggiunto. Corpo invariato salvo la scrittura di `archive_id` (create; update solo se passato); `SECURITY DEFINER`, `search_path = public`, controlli `is_company_admin` + `company_sells` invariati. Dopo l'applicazione: verifica che esista una sola funzione con quel nome.
- **Discrepanza da segnalare**: la firma live letta oggi ha **35 argomenti**, non 19: `(uuid, text, uuid, 29×text, jsonb, smallint, uuid)`. Il DROP userà la firma esatta letta dal database al momento della migrazione; le chiamate del codice passano i parametri per nome e vengono ricontrollate.
- **Prezzi**: `buyer_catalog_prices`, `resolve_default_price_list`, `set_customer_price_list` vincolati all'`archive_id` del cliente (fallback attuale se NULL).
- **Visibilità catalogo lato server**: `can_view_seller_catalogue(uuid)` resta il controllo d'accesso al venditore; nuova funzione `buyer_visible_archive(seller_company_id)` (SECURITY DEFINER, `search_path = public`, cliente ricavato da `auth.uid()`) usata da `buyer_catalog_prices`, `buyer_unpublished_favorites`, `b2b_item_purchasable` e dalle query catalogo delle server function (vetrine, «Tutti i prodotti», pagina prodotto, preferiti): anagrafica con `archive_id NULL` → nessun filtro; altrimenti `products.archive_id = archivio del cliente`.
- **Frontend**: `fetchActivePriceLists` restituisce l'archivio (raggruppamento), selettore archivio in `customer-import-dialog.tsx`, matching per archivio in `buildPreview` (`src/lib/customer-import.ts`), archivio mostrato nella scheda cliente.
- Nessuna modifica a import prodotti, relazioni B2B, doppio consenso, inviti, destinazioni.

## Verifiche
- Due file con stessi codici e P.IVA su due archivi → schede separate, nomi listini intatti.
- Listino 2 a un cliente dell'archivio A → prezzi del listino 2 di A, mai di B.
- Cliente dell'archivio A: nessun prodotto dell'archivio B in vetrine, «Tutti i prodotti», pagina prodotto (anche da link diretto), preferiti e ordini; cliente senza archivio: catalogo invariato.
- Una sola funzione `manage_customer_record`; salvataggio clienti esistente funzionante.
- Un solo archivio: comportamento identico a oggi; build e controlli su computer e smartphone.
