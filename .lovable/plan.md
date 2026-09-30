# Punto B — Proposta modifica DB/RPC (NON applicata)

## 1-2. Funzione attuale e firma
`assign_shopping_list_supplier(_company_id uuid, _item_id uuid, _action text, _link_id uuid, _assigned_quantity numeric, _purchase_quantity numeric, _min_warning_accepted boolean, _notes text, _actor_user_id uuid, _purchase_unit_id uuid, _assignment_id uuid)`

Toccata anche, in sola lettura: `product_supplier_overview(_product_id uuid)`. Oggi restituisce `purchase_units` dalle U.M. locali della referenza (`product_supplier_link_units`).

## 3. Nuova firma
Uguale a quella attuale, più un parametro in fondo:
`_manual_unit_code text DEFAULT NULL`.
È retrocompatibile: chi non lo passa continua a funzionare, ma senza più ripieghi.

`product_supplier_overview`: stessa firma, con due nuovi campi in uscita:
- `is_b2b boolean`;
- `b2b_source_linked boolean`.

Per i B2B, `purchase_units` viene letto dal venditore.

## 4. Colonne coinvolte (`shopping_list_item_suppliers`)
`purchase_unit_id`, `purchase_unit_code`, `purchase_quantity`, `assigned_quantity`, `conversion_factor`, `conversion_type`. Nessuna colonna nuova.

## 5. Indice UNICO attuale
`shopping_list_item_suppliers_unique (item_id, product_supplier_link_id, COALESCE(purchase_unit_id, '0000…'))`.
Con questo indice tutte le U.M. manuali (id nullo) coincidono, quindi PEDANA e RETINA non possono convivere.

## 6. Indice nuovo
```sql
DROP INDEX shopping_list_item_suppliers_unique;
CREATE UNIQUE INDEX shopping_list_item_suppliers_unique_unit
  ON shopping_list_item_suppliers (item_id, product_supplier_link_id, purchase_unit_id)
  WHERE purchase_unit_id IS NOT NULL;
CREATE UNIQUE INDEX shopping_list_item_suppliers_unique_manual
  ON shopping_list_item_suppliers (item_id, product_supplier_link_id, upper(btrim(purchase_unit_code)))
  WHERE purchase_unit_id IS NULL AND purchase_unit_code IS NOT NULL;
```
Risultato:
- «PEDANE», «pedane» e « Pedane » sono la stessa U.M. e non creano duplicati;
- PEDANE e RETINE convivono sullo stesso fornitore e prodotto.

## 7. Normalizzazione
- Testo manuale: `upper(regexp_replace(btrim(_manual_unit_code), '\s+', ' ', 'g'))`, massimo 20 caratteri, non vuoto.
- Viene salvato già normalizzato (es. «PEDANE»).
- Se esiste già la stessa U.M. manuale per quel fornitore su quella riga, si aggiorna quella ripartizione invece di crearne una nuova.

## 8. Come si riconosce un fornitore B2B (lato DB)
Esiste `supplier_customer_relations r` con `r.supplier_record_id = link.supplier_record_id`, `r.buyer_company_id = _company_id` e `relation_is_operational(r.seller_company_id, _company_id)`.

## 9. Prodotto originale del venditore
Si usa `products.created_from_product_id` del mio prodotto, con `created_from_company_id = r.seller_company_id`.
Non si fanno abbinamenti per nome o codice. Se il collegamento manca, il prodotto risulta «non collegato».

## 10. Da dove si leggono le U.M. pubblicate
`product_sale_units` del prodotto originale, con `is_active AND is_customer_visible`, unito a `units_of_measure` per il codice.

## 11. Conversione
Da `product_sale_units.conversion_factor`/`conversion_type` del venditore, e solo se `conversion_reference_um` coincide con la U.M. di magazzino della mia riga. Altrimenti l'equivalente resta NULL e appare «Non convertibile».

Per le U.M. non B2B esistenti resta la conversione della referenza (`product_supplier_link_units`), come oggi. Per le U.M. manuali: conversione ed equivalente sempre NULL.

