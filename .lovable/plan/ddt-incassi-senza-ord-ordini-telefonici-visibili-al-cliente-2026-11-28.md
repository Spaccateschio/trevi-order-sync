# DDT Incassi senza ORD: ordini telefonici visibili al cliente

## 1. Cosa succede oggi (verificato nel codice e nei dati)
- L'endpoint salva comunque il DDT in `supplier_delivery_documents`. Senza ORD nelle note, `resolveOrderLink` restituisce `link_status = 'da_controllare'`, `link_reason = 'riferimento_mancante'`, `purchase_order_id = NULL`, `buyer_company_id = NULL`. Il codice cliente (es. 0758) viene salvato in `customer_code`, ma oggi non serve ad abbinare il cliente: l'abbinamento cerca un ordine (`incassi_find_orders`) solo quando c'è un ORD.
- La tabella ha una sola regola di lettura (`sdd_read_seller`): la vede solo l'azienda fornitrice. L'app la legge solo nella ricezione, filtrando per `purchase_order_id` dell'ordine. **Il cliente non lo vede da nessuna parte.**
- Dati reali oggi: 11 DDT, tutti `collegato` con ordine e cliente; nessun DDT `da_controllare`. Il codice 0758 corrisponde a un collegamento Trevi→cliente attivo, con permessi accesi da entrambe le parti.

## 2. «Ordini fornitore»
No. La pagina elenca solo `purchase_orders` del cliente. Un DDT senza ordine non crea nessuna riga, quindi lì non compare niente.

## 3. Proposta (con le tue scelte)
Gli ordini con ORD nelle note restano collegati in automatico, come oggi. Per un DDT senza ORD l'ordine nasce solo dopo la conferma di Trevi.

```text
DDT senza ORD → codice cliente (customer_records.internal_reference) → collegamento attivo e unico?
   ├─ no  → resta «da controllare» come oggi (nel riquadro: «cliente non riconosciuto»)
   └─ sì  → riquadro «DDT da abbinare (n)» in «Ordini clienti» del fornitore
              → Trevi abbina le eventuali righe mancanti → «Crea ordine telefonico»
              → ordine «Ordine telefonico» visibile al cliente in «Ordini fornitore»
              → DDT collegato: passi 4–6 e ricezione con Arrivato/Prezzo dal DDT, come oggi
```

### Riquadro «DDT da abbinare (n)» (solo account fornitore)
- Si trova in alto nella pagina «Ordini clienti». Compare solo se ci sono DDT da confermare e solo agli utenti del fornitore: il cliente non lo vede mai.
- Ogni DDT mostra: il cliente (dal codice Danea), il numero e la data del DDT, le righe (codice, descrizione, quantità, U.M., prezzo), l'importo del documento e le righe non abbinate in evidenza.
- Se il cliente ha già un ordine aperto per quella data compare l'avviso «Il cliente ha già l'ordine ORD-… per questa data». È solo un avviso e non blocca la creazione.
- Le righe non abbinate hanno un selettore per scegliere l'articolo del fornitore collegato al cliente. La scelta vale solo per quel DDT: non cambia il catalogo e non salva abbinamenti permanenti.
- Il pulsante «Crea ordine telefonico» è attivo solo quando tutte le righe sono abbinate e hanno quantità e U.M. riconosciute.

### L'ordine creato
- Etichetta «Ordine telefonico», visibile al cliente e al fornitore. Numero ORD nuovo, `status = inviato`, stesso collegamento cliente-fornitore.
- Righe con la quantità, l'U.M. e il **prezzo del DDT** (prezzo indicativo, come per gli altri ordini). Il costo reale resta quello del carico.
- Timeline, schede, ricezione e carico sono gli stessi degli altri ordini.
- **Fuori da Danea**: questo ordine non viene mai scaricato verso Danea, perché il documento in Danea esiste già.

