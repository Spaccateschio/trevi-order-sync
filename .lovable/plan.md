# DDT Incassi senza ORD: ordini telefonici visibili al cliente

## 1. Cosa succede oggi (verificato nel codice e nei dati)
- L'endpoint salva comunque il DDT in `supplier_delivery_documents`. Senza ORD nelle note, `resolveOrderLink` restituisce `link_status = 'da_controllare'`, `link_reason = 'riferimento_mancante'`, `purchase_order_id = NULL`, `buyer_company_id = NULL`. Il codice cliente (es. 0758) viene salvato in `customer_code`, ma oggi non serve ad abbinare il cliente: l'abbinamento cerca un ordine (`incassi_find_orders`) solo quando c'è un ORD.
- La tabella ha una sola regola di lettura (`sdd_read_seller`): la vede solo l'azienda fornitrice. L'app la legge solo nella ricezione, filtrando per `purchase_order_id` dell'ordine. **Il cliente non lo vede da nessuna parte.**
- Dati reali oggi: 11 DDT, tutti `collegato` con ordine e cliente; nessun DDT `da_controllare`. Il codice 0758 corrisponde a un collegamento Trevi→cliente attivo, con permessi accesi da entrambe le parti.

## 2. «Ordini fornitore»
No. La pagina elenca solo `purchase_orders` del cliente. Un DDT senza ordine non crea nessuna riga, quindi lì non compare niente.

## 3. Proposta
Un nuovo tipo di ordine con provenienza «Inserito dal fornitore», creato a partire dal DDT. Dopo la creazione si comporta come gli altri ordini: righe, prezzi, timeline, ricezione e carico.

Flusso:
```text
DDT senza ORD → codice cliente → collegamento attivo e unico (customer_records.internal_reference)
   ├─ nessun collegamento / più collegamenti → resta «da controllare» (come oggi)
   └─ collegamento trovato → ordine «Inserito dal fornitore» (automatico o dopo conferma di Trevi)
          righe: codice Danea → articolo del collegamento del cliente
          DDT collegato (link_status collegato) → passi 4–6 e ricezione con «Arrivato/Prezzo» dal DDT
```
- Per ogni riga: quantità e U.M. del DDT; prezzo indicativo dal DDT, perché il costo vero si stabilisce comunque al carico; ordine con `status = inviato`.
- Numero ORD nuovo, come per tutti gli ordini. Un DDT può avere al massimo un ordine, garantito da un vincolo unico sul documento.
- Se poi Incassi rimanda lo stesso DDT (stesso `external_id`), aggiorna il documento, non l'ordine.

### Rischi e come si coprono
- **Duplicati**: il cliente ha già fatto l'ordine nell'app, ma Trevi non ha scritto l'ORD. Si creerebbe un secondo ordine. Protezione: se esiste già un ordine aperto dello stesso cliente con consegna in quella data, nessuna creazione automatica: va a «da controllare» con un avviso. Anche i doppi invii di Incassi vanno coperti: un vincolo unico DDT→ordine e la creazione sotto lock.
- **Prodotti del DDT senza corrispondenza** nel catalogo del cliente (codice Danea senza collegamento/prodotto): la riga non si abbina mai a caso. Vedi la scelta C.
- **DDT modificato dopo**: finché la merce non è caricata, quantità e prezzi dell'ordine si allineano al DDT e ogni cambio va in `purchase_order_changes`. Dopo il carico l'ordine non cambia più: la differenza appare solo come avviso.
- **DDT annullato**: l'ordine va ad «Annullato» solo se non ci sono carichi. Con un carico già fatto resta com'è, con un avviso per Trevi e per il cliente.
- **Ordine inviato dal cliente dopo il DDT**: si crea un doppione per la stessa merce. Al cliente compare l'avviso «C'è già un ordine inserito dal fornitore per questa consegna». Non c'è nessuna fusione automatica.
- **Danea**: l'ordine nasce da un documento che in Danea esiste già. Va escluso dallo scarico ordini verso Danea, altrimenti in Danea finirebbe due volte.
- **Sicurezza**: la creazione avviene solo nel server, dopo la verifica della chiave Incassi, ed è limitata al fornitore `TREVI_INCASSI_SELLER_COMPANY_ID` e a collegamenti attivi con permessi accesi.

### Scelte che spettano a te
- **A. Creazione**: automatica all'arrivo del DDT, oppure dopo conferma di Trevi da un nuovo elenco «DDT da abbinare» (suggerito per l'inizio).
- **B. Etichetta** visibile al cliente: «Inserito dal fornitore», «Ordine telefonico» o altro testo.
- **C. Righe non abbinate**: (1) entrano come righe solo descrittive, visibili ma non caricabili in giacenza finché non vengono abbinate; (2) bloccano la creazione dell'ordine finché Trevi non le abbina; (3) vengono escluse, con un avviso.
- **D. Doppione con un ordine già esistente**: chiedere sempre a Trevi (suggerito) oppure abbinare in automatico se la data e il cliente coincidono.
- **E. Prezzo mostrato**: prezzo del DDT oppure listino B2B del cliente (`applicable_b2b_price`), come negli ordini normali.

## Dettagli tecnici (fase successiva, solo dopo la tua approvazione)
- Migrazione: `purchase_orders.origin` (es. `cliente` | `fornitore_ddt`), riferimento univoco `source_document_id` → `supplier_delivery_documents`, e la RPC `create_order_from_incassi_document` (SECURITY DEFINER, solo service_role, lock per documento). Esclusione `origin = 'fornitore_ddt'` dagli scarichi Danea.
- Endpoint: abbinamento del cliente via codice anche senza ORD (nuova `incassi_find_relation`), poi creazione o «da controllare» secondo la scelta A.
- Pure helper + vitest: risoluzione cliente, abbinamento righe, regole su duplicati, annullamento e modifica.
- Test SQL in rollback su 3 EMME, nessuna prova su Trevi reale. Il collegamento resta spento finché non lo decidi tu.
