# Lista della Spesa: Conferma su tutte le card + U.M. solo nelle ripartizioni fornitore

Regola fissa: **«20 kg da acquistare» appartiene alla Lista** (U.M. del prodotto/magazzino, mai cambiata). **«2 casse da Garbaglia» appartiene alla ripartizione del fornitore.** Due livelli separati.

## Punto A — Conferma anche sui prodotti «Da valutare»
Cosa vedrai:
- Ogni card «Da valutare» ha **✓ Conferma** (non serve più prima «Aggiungi alla Lista»).
- Scrivi 4 pz → Conferma → in un solo passaggio il prodotto entra in Lista, la quantità 4 pz viene salvata e bloccata, la card diventa ocra, compare **Sblocca**.
- Campo quantità e +1/+3/+5/+10 bloccati; fornitori restano modificabili.
- Senza lista aperta, la Conferma crea la lista collegata all'inventario (come oggi fa la prima azione che salva), senza liste fantasma.
- Stato persistente nel database (quello già esistente del blocco).
- Accanto a «Da acquistare» resta **solo la U.M. del prodotto** (kg, pz…): nessun selettore di U.M.

## Punto B — U.M. del fornitore solo dentro la sua ripartizione
Cosa vedrai nella finestra «Fornitori e ripartizione» (e nel riepilogo della card):
- Per ogni fornitore scegli quantità + U.M. d'acquisto: `Garbaglia → 2 CASSE`, `Rossi → 5 KG`.
- **Fornitore B2B**: solo le U.M. che quel fornitore ha configurato per il prodotto nel suo catalogo (es. KG, CASSA). Nessuna U.M. inventata.
- **Fornitore non B2B**: scegli una U.M. esistente **oppure** ne scrivi una a mano (es. PEDANE). Resta salvata solo in quella ripartizione, non entra nell'elenco generale e non si propaga.
- Più fornitori sullo stesso prodotto: **una sola card, un solo prodotto**, più ripartizioni (già supportato: una riga per fornitore + U.M.). Nessun duplicato.
- Senza conversione verso la U.M. del prodotto: la ripartizione mostra «Non convertibile» e non entra nel totale «Assegnato»; nessuna conversione stimata.
- Cambiare la U.M. di un fornitore **non** cambia i 20 kg della card.

## Non tocco
Inventario, Fabbisogno, Ordini, Consegne, Carico Merce, semaforo, U.M. del prezzo, regole di conversione.

## Dettagli tecnici
A. Conferma atomica (richiede una piccola modifica DB, da approvare prima):
- Verifica: oggi creare la lista, aggiungere il prodotto e bloccarlo sono tre regole separate nel database; chiamarle in fila dal browser può lasciare «In lista ma non confermato». Quindi serve una sola regola nuova.
- Nuova RPC `confirm_shopping_list_product(_company_id, _list_id uuid NULL, _inventory_session_id uuid NULL, _product_id, _quantity numeric, _suggested numeric NULL)` SECURITY DEFINER, search_path = public, autorizzazione con auth.uid() + is_company_member:
  1. se `_list_id` è NULL crea la lista collegata all'inventario con la stessa logica di `manage_shopping_list` (nessuna lista fantasma: nasce solo qui);
  2. richiede `_quantity > 0`;
  3. inserisce la riga (U.M. di magazzino come `add_shopping_list_items`) oppure, se il prodotto è già in lista, aggiorna la quantità solo se non è già bloccata;
  4. imposta `quantity_locked_at = now()`, `quantity_locked_by = auth.uid()`;
  5. tutto in un'unica transazione: se un passo fallisce non resta nulla di parziale. Restituisce list_id e item_id.
  - GRANT EXECUTE solo ad authenticated; nessuna nuova tabella/colonna.
- `shopping-list.functions.ts`: `confirmShoppingListProduct` con context.supabase.
- `shopping-list-panel.tsx`: sulle card «Da valutare» la Conferma chiama solo questa funzione (protetta dai doppi clic), poi ricarica.
- `shopping-list-card.tsx`: Conferma visibile anche su «Da valutare»; sfondo/bordo ocra dell'intera card deciso solo da `quantity_locked_at` letto dal database; bloccati solo quantità e +1/+3/+5/+10; fornitori, ripartizioni, U.M. fornitore e menu restano attivi.

B. Ripartizione:
- `supplier-split-dialog.tsx`: B2B → solo `purchase_units` attive del venditore (già così, verifico che non ci siano fallback); non B2B → elenco U.M. esistenti + campo «Altra U.M.» testuale.
- Da verificare prima di scrivere codice: se `assign_shopping_list_supplier` accetta un `purchase_unit_code` testuale senza `purchase_unit_id`. Se **no**, serve una piccola migrazione (parametro testo facoltativo, ammesso solo per fornitori non B2B, equivalente NULL). Te la mostro separatamente prima di applicarla.
- Riepilogo card: già mostra `fornitore → quantità U.M. d'acquisto`; nessun cambio di logica.

Ordine: prima A (solo frontend), poi verifica e B.
