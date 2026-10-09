# «Copia nei miei prodotti» dalla card B2B della Lista della Spesa

## Situazione attuale (analisi, nessuna modifica fatta)

**Due modi esistenti per creare un nostro prodotto**

| Procedura | Chi la usa | Cosa fa |
|---|---|---|
| `manage_internal_product` (create) | Finestra «Nuovo prodotto» (`internal-product-dialog.tsx`) nella pagina Prodotti | Crea un prodotto interno (codice proposto 00-xxx e modificabile, descrizione obbligatoria, categoria, sottocategoria, U.M., U.M. del prezzo, barcode, produttore, note). Nessun legame con il fornitore. Solo amministratori. |
| `add_catalog_product_to_own_products` | «Aggiungi ai miei prodotti» nel Catalogo B2B e la stella | Se esiste già una copia di quell'articolo B2B (`created_from_product_id`), la riusa. Altrimenti la crea già compilata, **senza schermata di controllo**, e aggiunge il collegamento al fornitore. |

**Punto importante.** Nella Lista della Spesa la card B2B usa **già oggi** un nostro prodotto: quando un articolo B2B entra in Lista (con la stella o con «Aggiungi alla Lista»), il sistema crea una copia nel nostro catalogo, collegata al fornitore. Per esempio il POMODORI CILIEGINO IT di 3 EMME (00-018) è la copia del 0218 di Trevi. L'articolo del venditore non viene mai modificato.

## Cosa proponiamo

1. Nel menu ⋮ della card (`shopping-list-card.tsx`) compare «Copia nei miei prodotti», solo se la card arriva da un articolo B2B.
2. Si apre la finestra «Nuovo prodotto» già esistente, precompilata. L'utente controlla, modifica e conferma.
3. Al salvataggio si crea un **nuovo prodotto indipendente**, con un nuovo identificativo e un nuovo codice 00-xxx, usando la procedura `manage_internal_product` che già esiste.
4. Non vengono modificati né l'articolo B2B del venditore, né la card in Lista, né il collegamento al fornitore.
5. Nessun prezzo viene copiato: il prezzo di vendita resta vuoto.

## Campi copiabili

| Campo | Da dove | Note |
|---|---|---|
| Descrizione | articolo B2B | modificabile |
| Categoria / Sottocategoria | articolo B2B | modificabile |
| U.M. base | `danea_um` del venditore | si sceglie tra le **nostre** U.M.; se non esiste da noi, il campo resta da scegliere |
| Barcode, Produttore | articolo B2B | modificabili |
| Codice | **non** si copia il codice del fornitore: si propone il nostro 00-xxx | il codice del fornitore va nelle note, se si vuole |
| U.M. del prezzo | non si copia (le U.M. del venditore appartengono a un'altra azienda) | da scegliere |
| Prezzo di acquisto / di vendita | **non si copiano** | come richiesto |
| Immagine | non si copia in questa fase | si può aggiungere poi con «Scatta foto» |

## Rischi di duplicazione

1. **Doppia copia.** La card B2B è già legata a una nostra copia, quindi «Copia nei miei prodotti» ne creerebbe una seconda dello stesso articolo. Proposta: prima di aprire la finestra, avvisare «Esiste già un tuo prodotto collegato a questo articolo: 00-018 POMODORI CILIEGINO IT» e lasciar scegliere «Apri quello esistente» oppure «Crea comunque una copia nuova».
2. **Copie ripetute.** Premendo due volte si creano due prodotti. Proposta: il pulsante si disattiva durante il salvataggio. Il codice 00-xxx è già controllato contro i doppioni.
3. **Descrizioni uguali.** Il nuovo prodotto avrà la stessa descrizione della copia B2B. La ricerca della Lista e i preferiti li mostreranno come due voci distinte, che è il comportamento voluto (nessuna unificazione automatica). Consiglio di cambiare la descrizione o il codice per riconoscerli.
4. **Senza collegamento al fornitore.** La nuova copia nasce senza fornitore. Se poi lo si collega al fornitore, si hanno due nostri prodotti sullo stesso articolo B2B.
5. **Permessi.** La procedura è riservata agli amministratori: per gli operatori la voce del menu sarà nascosta o disattivata.

## Dettagli tecnici

- File da modificare:
  - `src/components/shopping/shopping-list-card.tsx`: aggiungere la voce nel menu ⋮;
  - `src/components/shopping/shopping-list-panel.tsx`: aprire la finestra con i dati precompilati;
  - `src/components/products/internal-product-dialog.tsx`: modalità «precompilata» per la creazione (il valore `product` senza `id` è già supportato) e avviso sui doppioni.
- Lettura dei dati: articolo del venditore tramite `created_from_product_id` della nostra copia, oppure le informazioni già presenti nella card. Ricerca di copie esistenti tramite `created_from_product_id`.
- Database: **nessuna migrazione**. Si usano `manage_internal_product` (create) e le letture già esistenti. Facoltativo: annotare nello storico «copiato da articolo B2B X». Richiederebbe un parametro in più nella procedura, quindi una migrazione, e lo valutiamo a parte.
- Non vengono toccati Inventario, Fabbisogno, Ordini, Consegne, Carico merce e il semaforo.

## Da decidere

1. Nel caso del rischio 1, quale scelta proponiamo per prima?
2. Vuoi il codice del fornitore nelle note del nuovo prodotto?
3. Il nuovo prodotto va aggiunto subito ai Preferiti, oppure no?