### Rischi e coperture
- **Un DDT, al massimo un ordine**: è l'unico vincolo (riferimento unico al documento + creazione sotto lock). Un secondo clic o un doppio invio di Incassi non crea un altro ordine.
- **Ordine dall'app + telefonata**: è ammesso, con il solo avviso descritto sopra. Il controllo del doppione resta a Trevi.
- **Righe senza corrispondenza**: bloccano la creazione finché Trevi non le abbina. Nessun abbinamento a caso.
- **DDT reinviato da Incassi con modifiche** (stesso `external_id`): il documento si aggiorna come oggi. Prima della creazione il riquadro mostra i dati nuovi. Dopo la creazione l'ordine non viene riscritto in automatico: nella ricezione «Arrivato/Prezzo» seguono già il DDT aggiornato.
- **DDT annullato in Incassi**: prima della creazione esce dal riquadro. Dopo la creazione compare solo un avviso al fornitore e nessun cambio automatico. Annullare resta un'azione esplicita con `supplier_cancel_order`, che già oggi blocca gli ordini caricati.
- **Chi può confermare**: ogni utente del fornitore che oggi gestisce gli ordini in «Ordini clienti», senza permessi nuovi. Vedi la sezione qui sotto.

### Permesso usato (verificato in lettura)
- In «Ordini clienti» le azioni sugli ordini ricevuti (`supplier_cancel_order`, `decide_order_change`, `mark_order_seen_by_supplier`, la lettura `is_order_supplier`) non controllano un ruolo. Usano tutte `public.is_company_member(<azienda fornitrice>)`.
- Quella funzione legge **`company_members`**: deve esistere una riga con `user_id = auth.uid()`, `company_id` = azienda fornitrice e `status = 'attivo'`. Nessun controllo su `company_member_roles` né sull'amministratore.
- La nuova RPC fa la stessa verifica, nello stesso ordine:
  1. blocca il DDT (`FOR UPDATE`) e ne legge `seller_company_id`
  2. `auth.uid()` non nullo e `is_company_member(seller_company_id)`, altrimenti `RAISE EXCEPTION 'Non autorizzato'`
  3. il cliente arriva dal DDT, cioè dal codice cliente e dal collegamento attivo con `seller_company_id` del DDT; il browser invia solo `_document_id` e gli abbinamenti delle righe
  4. ogni articolo scelto per le righe deve appartenere a quel fornitore ed essere collegato a quel cliente, altrimenti viene rifiutato
- La lettura del riquadro (`incassi_pending_documents`) usa lo stesso controllo e mostra solo i DDT delle aziende di cui l'utente è membro attivo.

### Non si toccano
Danea, contestazioni, ponte Incassi (endpoint, abbinamento automatico con ORD) e `receive_purchase_order`. `TREVI_INCASSI_ENABLED` resta spento finché non lo decidi tu.

## Dettagli tecnici (fase successiva, dopo approvazione; mockup prima dei dati reali)
1. **Mockup**: riquadro «DDT da abbinare» con dati finti in stato React locale, nella pagina «Ordini clienti».
2. **Migrazione**:
   - `purchase_orders.origin` text default `'cliente'` (valori `cliente`, `telefonico_ddt`)
   - `purchase_orders.source_document_id` uuid unico → `supplier_delivery_documents`
   - nuova `incassi_pending_documents()`, in sola lettura: DDT del fornitore senza ordine, con il cliente risolto dal codice e un avviso se esiste un ordine aperto per la data
   - nuova `create_phone_order_from_document(_document_id, _line_matches jsonb)`: SECURITY DEFINER, `auth.uid()` + `is_company_member` del fornitore del DDT (come in «Ordini clienti»), EXECUTE solo authenticated, lock sul documento, crea l'ordine e le righe e collega il DDT (`link_status = collegato`, `purchase_order_id`, `buyer_company_id`), poi registra `purchase_order_changes`
   - esclusione di `origin = 'telefonico_ddt'` dalle funzioni di scarico ordini verso Danea, solo come filtro
3. **Codice**: helper puri per la risoluzione del cliente, l'abbinamento delle righe, l'abilitazione del pulsante e l'avviso, con i loro test vitest. Etichetta «Ordine telefonico» nelle liste degli ordini.
4. **Test SQL in rollback su 3 EMME**:
   - un DDT crea un solo ordine
   - righe non abbinate rifiutate
   - un membro non attivo, il cliente o un altro fornitore vengono rifiutati
   - un operatore attivo del fornitore senza ruolo di amministratore può confermare
   - nessuno scarico verso Danea
   - ordine esistente per la stessa data: solo avviso
