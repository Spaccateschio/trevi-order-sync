# Lista della Spesa — Passo 1: nuova schermata, stessa logica

Principio: migliorare la Lista della Spesa che già funziona, non rifarla. Cambia solo come si vede e come si cerca. Quantità, assegnazioni, conferma e creazione degli ordini funzionano esattamente come oggi.

## 1. Barra superiore
Una riga compatta con Cerca prodotto, Categoria, Fornitore, Altri filtri, Ordina, **+ Aggiungi prodotti** e **Stampa**. Stampa si vede ma è disattivata, con la scritta "Disponibile a breve": arriva nel Passo 3.

## 2. Filtri (si combinano tra loro)
- **Categoria** e **Fornitore**: menu a scelta.
- **Altri filtri** (finestra con caselle): Senza fornitore, B2B, Non B2B, Preferiti, Da assegnare, Parzialmente assegnati, Assegnati, Già in ordine.
- Pulsante "Azzera filtri" e numero dei filtri attivi.
- Filtrano solo quello che vedi e non scrivono nulla.

## 3. Ordinamento
Codice, Descrizione, Categoria, Fornitore (A→Z). Il "giro del mercato" lo facciamo più avanti.

## 4. Computer e tablet
`Foto | Codice | Prodotto | Categoria | Quantità | U.M. | Fornitore/i | Note | Azioni`
- **Prezzo e Totale per ora non ci sono**: arrivano con il Passo 2, per non mostrare numeri inventati.
- Quantità modificabile come oggi e riga compatta.
- Note: si vedono le note già scritte nelle ripartizioni. Una nota sulla riga richiederebbe una modifica al database, quindi per ora niente.

## 5. Fornitori sulla riga
`Rossi · 10 cs`, oppure, se la merce è divisa, una riga per fornitore: `Rossi · 6 cs` / `Bianchi · 4 cs [B2B]`. Il badge B2B è piccolo, e "Nessun fornitore" è scritto in grigio.

## 6. Finestra Fornitori (divisione)
Stessa logica di oggi. In alto tre numeri grandi: **Richieste 20 cs · Assegnate 16 cs · Da assegnare 4 cs**. Si aggiornano dopo ogni assegnazione e diventano verdi quando il da assegnare arriva a 0. Accanto a ogni fornitore compare il badge B2B.

## 7. + Aggiungi prodotti
- Una finestra con ricerca per codice o descrizione. Ogni prodotto mostra foto, codice, descrizione, categoria e U.M., con una casella per sceglierlo.
- I prodotti **già nella Lista** hanno l'etichetta "Già in lista" e non si possono scegliere: niente doppioni.
- Un solo pulsante: **Aggiungi alla Lista (N)**.
- La quantità si scrive poi sulla riga. Uso la stessa funzione che aggiunge i prodotti a mano oggi. Se quella funzione non accetta una quantità vuota, ti chiedo una sola quantità comune (per esempio 1) prima di aggiungere, così non invento niente.

## 8. Smartphone
Schede compatte, una per prodotto:
```text
[foto] PATATE IT ROSSE          [stato]
       00-003 · Patate
       [   7   ] sacchi
       Rossi 5 · Bianchi 2 [B2B]
       [Fornitori] [Nota] [⋮]
```
I filtri si aprono in un pannello dal basso. **Nessun pulsante fisso**: il riepilogo e "Prepara ordini" stanno in fondo alla lista, come nell'Inventario. Sotto ⋮ c'è Rimuovi.

## 9. Riepilogo
`25 prodotti · 18 assegnati · 4 parziali · 3 da assegnare`, con il pulsante **Prepara ordini**. È il pulsante di oggi (conferma lista e crea ordini in bozza) con un nome nuovo: la logica non cambia.

## 10. Non cambia
Database, U.M. e conversioni, divisione fornitori, conferma lista, generazione ordini, ordini esistenti, Inventario, Fabbisogno e flusso B2B restano come sono, e non creo dati di prova.

## Dettagli tecnici
**File toccati**
- `src/components/shopping/shopping-list-panel.tsx` (layout, filtri, riepilogo).
- `src/components/shopping/supplier-split-dialog.tsx` (solo il riquadro dei totali e il badge B2B).

**Nuovi componenti**, in `src/components/shopping/`:
- `shopping-list-toolbar.tsx`
- `shopping-list-filters.tsx` (Popover/Sheet con Checkbox)
- `shopping-list-row.tsx` (riga desktop e scheda mobile)
- `add-products-dialog.tsx` (Dialog, Input, Checkbox, ScrollArea)

**Componenti riutilizzati**: shadcn Dialog, Sheet, Popover, Select, Checkbox, Badge e Button; `useIsMobile`; `getProductImageUrls` (lo stesso dell'Inventario); il `SupplierSplitDialog` esistente; le server function `addShoppingListItems`, `setShoppingListItemQuantity` e `removeShoppingListItem`, invariate.

**Da dove prendo i dati**, solo in lettura e con le regole di accesso già in vigore:
- Categoria: `products.category`.
- Foto: `getProductImageUrls` sui prodotti della lista.
- Preferiti: `company_product_favorites`.
- Fornitori per riga: `shopping_list_item_suppliers` + `supplier_records.legal_name`.
- B2B: fornitore con un collegamento attivo in `supplier_customer_relations`. Prima di scrivere codice verifico con una lettura che la colonna di collegamento sia quella giusta.
- Già in ordine: esiste un `purchase_orders` con `shopping_list_id` di questa lista, non annullato, che contiene il prodotto in `purchase_order_items`.

**Filtri e ordinamento**: `useMemo` sulle righe di `shopping_list_overview`, con stato solo nel componente. Nessuna scrittura.

**Database**: non serve nessuna modifica, né tabelle né funzioni né permessi.

## Prove
Solo lettura: filtri combinati, ordinamento, schermo a 390, 768 e 1280 px, finestra Aggiungi prodotti aperta senza confermare, finestra Fornitori aperta senza assegnare.
