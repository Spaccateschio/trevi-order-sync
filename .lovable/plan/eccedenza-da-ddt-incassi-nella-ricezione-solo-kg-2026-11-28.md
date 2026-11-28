# Eccedenza da DDT Incassi nella ricezione (solo kg)

## Obiettivo
Se una riga a peso (kg) è abbinata a un DDT di Incassi, non ha una dichiarazione del fornitore e sul DDT c'è più di quanto ordinato (es. 1 kg ordinato, 1,55 kg sul DDT), l'acquirente può registrare quantità e prezzo del DDT con un esito esplicito **«Eccedenza»**. Nulla viene scritto prima di «Conferma carico». «OK» resta legato alla quantità esatta. Pezzi, unità diverse e ordini con dichiarazione del fornitore non cambiano.

## Perimetro
- Si cambiano: `receive_purchase_order` (nuova migrazione 0123), `receive-outcomes.ts`, `incassi-receive.ts` (solo la classificazione), `receive-goods-panel.tsx` (nuova scelta di esito) e i test.
- Non si toccano: contestazioni (`dispute_*`/`resolve_*`), Danea, il ponte Incassi, `confirm_goods_receipt`, invio ordini, Lista, Carrello.

## Primo passo: verifica in sola lettura
Leggere la definizione in uso (`pg_get_functiondef`) di `_delivery_set_item_core`, `submit_purchase_delivery`, `accept_purchase_delivery`, `open_goods_receipt` e `confirm_goods_receipt`, per controllare che nessuna abbia un proprio tetto sull'ordinato. Se una ce l'ha, ci si ferma e si torna con quel dato. Il piano non la modifica.

## Regole dell'esito «Eccedenza» (tutte obbligatorie)
1. La consegna è nuova (`_delivery_id IS NULL`): nessuna dichiarazione del fornitore.
2. L'unità d'ordine della riga (`COALESCE(purchase_unit_code, unit_code)`) è `kg` e coincide con l'unità di magazzino (`unit_code`).
3. Quantità arrivata > quantità da ricevere (`v_base`), e quantità buona = quantità arrivata.
4. La richiesta porta `excess_confirmed = true` e `ddt_document_id`. Il server controlla che quel documento sia di questo ordine, di questa azienda acquirente e dello stesso fornitore. Verifica in sola lettura di `supplier_delivery_documents`; nessuna scrittura su Incassi.
5. Tetto di sicurezza: arrivato ≤ quantità del DDT per quella riga, con codice Danea uguale (`supplier_product_code`), letta lato server. Mai una quantità più alta del documento.

