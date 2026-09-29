# U.M. del prezzo — analisi e modello minimo (nessuna modifica ancora)

## 1. Cosa esiste già

| Dato | Dove vive oggi | U.M. del prezzo? |
|---|---|---|
| Costo fornitore da Danea | `product_supplier_costs.supplier_net_price` | No (implicita = U.M. Danea) |
| Costo manuale | `product_supplier_links.manual_cost` | No |
| Storico prezzi fornitore | `supplier_price_observations.net_price` + `price_unit_code` | **Sì, già testo** |
| Prezzo di vendita | `product_prices.net_price` (listini 1–9) | Sì, a livello prodotto: `products.price_unit_id` |
| U.M. di vendita | `product_sale_units` (+ conversione facoltativa) | — |
| U.M. d'acquisto | `product_supplier_link_units` (per referenza) | — |
| Quantità ordinata | `purchase_order_items.purchase_quantity` + `purchase_unit_id/code` | — |
| Prezzo nell'Ordine | `purchase_order_items.unit_cost` | **No: ambiguo** |
| Consegna | `purchase_delivery_items.declared_purchase_quantity`, `declared_weight` | Nessun prezzo |
| Ricevuto / caricato | `goods_receipt_items.verified_quantity` (U.M. d'ordine) + `stock_quantity` (magazzino) | — |
| Costo al carico | `goods_receipt_items.unit_cost` → `stock_lots.unit_cost` | **No: ambiguo** |

## 2. Riutilizzabile
- Anagrafica U.M. aziendale (`units_of_measure`): nessun secondo sistema di U.M.
- Coppia "id + codice fotografato" già usata per l'U.M. d'ordine: stessa regola per il prezzo.
- `products.price_unit_id` per la vendita; `supplier_price_observations.price_unit_code` per lo storico.
- `verified_quantity` e `stock_quantity` al carico: coprono già "10 casse" e "102,4 kg".

## 3. Campi mancanti (minimo: 2 per tabella, solo dove c'è un prezzo)
- `product_supplier_links`: `price_unit_id` (a che cosa si riferisce il costo manuale/referenza).
- `purchase_order_items`: `price_unit_id` + `price_unit_code` (fotografia).
- `goods_receipt_items`: `price_unit_id` + `price_unit_code` + `price_quantity` (la quantità su cui si applica il prezzo, es. 102,4 kg o 10 casse).
- La Lista della Spesa non ha prezzo: nessun campo.
- La Consegna non ha prezzo: nessun campo (il peso dichiarato resta com'è).

Totale: 8 colonne, nessuna tabella nuova.

## 4–5. Dove vive e che tipo
- Configurazione (referenza fornitore, prodotto di vendita): **FK** a `units_of_measure`.
- Documenti (Ordine, Carico): **FK facoltativa + codice testo obbligatorio**, come già per l'U.M. d'ordine. Per un fornitore non B2B si può scrivere un codice anche senza FK.

## 6. Fotografia nell'Ordine
Alla creazione dell'ordine si copiano `unit_cost`, `price_unit_id`, `price_unit_code` dalla referenza. Da lì l'ordine non rilegge più il prodotto: una modifica futura non cambia i vecchi ordini (stessa logica già in uso per l'U.M. d'ordine).

## 7. Arrivo al Carico Merce
Il carico eredita prezzo e U.M. del prezzo dalla riga d'ordine (modificabili dall'operatore). Se l'U.M. del prezzo coincide con quella d'ordine, `price_quantity` viene proposta uguale alla quantità ricevuta; se coincide con quella di magazzino, uguale alla quantità caricata; altrimenti resta vuota e va inserita. Mai riempita da una conversione media senza conferma.

## 8. Costo effettivo
`costo = price_quantity × unit_cost`, calcolato quando c'è `price_quantity`. Esempi: 102,4 × 2,00 €/kg = €204,80; 10 × 20,00 €/cassa = €200,00. Costo per unità di magazzino da portare nei lotti: `costo / stock_quantity`. Senza `price_quantity` il costo resta vuoto, mai zero.

## 9. B2B e non B2B
- B2B: U.M. d'ordine consentite = U.M. di vendita pubblicate dal venditore; U.M. prezzo = `price_unit_id` del prodotto del venditore. Si leggono dal suo catalogo, non dalle configurazioni locali.
- Non B2B: l'operatore sceglie liberamente U.M. d'ordine e U.M. prezzo (elenco aziendale o codice libero sul documento).

## 10. Vendita in futuro
Stesso schema: il cliente ordina in `product_sale_units`, il prezzo si applica in `products.price_unit_id`. Alla preparazione si registra la quantità reale nella U.M. del prezzo (3,27 kg); il peso medio serve solo per la stima "≈ €9,00". Non si implementa ora.

## 11. Cosa si modifica (quando approvato)
- Migrazione: le 8 colonne sopra, nessun dato storico riscritto (vuoto = non indicato).
- Funzioni DB: `create_purchase_orders_from_list`, `manage_purchase_order`, `manage_product_supplier_link`, `confirm_goods_receipt`, gli hook dei prezzi da carico/costo manuale (per scrivere `price_unit_code` nello storico).
- File: `purchase.functions.ts`, `purchase-order-detail.tsx`, `goods-receipt-panel.tsx`, `product-suppliers-manager.tsx`, `catalog.functions.ts` (lettura U.M. prezzo B2B).

## 12. Cosa resta invariato
Inventario, Fabbisogno, semaforo, Lista della Spesa, Consegne, listini di vendita, U.M. di vendita, importazione Danea, giacenze e conversioni esistenti.

## Da decidere con te
- Ordini e carichi già esistenti senza U.M. del prezzo: restano "non indicata", senza supposizioni.
- Il costo Danea (`product_supplier_costs`) lo consideriamo riferito alla U.M. Danea del prodotto, o lo lasciamo "non indicato"?
