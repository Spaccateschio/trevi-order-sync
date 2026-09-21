# Prodotti: mostrare fornitore e prezzo d'acquisto

Nell'elenco Prodotti le colonne **Fornitore**, **Cod. prod. fornitore** e i prezzi restano vuote per i 6 articoli di 3 EMME. Non è un dato perso: quelle colonne leggono i campi arrivati da Danea (che 3 EMME non usa), mentre il fornitore vero di questi articoli è registrato nel collegamento prodotto→referenza del fornitore (trevi srl), e il prezzo di questi articoli è il prezzo del listino che trevi ha assegnato a 3 EMME, non un listino di vendita di 3 EMME.

## Cosa faccio

1. **Fornitore compilato davvero**: le colonne Fornitore e Cod. prod. fornitore mostrano il fornitore collegato all'articolo (nome del fornitore e suo codice articolo). Se un articolo ha più fornitori, si mostra quello preferito/prioritario con l'indicazione "+N" per gli altri.
2. **Nuova colonna "Costo acquisto"**: il costo per unità che già conosciamo dal collegamento (costo impostato a mano oppure costo ricevuto da Danea), con data dell'ultimo aggiornamento disponibile nella scheda prodotto.
3. **Nuova colonna "Prezzo fornitore"**: il prezzo attuale dal catalogo del fornitore B2B collegato (lo stesso che si vede nel catalogo di trevi), quando l'articolo è collegato a un fornitore registrato e un listino gli è assegnato; "Su richiesta" quando non c'è prezzo assegnato.
4. Le colonne **Listino 1…9** restano come sono: sono i prezzi di vendita dell'azienda, vuoti finché 3 EMME non vende.
5. Le nuove colonne entrano tra quelle iniziali della vista **Acquisti → Prodotti**; su smartphone compaiono nella stessa scheda compatta perché l'elenco mobile usa le stesse preferenze colonne.

## Dettagli tecnici

- `products-workspace.tsx`: query aggiuntiva su `product_supplier_links` (con `supplier_records(legal_name, internal_reference)`) per tutti i prodotti dell'azienda, ordinata per `sourcing_priority`/`is_preferred`; unione in memoria sulle righe prodotto.
- Prezzo fornitore: dal collegamento si risale a `supplier_customer_relations` → azienda venditrice, si individua l'articolo del fornitore per codice e si leggono i prezzi con la RPC esistente `buyer_catalog_prices` (già usata nel catalogo). Nessuna copia dei prezzi nel database.
- `product-grid.ts`: `ProductRow` acquisisce i campi derivati (`link_supplier_name`, `link_supplier_product_code`, `link_supplier_count`, `purchase_cost`, `supplier_price`); le colonne `supplier_name` e `supplier_product_code` usano il valore Danea e, se assente, quello del collegamento; due nuove colonne numeriche.
- Nessuna migrazione, nessuna nuova tabella, nessuna modifica a RPC, RLS o formule di giacenza/fabbisogno.

## Fuori scope

Modifica dei listini, creazione di prezzi di vendita per 3 EMME, nuovo componente grafico condiviso dell'elenco prodotti.
