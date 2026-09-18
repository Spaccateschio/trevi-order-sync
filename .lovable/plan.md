# Fase A — Catalogo acquisti (vetrine dei fornitori collegati)

Obiettivo: chi compra apre **Acquisti → Catalogo**, vede le vetrine dei fornitori con
collegamento operativo, entra nel catalogo di un fornitore, apre la pagina di un
prodotto e mette i preferiti. Nessun ordine in questa fase.

## Cosa vedrà l'utente

### Acquisti → Catalogo (elenco vetrine)
- Una card per ogni fornitore con collegamento **operativo** (doppio consenso già esistente):
  nome, città, numero prodotti in vetrina, indicazione "prezzi disponibili" o "prezzi su richiesta".
- Fornitori collegati ma sospesi da un lato: mostrati come non disponibili, senza catalogo.
- Nessun collegamento: messaggio con collegamento alla pagina Collegamenti.

### Catalogo di un fornitore
- Griglia con foto, codice, descrizione, categoria, unità di misura di vendita e prezzo
  (solo se il fornitore ti ha assegnato un listino).
- Ricerca per codice/descrizione, filtro per categoria, filtro "Solo preferiti".
- Cuoricino/stella per aggiungere e togliere dai preferiti direttamente dalla griglia.
- Su smartphone: elenco a card touch, una riga per prodotto con foto piccola.

### Pagina prodotto
- Foto grande, descrizione, categoria, unità di misura aziendali del fornitore con
  eventuale conversione indicativa, prezzo se assegnato, altrimenti "Prezzo confermato
  dal fornitore in fase d'ordine".
- Pulsante **Preferito**. Il pulsante "Aggiungi alla lista della spesa" viene predisposto
  ma disattivato con etichetta "disponibile a breve" (arriva in Fase B).

### Lato venditore
- In Vendite → Prodotti: nuova colonna e interruttore **In vetrina B2B** (default attivo),
  nel dettaglio prodotto e in modifica multipla dalla griglia già esistente.
- Nascondere un prodotto non cambia nulla in Danea e non tocca l'import.

## Aggiunte al database (solo additive)

1. `products.b2b_visible boolean not null default true`
   - `products` resta in sola scrittura Danea: l'interruttore passa da una funzione
     `set_product_b2b_visibility(_company_id, _product_ids[], _visible)` SECURITY DEFINER,
     con audit su `audit_events`. FULL/INCREMENTAL non toccano il campo.
2. `buyer_product_favorites` (nuova tabella)
   - `buyer_company_id`, `seller_company_id`, `product_id`, `created_by`, `created_at`;
     unico per (buyer, product). RLS: solo membri dell'azienda acquirente, e solo se il
     collegamento con quel fornitore è operativo.
3. `customer_records.assigned_price_list_number smallint` (preparazione minima 5c)
   - Serve solo alla regola "prezzo solo se assegnato". L'assegnazione dall'interfaccia,
     l'ereditarietà sulle destinazioni e l'import dal file Danea restano nel Punto 5c.
4. Lettura catalogo lato acquirente: nuove policy di sola lettura su `products`,
   `product_images`, `product_sale_units`, `units_of_measure` con la condizione
   `relation_is_operational(seller, buyer)` + `publish_status = 'pubblicato'` + `b2b_visible`.
5. Prezzi: funzione `buyer_catalog_prices(_seller_company_id, _product_ids[])`
   SECURITY DEFINER che restituisce i prezzi **solo** del listino assegnato all'acquirente
   e niente se non c'è assegnazione. Nessuna policy diretta su `product_prices`:
   i prezzi non assegnati non sono raggiungibili.

## Codice

- Nuove pagine: `src/routes/_authenticated/acquisti.catalogo.tsx` (vetrine),
  `acquisti.catalogo.$sellerId.tsx` (griglia), `acquisti.catalogo.$sellerId.$productId.tsx`
  (pagina prodotto), ognuna con proprio `head()`.
- Nuovi componenti in `src/components/catalog/`: `supplier-showcase-card.tsx`,
  `catalog-grid.tsx`, `catalog-mobile-list.tsx`, `favorite-button.tsx`.
- Nuovo `src/lib/catalog.functions.ts`: lettura catalogo, prezzi assegnati e URL firmati
  delle immagini tramite server function autenticata (le immagini restano in bucket privato).
- `src/lib/navigation.ts`: nuova voce `acquisti.catalogo` (icona Store) prima di Fornitori;
  la voce Fornitori resta come rimando a Collegamenti.
- `acquisti.index.tsx`: al posto dell'elenco "non ancora sviluppato", scorciatoie al
  Catalogo e ai fornitori collegati.
- Lato venditore: interruttore vetrina in `product-detail-sheet.tsx`, colonna in
  `product-grid.ts`, azione multipla riusando il dialog batch già presente.

## Cosa non viene toccato

Relazioni e doppio consenso, inviti e codici, `customer_records`, indirizzi e destinazioni,
import Danea e parser, listini Danea ricevuti, U.M. esistenti, RLS e funzioni server
funzionanti. Nessun secondo catalogo prezzi: i prezzi restano quelli dei listini Danea.

## Verifica prima di consegnare

- Un acquirente vede solo i cataloghi dei collegamenti operativi; spegnendo il lato
  venditore il catalogo sparisce.
- Prodotto con vetrina disattivata: invisibile all'acquirente, invariato in Danea.
- Senza listino assegnato: nessun prezzo visibile e nessun prezzo raggiungibile.
- Preferiti salvati e filtrabili; prova desktop 1280px e smartphone 390px.
