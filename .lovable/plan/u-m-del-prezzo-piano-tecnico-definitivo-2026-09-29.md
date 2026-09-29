# U.M. del prezzo — piano tecnico definitivo

## 1. Le 6 colonne (tutte NULL = "non indicata"; nessun default)

| Tabella | Colonna | Tipo | NULL | FK |
|---|---|---|---|---|
| product_supplier_links | price_unit_id | uuid | sì | units_of_measure(id), ON DELETE RESTRICT |
| purchase_order_items | price_unit_id | uuid | sì | units_of_measure(id), RESTRICT |
| purchase_order_items | price_unit_code | text | sì | — (fotografia) |
| goods_receipt_items | price_unit_id | uuid | sì | units_of_measure(id), RESTRICT |
| goods_receipt_items | price_unit_code | text | sì | — (fotografia) |
| goods_receipt_items | price_quantity | numeric(18,6) | sì | — ; CHECK price_quantity > 0 quando presente |

Coerenza: trigger `SECURITY DEFINER SET search_path = public` che verifica che la U.M. appartenga alla stessa azienda. Sui documenti, se c'è `price_unit_id` il codice viene fotografato dall'anagrafica; il codice può esistere anche senza id (fornitore non B2B).

## 2–3. Funzioni DB da modificare

| Funzione | Cambia |
|---|---|
| manage_product_supplier_link | nuovo parametro facoltativo `_price_unit_id`; verifica azienda; salvato solo su referenze non B2B (per B2B rifiutato: arriva dal venditore) |
| create_purchase_orders_from_list | copia `unit_cost` + `price_unit_id` + `price_unit_code`: non B2B dalla referenza; B2B dal prodotto del venditore (`products.price_unit_id` del prodotto originale). Fotografia definitiva |
| open_goods_receipt | la riga di carico eredita prezzo, U.M. prezzo e codice dalla riga d'ordine; `price_quantity` vuota |
| set_goods_receipt_item | nuovi parametri `_price_unit_id`, `_price_unit_code`, `_price_quantity`; proposta automatica di `price_quantity` solo nei casi 6–7 sotto |
| confirm_goods_receipt | il lotto non copia più `unit_cost` del carico: applica la formula del punto 9 |
| hook_price_from_goods_receipt | storico con `price_unit_code` = U.M. del prezzo del carico (non più U.M. d'ordine); se non indicata → vuota |
| hook_price_from_supplier_cost (Danea) | storico con `price_unit_code` vuota (non più U.M. Danea) |
| hook_price_from_manual_cost | storico con la U.M. prezzo della referenza; se non indicata → vuota |
| product_lot_availability, product_supplier_overview, goods_receipt_history | restituiscono anche la U.M. del prezzo per mostrarla ("€20/CASSA", "€1,95/kg") |

## 4. File frontend
- `src/lib/purchase.ts`, `src/lib/purchase.functions.ts`: tipi e parametri nuovi.
- `src/components/purchase/purchase-order-detail.tsx`: prezzo mostrato "€ X / U.M." o "U.M. prezzo non indicata"; scelta U.M. prezzo per righe non B2B.
- `src/components/purchase/goods-receipt-panel.tsx`: campi Prezzo, U.M. prezzo, Quantità prezzo, Valore calcolato, Costo per U.M. di magazzino.
- `src/components/products/product-suppliers-manager.tsx`: U.M. prezzo accanto al costo manuale (solo non B2B; B2B in sola lettura dal catalogo).

## 5. U.M. prezzo non indicata
Il prezzo si vede come "€ 2,00 · U.M. prezzo non indicata". `price_quantity` non viene proposta, il valore non viene calcolato, il costo del lotto resta vuoto. Lo storico registra il prezzo con U.M. vuota. Niente viene bloccato.

## 6. U.M. prezzo = U.M. d'ordine (es. €20/CASSA, 10 casse)
`price_quantity` proposta = quantità ricevuta (`verified_quantity`); modificabile.

## 7. U.M. prezzo = U.M. di magazzino (es. €2/kg, carico 102,4 kg)
`price_quantity` proposta = quantità caricata (`stock_quantity`); modificabile.

## 8. Diversa da entrambe
`price_quantity` vuota: va inserita dall'operatore. Nessuna conversione media usata.

## 9. Formula costo lotto
```text
valore        = price_quantity × unit_cost
lotto.unit_cost = valore / stock_quantity
```
Solo se `unit_cost`, U.M. prezzo, `price_quantity` e `stock_quantity > 0` sono presenti; altrimenti vuoto (mai zero). Esempi: 10 × 20 / 102,4 = 1,953125 €/kg; 102,4 × 2 / 102,4 = 2 €/kg.

## 10. Storico prezzi
Registra il prezzo sempre con la sua vera U.M. del prezzo; vuota quando non indicata. Nessuna deduzione da U.M. d'ordine o U.M. Danea. Il costo del lotto non entra nello storico dei prezzi fornitore.

## 11. B2B
U.M. prezzo letta dal prodotto del venditore e fotografata sull'ordine; la referenza locale non la memorizza e non può sovrascriverla.

## 12. Non B2B
U.M. prezzo impostata sulla referenza (costo manuale) e modificabile sull'ordine e sul carico, anche con un codice libero.

## 13. Record storici
Nessun aggiornamento: ordini, carichi, lotti e storico prezzi esistenti restano con U.M. prezzo vuota = "non indicata". Nessuna ricostruzione.

## 14. Test (in transazioni annullate, senza dati reali)
- €20/CASSA, 10 casse, 102,4 kg → valore 200, lotto 1,953125 €/kg, storico €20/CASSA.
- €2/kg, 10 casse, 102,4 kg → valore 204,80, lotto 2 €/kg, storico €2/kg.
- U.M. prezzo non indicata → nessun valore, lotto vuoto, storico con U.M. vuota.
- U.M. diversa da ordine e magazzino → `price_quantity` non proposta.
- Nuovo costo Danea → storico con U.M. vuota; storico esistente invariato.
- B2B: fotografia dal venditore; modifica successiva del catalogo non cambia l'ordine.
- U.M. di un'altra azienda rifiutata; `price_quantity` ≤ 0 rifiutata.
- Controllo tipi e schermate Ordine/Carico nel browser senza salvare.

## Invariato
Inventario, Fabbisogno, semaforo, Lista della Spesa, Consegne, listini e U.M. di vendita, giacenze, conversioni esistenti, dati storici.
