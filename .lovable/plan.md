# Importazione clienti: listini corretti e conferma sui dati da sovrascrivere

## Cosa ho trovato nel nuovo file

- Il nuovo `Soggetti_2.ods` usa nomi di listino generici: **Listino 1** (39 clienti), **Listino 2** (48), **Listino 3** (15), **Rompi** (2), 2 righe senza listino.
- I listini nel tuo gestionale sono registrati con i vecchi nomi: **1 = BAR**, **2 = RISTORANTE**, **3 = Listino 13**. Quindi il cliente viene collegato al numero giusto, ma nella scheda leggi il vecchio nome: "Listino 1" appare come "BAR", "Listino 3" come "Listino 13". È questo il motivo principale della sensazione di listini sbagliati.
- **Rompi** non corrisponde a nessun listino: quei clienti restano con il listino precedente, senza avvisarti in modo chiaro.
- I clienti eliminati (nascosti) non vengono confrontati durante l'importazione: reimportandoli nascono **doppioni** (es. AL MORO presente due volte).
- Oggi l'aggiornamento riempie i campi vuoti e sostituisce quelli compilati, ma non ti chiede nulla e non può svuotare un dato che nel nuovo file è stato cancellato.

## Cosa farò

### 1. Listini: nome giusto e abbinamento manuale
- Nell'anteprima compare una riga per ogni valore di listino trovato nel file, con il listino a cui verrà assegnato ("Listino 1 → listino 1 · BAR").
- Per i valori non riconosciuti (**Rompi**) scegli tu dall'elenco a quale listino corrisponde, oppure "non assegnare". La scelta viene ricordata per le importazioni successive.
- Se nel file un listino ha un nome nuovo, posso aggiornare il nome mostrato nell'app con quello del file (spunta "Aggiorna i nomi dei listini dal file"), così "BAR" diventa "Listino 1" solo se lo confermi.

### 2. Conferma prima di sovrascrivere
- Per i clienti già presenti l'anteprima elenca, cliente per cliente, i dati che cambiano: valore attuale → nuovo valore (compreso il listino).
- In alto scegli una volta come comportarti:
  - **Sostituisci tutto con il nuovo file** (svuota anche i campi che nel file sono vuoti),
  - **Aggiorna solo dove il file ha un dato** (comportamento attuale),
  - **Solo campi vuoti** (non tocca nulla di già compilato).
- Puoi comunque deselezionare i singoli clienti che non vuoi aggiornare.

### 3. Niente doppioni
- Il confronto include anche i clienti eliminati: se un cliente del file corrisponde a uno eliminato, l'anteprima lo segnala e lo ripristina aggiornandolo, invece di creare una scheda nuova.

## Note tecniche

- Migrazione: `manage_customer_record` con nuovo parametro `_overwrite boolean DEFAULT false` (quando true i campi passati sostituiscono il valore esistente, anche con NULL) e `_price_list_number` che può essere azzerato solo in modalità sostituzione; `SECURITY DEFINER`, `search_path = public`, controlli `is_company_admin` + `company_sells` invariati. Nuova RPC `set_price_list_display_name(_company_id, _list_number, _display_name)` per l'opzione dei nomi, admin-only.
- `src/lib/customer-import.ts`: mappa nomi listino → numero con override manuale (`resolvePriceListNumber` esteso), `buildPreview` riceve anche i clienti eliminati e restituisce l'esito `restore`, calcolo del diff campo per campo.
- `src/components/companies/customer-import-dialog.tsx`: pannello listini con Select per i valori non riconosciuti, scelta della modalità di aggiornamento, elenco differenze per cliente.
- `src/components/companies/customer-records-panel.tsx`: passa tutti i clienti (compresi gli eliminati) al dialogo.
- Nessuna modifica a prodotti, collegamenti B2B, RLS esistenti, destinazioni o indirizzi.

## Verifiche

- Import di `Soggetti_2.ods`: nessun doppione, "Rompi" chiesto una volta, 102 clienti con listino atteso.
- Cliente con dato svuotato nel file: aggiornato solo in modalità "Sostituisci tutto".
- Controllo su computer e smartphone, build senza errori.