## 12. Cosa viene rifiutato lato DB
- «U.M. d'acquisto obbligatoria: sceglila esplicitamente»: quando non viene passata né una U.M. né un testo. Scompare il ripiego su predefinita o magazzino.
- «Indica una U.M. esistente oppure un'altra U.M., non entrambe»: quando vengono passate entrambe.
- Fornitore B2B:
  - testo manuale → «Per i fornitori B2B la U.M. la decide il venditore»;
  - prodotto non collegato → «Prodotto del fornitore non collegato: U.M. non disponibili»;
  - U.M. non pubblicata o non visibile → «U.M. non pubblicata dal venditore».
- Fornitore non B2B, U.M. esistente non abilitata sulla referenza → errore già attuale.
- Quantità assente o ≤ 0 → già attuale.
- Quantità in U.M. di magazzino senza U.M. esplicita: si accetta solo se `_purchase_unit_id` è la U.M. di magazzino. Vale anche per i B2B, ma solo se il venditore la pubblica.

## 13. Dati esistenti interessati
C'è una sola ripartizione in tutto il database: fornitore «trevi srl» (B2B), 5 in U.M. di magazzino, con U.M. e quantità d'acquisto vuote (dato vecchio).
- L'indice nuovo non la tocca: con U.M. e testo nulli non rientra in nessuno dei due indici.
- La migrazione non riscrive nessun dato.
- Riferimenti B2B collegati al prodotto originale: 6 in totale.

## 14. Retrocompatibilità
- Le ripartizioni esistenti restano leggibili e modificabili.
- Chi la salva di nuovo dovrà scegliere la U.M. esplicitamente.
- Ordini generati da ripartizioni con U.M. manuale: il codice resta come fotografia e la U.M. collegata è NULL. Resta da verificare che la creazione ordini accetti una U.M. nulla. Questa verifica si fa prima di applicare; se serve un adeguamento, lo mostro a parte.
- Punto A (Conferma, Sblocca, card ocra, quantità totale) non viene toccato.

## Frontend (dopo l'applicazione)
- `supplier-split-dialog.tsx`: U.M. B2B dal venditore oppure il messaggio «non collegato»; per i non B2B «Altra U.M.» con testo libero; nessuna U.M. preselezionata in automatico.
- `shopping-list.functions.ts`: aggiunta di `manualUnitCode`.

## Verifica aggiuntiva (percorso fino all'ordine)

**Trovato un blocco da correggere nella stessa migrazione:** la funzione che calcola lo stato della riga (`shopping_list_item_state`) considera valida una ripartizione con quantità d'acquisto solo se `purchase_unit_id IS NOT NULL`. Con «3 PEDANE» (id NULL) la riga risulterebbe «Da assegnare» e la conferma della Lista verrebbe rifiutata, quindi l'ordine non partirebbe.

Correzione proposta (una riga):
`valid = (purchase_quantity > 0 AND (purchase_unit_id IS NOT NULL OR btrim(coalesce(purchase_unit_code,'')) <> '')) OR (purchase_quantity IS NULL AND assigned_quantity > 0)`

**Creazione ordini (`create_purchase_orders_from_list`)**: copia `purchase_quantity`, `purchase_unit_id`, `purchase_unit_code` e `conversion_factor`, e mette `assigned_quantity` in `ordered_quantity`. Tutte queste colonne accettano NULL; non ci sono controlli né trigger sulla U.M. d'acquisto. Risultato: «3 PEDANE», con id NULL e ordered NULL. Nessuna modifica necessaria.

**Da segnalare, da non toccare ora — Consegne**: con `purchase_unit_id` NULL il fornitore non può dichiarare una quantità diversa in PEDANE, perché resta quella ordinata (`_delivery_set_item_core`). Il Carico Merce lavora in U.M. di magazzino: non si blocca, ma senza conversione il peso va inserito a mano.

**Vecchia ripartizione**:
- prodotto: PATATE NOVELLE (00-001), Lista del 26/09, chiusa, da cui è già stato generato un ordine;
- è valida secondo la regola vecchia (quantità in magazzino > 0) e conta 5 pz nel totale assegnato;
- la Lista è chiusa, quindi non può più generare ordini;
- la nuova regola non la riscrive. È un dato storico innocuo.

**Indici**: c'è una sola riga in tutto, con id e testo NULL, che resta fuori da entrambi i nuovi indici. Nessuna violazione.
