# Fase 2 ponte Incassi — DDT in «Registra arrivo merce» (solo lettura e presentazione)

## Cosa c'è oggi (verificato)
- **Ordinato / Arrivato / Prezzo**: `receiveLineColumns` (receive-outcomes.ts) legge le righe preparate da `getReceivePurchaseOrder` (src/lib/purchase.functions.ts):
  - Ordinato = `purchase_order_items.purchase_quantity` + `purchase_unit_code` (o `unit_code`).
  - Arrivato = `purchase_delivery_items.declared_purchase_quantity` / `declared_quantity` della consegna dichiarata dal fornitore B2B; senza consegna è vuoto.
  - Prezzo = `goods_receipt_items.unit_cost` o `purchase_delivery_items.declared_unit_price`, unità da `price_unit_code`.
- **Righe DDT**: `supplier_delivery_documents.lines` è un elenco JSON di `{code, description, qty, um, um_normalized, price, total, needs_review}`. `um_normalized` vale `pz` per pz/pezzo/pezzi. `needs_review` è vero se l'unità è sconosciuta o la quantità manca. Oggi ci sono 9 documenti, tutti collegati a un ordine.
- **Codice Danea dell'articolo**: è in `purchase_order_items.supplier_product_code` (esempio: riga 00-001 → 0964). Nei dati veri i `code` del DDT coincidono con questo campo. `products.code` (00-xxx) non si usa mai per abbinare le righe.
- **Senza DDT**: «Arrivato» mostra «In attesa del documento» e il prezzo non compare.
- **Rischio 1, accesso**: la tabella oggi si può leggere solo dall'azienda venditrice (`is_company_member(seller_company_id)`). L'acquirente non vede le righe del DDT. Senza toccare il database, la lettura passa dal server: prima si legge l'ordine con la sessione dell'utente, quindi l'ordine deve essere suo, e solo dopo si leggono i DDT con `purchase_order_id` = quell'ordine e `buyer_company_id` = azienda dell'ordine.
- **Rischio 2, più DDT per ordine**: alcuni ordini hanno 2 documenti (per esempio 16625 e 16727 sullo stesso ordine).

## Cosa cambia
1. `getReceivePurchaseOrder` aggiunge un campo di sola lettura `incassiDocuments` con numero, data, stato consegna e righe dei DDT collegati all'ordine. È solo una lettura in più, nessuna scrittura.
2. Una nuova funzione pura `matchIncassiLines(orderLines, documents)` in `src/lib/incassi/incassi-receive.ts` dà per ogni riga dell'ordine uno di questi esiti:
   - **abbinata**: c'è esattamente una riga DDT con `code` uguale a `supplier_product_code`;
   - **da controllare**: unità vuota o sconosciuta, `pz` con quantità decimale, codice assente o ripetuto, oppure più DDT validi per lo stesso ordine;
   - **differenza**: stessa unità, ma quantità diversa dall'ordinato. La differenza si evidenzia (per esempio «Ordinati 1 pz · sul documento 2 pz»).
   Le righe del DDT che non corrispondono a nessuna riga dell'ordine compaiono in fondo come «Righe del documento non abbinate · da controllare». Non vengono mai abbinate a caso.
3. Nella schermata, quando non c'è una dichiarazione B2B:
   - «Arrivato (documento DDT n.)» mostra la quantità del DDT;
   - «Prezzo» mostra il prezzo del DDT con l'unità del documento.
   Le righe abbinate precompilano solo i valori sul telefono o sul computer, come merce dichiarata. Le righe da controllare restano vuote, con l'avviso. Niente si scrive e niente va in giacenza finché l'acquirente non preme «Conferma carico», con lo stesso percorso di oggi.
4. Se esiste una dichiarazione B2B, vince quella e il DDT non si usa.

## Fuori dal perimetro
Database, policy, `receive_purchase_order`, contestazioni, Danea, invio ordini, Lista e Carrello.

## Dettagli tecnici
- Lettura dei DDT con il client privilegiato del server, solo dopo che `context.supabase` ha letto l'ordine. Filtri: `purchase_order_id` e `buyer_company_id`. Si restituiscono solo i campi dei documenti, mai le chiavi.
- Più DDT validi (esclusi quelli `non_consegnato`) sullo stesso ordine: tutte le righe sono «da controllare» e si elencano i documenti. Le quantità non si sommano.
- I valori precompilati passano da `receiveLineColumns`/stato locale. Il payload resta quello attuale: si invia solo ciò che l'utente conferma.
- Test in `incassi-receive.test.ts`: pz uguale a pezzo, unità vuota, unità sconosciuta, 0,75 pz, 1 pz contro 2 pz, codice non abbinato, codice ripetuto, nessun DDT, più DDT.
- Prova a schermo su 3 EMME, solo in lettura, senza premere «Conferma carico».
