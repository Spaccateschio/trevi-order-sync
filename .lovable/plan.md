# Registra arrivo merce: colonne Ordinato / Arrivato / Prezzo (solo presentazione)

## Da dove arrivano i dati (verificato)
Lettura: `getReceivePurchaseOrder` (purchase.functions.ts), sempre con l'utente collegato (nessun client privilegiato).

| Colonna | Campo ReceiveLine | Tabella e campo |
|---|---|---|
| Ordinato (quantità) | `ordered` | `purchase_order_items.purchase_quantity`, altrimenti `ordered_quantity` |
| Ordinato (unità) | `unitCode` | con consegna: `purchase_delivery_items.purchase_unit_code` (o `unit_code` se manca la quantità d'acquisto); senza consegna: `purchase_order_items.purchase_unit_code` / `unit_code` |
| Arrivato (U.M. d'acquisto) | `declaredPurchase` + `unitCode` | `purchase_delivery_items.declared_purchase_quantity` |
| Arrivato (U.M. magazzino) | `declaredStock` + `stockUnitCode` | `purchase_delivery_items.declared_quantity` + `unit_code` |
| Prezzo | `unitCost` + `priceUnitCode` | `goods_receipt_items.unit_cost` (carico in bozza) altrimenti `purchase_delivery_items.declared_unit_price`; unità da `goods_receipt_items.price_unit_code`, altrimenti `purchase_order_items.price_unit_code` |

Accesso dell'acquirente oggi: tutte e quattro le tabelle hanno una regola di lettura `is_company_member(company_id)`, quindi l'acquirente le legge; il fornitore legge solo le righe dei suoi ordini.

Prezzo "solo se assegnato": la schermata mostra il prezzo solo quando `unitCost` è valorizzato (dato già scritto nel documento). Se manca, la colonna Prezzo non compare in quella riga: nessun valore ricavato da listini o calcolato.

Quantità con OK: già oggi `receivePayload` usa `line.baseline`, che con consegna dichiarata è la quantità dichiarata dal fornitore; il campo "Quantità arrivata" compare solo con Parziale e Danneggiato. Non cambia nulla.

## Rischio da segnalare
Con una consegna dichiarata, `unitCode` è l'unità della riga di consegna, non quella della riga d'ordine. Se il fornitore dichiara in un'unità diversa, "Ordinato" mostrerebbe la quantità dell'ordine con l'unità sbagliata. Proposta: in `getReceivePurchaseOrder` aggiungere solo in lettura un campo `orderedUnitCode` (`purchase_order_items.purchase_unit_code` o `unit_code`), usato solo per la colonna Ordinato. Nessun effetto su receivePayload o RPC. Se preferisci non toccare quel file, uso `unitCode` come oggi.

## Cosa cambia a schermo
Per ogni riga, tre colonne affiancate (su telefono tre blocchi stretti uno accanto all'altro, che vanno a capo se serve):
- **Ordinato:** es. "2 pz"
- **Arrivato:** quantità dichiarata dal fornitore con unità d'acquisto (es. "0,2 kg"); sotto, se diversa, l'equivalente in magazzino. Senza dichiarazione: "In attesa del documento".
- **Prezzo:** es. "3,50 € / kg", solo se presente.

Restano identici: pulsanti OK/Parziale/Mancante/Danneggiato, "Conferma tutte come arrivate", "Dettagli riga", "Conferma carico", riepilogo, lotto mostrato.

## Dettagli tecnici
- `receive-outcomes.ts`: nuova funzione pura `receiveLineColumns(line)` → `{ ordered: string; arrived: string | null; arrivedStock: string | null; price: string | null }` (null per "In attesa del documento"/prezzo assente). Formattazione con `qty`.
- `receive-goods-panel.tsx`: sostituito solo il blocco "Ordinato / Dichiarato" in testa alla riga.
- (Opzionale, vedi rischio) `purchase.functions.ts`: campo di sola lettura `orderedUnitCode` in `ReceiveLine`.
- Test in `receive-outcomes.test.ts`: dichiarazione presente con unità diverse, assenza di dichiarazione, prezzo assente, prezzo con unità.
- Nessuna modifica a database, RPC, `receive_purchase_order`, `receivePayload`, pulsanti. Nessun dato reale modificato; verifica a schermo solo in lettura su 3 EMME.