## Migrazione 0123: `CREATE OR REPLACE` di `receive_purchase_order`, solo queste righe
Firma, sicurezza (`SECURITY DEFINER`, `search_path=public`), autorizzazioni e commento restano invariati.
- **Riga 47** (controllo dell'esito): aggiungere `'eccedenza'` alla lista degli esiti ammessi. Tutto il resto della riga resta com'è.
- **Dopo la riga 75** (tetto `v_arrived > v_base`): trasformarla in
  `IF (v_arrived > v_base AND v_outcome <> 'eccedenza') OR (v_outcome='ok' AND v_arrived <> v_base) THEN RAISE ...` (stesso messaggio).
- **Nuovo blocco subito dopo**, solo per `v_outcome='eccedenza'`: `RAISE EXCEPTION` se
  - `NOT v_new`;
  - unità diversa da `kg`, o unità d'ordine diversa da quella di magazzino;
  - `v_arrived <= v_base` o `v_verified <> v_arrived`;
  - `excess_confirmed` diverso da true;
  - il documento non appartiene all'ordine, all'azienda o al fornitore;
  - la riga del DDT manca, è ripetuta o ha una quantità minore di `v_arrived`.
  Messaggio: «Eccedenza non valida: …». Tutto avviene prima della prima scrittura, come chiede la regola «niente stato a metà».
- **Riga 76** (`parziale`): invariata.
- **Riga 78** (stessa unità): invariata. Con `kg`/`kg` richiede `verified = quantity`, già coperto.
- **Riga 79** (`verified > declared`): invariata. Il browser manda `declared_stock_quantity` uguale all'arrivato.
- **Righe 88–101** (apertura della consegna interna): invariate.
- **Righe 102–104** (`_delivery_set_item_core`): invariate. Riceve 1,55 sia come arrivato sia come dichiarato interno.
- **Righe 116–131** (contestazioni): invariate. Con dichiarato interno = verificato, `v_basis` coincide con il dichiarato e non si apre nessuna contestazione. Su questo va anche il test 3.
- **Riga 129** (`accepted_purchase_quantity`): invariata. Vale 1,55 solo se la riga ha un'unità d'acquisto.
- **Righe 137–150** (riga del carico): invariate. `verified_quantity` = 1,55, `unit_cost` e `price_quantity` dal prezzo del DDT inviato dal browser, come già oggi.
- **Audit** (`purchase_order.received_atomic`): aggiungere a `detail` `excess_lines` (riga, ordinato, arrivato, documento) solo se ci sono eccedenze.

## Effetti
- **Giacenza**: il lotto viene creato da `confirm_goods_receipt` con 1,55 kg, perché unità d'acquisto e di magazzino sono le stesse (kg). Nessuna conversione.
- **Costo**: `unit_cost` = prezzo del DDT al kg, `price_quantity` = 1,55. Il costo reale nasce dal peso ricevuto, come previsto per il peso variabile. Il prezzo indicativo dell'ordine non lo sostituisce.
- **Da ricevere**: `GREATEST(0, ordinato − ricevuto)` → 0. La riga risulta completa, mai negativa. Lo stato dell'ordine segue la logica attuale di `confirm_goods_receipt` (ricevuto ≥ ordinato → consegnato).
- **Prezzo d'ordine e Danea**: invariati.

## Schermata (solo presentazione e payload)
- `incassi-receive.ts`: nuovo stato `eccedenza` quando l'unità è kg in entrambi, la quantità del DDT è maggiore dell'ordinato e non c'è dichiarazione. Gli altri casi restano come oggi: `differenza` se è minore, `da_controllare` per pz e unità diverse.
- `receive-outcomes.ts`: `ReceiveOutcome` si allarga con `'eccedenza'`. Il tetto `arrived > baseline` (righe 73–74) viene saltato solo con esito `eccedenza` e stato DDT `eccedenza`. Il payload aggiunge `excess_confirmed` e `ddt_document_id`. Quantità e prezzo proposti restano bozze locali.
- `receive-goods-panel.tsx`: sulla riga compare l'avviso «Sul documento 1,55 kg, ordinati 1 kg» e il pulsante di esito «Registra eccedenza (1,55 kg)». «OK» propone ancora la quantità da ricevere esatta. Il riepilogo prima di «Conferma carico» elenca le eccedenze.

## Test
**Logica pura (vitest)**
1. kg, DDT 1,55 su 1 ordinato, nessuna dichiarazione → stato `eccedenza`, payload con 1,55 e `excess_confirmed`.
2. «OK» sulla stessa riga → quantità 1.
3. pz con 2 su 1 ordinato → `differenza`, nessuna eccedenza possibile.
4. Unità diversa → `da_controllare`.
5. Con dichiarazione del fornitore → eccedenza non offerta.
6. Eccedenza scritta a mano sopra il DDT → errore.

**SQL in rollback** (`BEGIN … ROLLBACK`, utente autenticato di 3 EMME tramite `request.jwt.claims`, ordine di prova di 3 EMME creato dentro la transazione con una riga kg e un documento in `supplier_delivery_documents`, nessun invio). Prima e dopo: conteggi e checksum delle tabelle coinvolte (ordini, consegne, carichi, lotti, movimenti, contestazioni, audit), che devono essere identici dopo il ROLLBACK.
1. Eccedenza valida 1,55 → carico confermato, lotto 1,55 kg, `unit_cost` del DDT, da ricevere 0, nessuna contestazione, ordine consegnato.
2. «OK» con 1,55 → errore, nessuna scrittura.
3. Eccedenza senza `excess_confirmed` → errore.
4. Eccedenza su una riga pz → errore.
5. Eccedenza con consegna dichiarata dal fornitore → errore.
6. Eccedenza sopra la quantità del DDT (1,60) → errore.
7. Documento di un altro ordine o azienda → errore.
8. Stessa `request_key` ripetuta → risposta `duplicate`, un solo carico.

Nessuna prova su Trevi o altre aziende reali; il collaudo a schermo con carico vero resta ad Andrea su 3 EMME.

## Regole da registrare
In AGENTS.md: l'eccedenza è solo per kg, consegne nuove e documento Incassi verificato lato server; «OK» resta esatto; le contestazioni non cambiano.
