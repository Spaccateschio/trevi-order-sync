# Scarico ordini B2B in Danea («Scarica ordini da e-commerce»)

## 1. Il file allegato
- Formato `EasyfattDocuments` (Easyfatt-XML, AppVersion 2), lo stesso che Danea accetta in «Scarica ordini». 4 documenti, 47 righe.
- `DocumentType` = `C` (ordine cliente). Numeri 7715–7718, data 2026-10-14.
- Cliente: `CustomerCode` (es. `0223`) + nome, indirizzo, P.IVA, C.F., codice SDI. Un documento ha anche `Delivery*` (destinazione diversa).
- Righe: `Code` (codice articolo Danea, es. `0091`), `Description`, `Qty`, `Um` (kg/pz), `Price`, `VatCode`, `Notes`.
- Prezzi presenti su tutte le righe; `PriceList` = «Listino 1»; `PricesIncludeVat` = false.

Per lo scarico serve solo un sottoinsieme: totali, IVA, pagamento, agente, trasporto possono restare vuoti (Danea li ricalcola).

## 2. Cosa esiste già (da riutilizzare)
- Postazioni Danea (`danea_stations`): utente + password con impronta PBKDF2, mai in chiaro, revocabili, con campo `allowed_uses` (oggi solo `prodotti`).
- `src/lib/danea-auth.server.ts`: verifica HTTP Basic, registro tentativi falliti.
- Indirizzo pubblico `/api/public/danea/products` (ricezione catalogo).
- Pagina Danea in Amministrazione (`danea.tsx`, `danea.functions.ts`): crea/rigenera/revoca postazioni, mostra la password una volta sola.
- `purchase_orders.danea_exported_at`: colonna già presente, oggi non usata.
- Cliente: `customer_records` collegato all'ordine tramite `supplier_customer_relations.customer_record_id`; codice cliente Danea in `internal_reference` (da confermare sui dati).
- Articoli: righe ordine del cliente → collegamento B2B → articolo del venditore con `products.code` e `danea_um`.

## 3. Proposta

**Indirizzo (fisso, uguale per tutti):**
`https://trevi-order-sync.lovable.app/api/public/danea/orders`

**Login e password:** nuova postazione dedicata con uso `ordini` (separata da quella dei prodotti), creata dalla pagina Danea. Password mostrata una volta sola, rigenerabile e revocabile. L'azienda (Trevi Srl) si ricava dalla postazione.

**Quali ordini escono:** solo ordini ricevuti da Trevi come venditore, inviati via piattaforma (B2B), stato inviato / confermato / in preparazione. Esclusi: bozze, annullati, ordini non B2B, già scaricati.

**Doppioni:** al primo scarico l'ordine prende la data in `danea_exported_at` e lo stato visibile **«Scaricato da Danea»** (non «importato»). Allo scarico successivo non esce più. Comando per l'amministratore **«Rimetti in scarico»** (svuota la data, registrato nello storico). Ogni scarico viene registrato in `danea_sync_runs` con elenco ordini.

**Modifiche dopo lo scarico:** se il cliente modifica un ordine già scaricato, compare un avviso «modificato dopo lo scarico»; non viene rimesso in scarico in automatico.

**Cliente:** `CustomerCode` = codice cliente Danea dell'anagrafica collegata, più nome, P.IVA, C.F., indirizzo e destinazione. Se manca il collegamento all'anagrafica o il codice, l'ordine **non esce** e viene segnalato in diagnostica.

**Articoli e U.M.:** `Code` = codice Danea dell'articolo del venditore. `Um` = U.M. della riga così come ordinata. Nessuna conversione: se l'U.M. ordinata non è quella Danea dell'articolo, la riga esce con la sua U.M. e una nota; se manca il codice articolo l'ordine viene bloccato e segnalato.

**Prezzi:** il prezzo B2B fotografato sulla riga (netto, `PricesIncludeVat=false`). Se manca («Prezzo su richiesta»), `Price` vuoto: Danea applicherà il suo listino. Per i prodotti a peso variabile il prezzo resta indicativo.

**Numero ordine:** `Number` = numero ordine Trevi Fruit; numero cliente nelle note.

## 4. Punti da verificare con te / su una copia di Danea
- Danea chiama l'indirizzo con utente e password in HTTP Basic (come già per i prodotti): da confermare con una prova su Danea di test.
- Se Danea riconosce un ordine già importato con lo stesso numero, o crea un doppione.
- Il codice cliente Danea è in `internal_reference`? Lo verifico sui dati prima di procedere.

## 5. Valori da inserire in Danea
- **URL:** `https://trevi-order-sync.lovable.app/api/public/danea/orders` (attivo solo dopo la pubblicazione)
- **Login:** quello della nuova postazione «ordini» (es. `trevi-ordini-xxxx`), creato dalla pagina Danea
- **Password:** quella mostrata una volta sola alla creazione

## Dettagli tecnici
- Migrazione: consentire `ordini` in `allowed_uses`; funzioni SECURITY DEFINER `danea_orders_for_export`, `danea_mark_orders_exported`, `danea_requeue_order` (admin), audit.
- Nuovi file: `src/routes/api/public/danea/orders.ts`, `src/lib/danea-orders-xml.server.ts` (+ test sul tracciato con il file allegato come riferimento).
- Modifiche: `danea-auth.server.ts` (nessuna, già generico), `danea.tsx`/`danea.functions.ts` (postazione ordini, elenco scaricati, «Rimetti in scarico»), badge «Scaricato da Danea» negli ordini ricevuti.
- Nessuna prova su dati operativi: test con XML generato da dati finti.
