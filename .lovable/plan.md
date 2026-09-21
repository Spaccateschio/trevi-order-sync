# La stella del catalogo significa "questo lo acquisto"

Oggi la stella è solo un segnalibro: i 5 articoli scelti da 3 EMME sul catalogo di trevi restano prodotti del fornitore, quindi non compaiono né in Inventario né nella lista della spesa. Con questa modifica la stella diventa la dichiarazione "questo articolo lo acquisto", e l'articolo entra subito fra i prodotti gestiti dalla mia azienda.

## Cosa cambia per te

1. **Metti la stella su un articolo del catalogo** → l'articolo entra automaticamente fra i prodotti della tua azienda, già collegato al fornitore da cui lo compri (stesso codice, descrizione e unità di misura del fornitore). Nessuna copia doppia: se quell'articolo del fornitore è già collegato a un tuo prodotto, viene riusato quello.
2. **Togli la stella** → l'articolo esce dai preferiti ma **resta** fra i tuoi prodotti (con eventuali conteggi e storico intatti). Niente cancellazioni a catena. Un messaggio te lo dice chiaramente.
3. **Inventario → Conteggio**: vedi l'elenco completo dei prodotti della tua azienda, anche quelli mai contati, senza dover aprire prima un conteggio per capire cosa c'è.
4. **Inventario → Fabbisogno**: legge i prodotti di tutta l'azienda, non di un solo archivio, così i 5 articoli stellati compaiono.
5. **Lista della spesa**: gli stessi prodotti sono già selezionabili, perché sono ora prodotti della tua azienda.
6. Il pulsante "Aggiungi ai miei prodotti" resta, per i casi in cui vuoi collegare la referenza del fornitore a un tuo prodotto già esistente invece di crearne uno nuovo.

## Dettagli tecnici

- La stella continua a scrivere in `buyer_product_favorites`. In aggiunta, al momento dell'inserimento la stessa mutation chiama la RPC esistente `add_catalog_product_to_own_products` (già idempotente: restituisce `created_product` / `created_link`). Nessuna nuova tabella, nessuna migrazione, nessuna modifica a RPC, RLS o formule.
- Punti toccati: `acquisti.catalogo.index.tsx`, `acquisti.catalogo.$sellerId.index.tsx`, `acquisti.catalogo.$sellerId.$productId.tsx` — la logica condivisa va in un hook/helper unico (`src/lib/catalog-favorites.ts`) usato dai tre, così non si duplica.
- Invalidazione: oltre alle query dei preferiti, anche `["prodotti", buyerId]`, `["miei-prodotti-ricerca", buyerId]` e le query di inventario/fabbisogno.
- Rimozione della stella: solo `delete` sui preferiti, nessun tocco a `products` o `product_supplier_links`.
- Inventario: `inventory-count-panel` elenca i prodotti dell'azienda con "Mai contato" dove manca il conteggio; il pannello Fabbisogno interroga i prodotti per `company_id` invece di un singolo archivio.

## Fuori scope

FASE A/B/C/D, formule di giacenza e fabbisogno, database, permessi, il nuovo componente grafico dell'elenco prodotti (resta in coda).
