# Fornitori e «Acquisto diretto» sulle card con quantità non confermata

Solo analisi. Nessuna modifica finché non scegli A o B.

## 1) Da dove arrivano oggi i controlli

**Due tipi di card diverse**
- Le **card della Lista**, cioè i prodotti che hanno già una riga nella Lista, usano `ShoppingListCard`. Nella sezione «Fornitori ▸» questa card mostra `CardSuppliers`, e tutto è legato a `row.item_id`:
  - la spunta per ogni fornitore;
  - il menu ⋮ con «Togli da questa Lista» e «Scollega dal prodotto»;
  - «Acquisto diretto».
  
  Ogni lettura parte dalla riga della Lista: `readCardBundle(company:item_id)`, `shopping_item_supplier_units(_item_id)` e `readCardDirectQuota(item_id)`. Senza `item_id` questi controlli non hanno niente da leggere e niente su cui salvare.
- Le **card «Non in lista»**, cioè i prodotti del catalogo e quelli da valutare, arrivano da `catalog-entries.tsx`. Non hanno ancora una riga nella Lista, quindi non hanno `item_id`. Mostrano solo l'elenco dei nomi (`supplierNames`) e «Aggiungi fornitore». I controlli c'erano prima del Carrello perché allora la riga veniva creata subito, appena scrivevi la quantità.

**Cosa succede al Conferma del Carrello** (`saveShoppingCart` → `saveEntryCartInGroups`, 4 righe alla volta)
- `list:` è una riga già esistente: viene salvata la quantità (`commitQuantity`). Con 0 la riga viene esclusa.
- `catalog:` prima crea la riga (`catalogActions.add`, con `add_catalog_product_to_own_products` se serve), poi salva la quantità.
- `pending:` passa da `confirmPending`.
- Dopo il salvataggio della quantità, `autoAssignItem` (`shopping-auto-assign.ts`) sceglie dove comprare con `chooseListDestinations`. Tiene conto di:
  - fornitori collegati;
  - fornitori tolti;
  - memoria dell'ultima Lista chiusa;
  - stelle;
  - stella dell'acquisto diretto.
  
  Poi scrive le quote in `shopping_list_item_suppliers` oppure crea l'acquisto diretto.
- I fornitori tolti vengono salvati in `deselected_at`, solo tramite `set_shopping_list_supplier_selection`. In più c'è un elenco temporaneo nel browser (`markDeselected`/`deselectedFor`), anche questo legato a `item_id`.
- `autoAssignItem` accetta già due indicazioni: un fornitore da preferire (`preferLinkId`) e la stella dell'acquisto diretto.

## 2) Le due strade

### A) Scelta tenuta nella bozza e salvata al Conferma
- Sulla card «Non in lista» compare una sezione «Fornitori ▸» semplificata, che mostra la proposta di `chooseListDestinations` calcolata come per il Carrello. Contiene:
  - la spunta per ogni fornitore collegato;
  - la casella «Acquisto diretto (compro io)».
- La scelta resta nella bozza del Carrello, in questo browser, insieme alla quantità e all'U.M. Non scrive nulla finché non confermi.
- Al Conferma, dopo aver creato la riga e salvato la quantità, la scelta viene passata a `autoAssignItem`: i fornitori tolti come fornitori esclusi, il fornitore scelto come `preferLinkId`, oppure l'acquisto diretto.
- Il Carrello e «Cosa confermi» mostrano la destinazione scelta.
- Pro:
  - nessuna scrittura prima del Conferma, come vuole il Carrello;
  - nessun rallentamento.
- Contro:
  - la card «Non in lista» non è identica a quella completa: niente ⋮ e niente quote divise a mano;
  - le quote dettagliate restano disponibili solo dopo il Conferma.

### B) La riga viene creata quando apri «Fornitori ▸» o scegli «Acquisto diretto»
- Aprendo la sezione, o spuntando «Acquisto diretto», viene creata subito la riga nella Lista con lo stesso comando del Conferma. La quantità resta solo nella bozza.
- La card passa a `ShoppingListCard` e mostra la `CardSuppliers` completa.
- Il caricamento parte solo per quella card, solo quando la apri, quindi le altre card non rallentano.
- Pro: i controlli sono identici a quelli di oggi.
- Contro:
  - appena apri «Fornitori ▸» compare nel database una riga senza quantità. È proprio la scrittura anticipata che il Carrello aveva tolto;
  - se apri la sezione per sbaglio, la riga resta lì;
  - la card cambia tipo sotto il dito: rischio di perdere la quantità scritta se il passaggio della bozza da `catalog:` a `list:` non è perfetto.

## 3) Rischi

**Carrello**
- A: il calcolo «quanti prodotti, quanti fornitori» deve leggere anche le scelte nella bozza, altrimenti il conteggio non corrisponde a quello che vedi.
- B: il passaggio della bozza da `catalog:`/`pending:` a `list:` deve essere senza errori. Con il Conferma a gruppi da 4, una riga creata a metà può restare senza quantità.

**Regole dei mancanti**
- B: le righe create aprendo «Fornitori ▸» non hanno quantità, quindi entrano tra le **quantità mancanti**. Il completamento collettivo potrebbe chiederle o escluderle anche se non le volevi.
- A: nessun effetto, perché la riga nasce solo al Conferma insieme alla quantità.

**Cicli della Lista**
- Tutte e due le strade funzionano solo con Lista aperta e ciclo non rosso (`assert_shopping_list_open` / semaforo).
- B: righe vuote create e poi abbandonate restano nella Lista quando la chiudi o generi gli ordini. Vanno escluse o bloccate, oppure ripulite.
- A: se nel frattempo la Lista cambia (chiusa, annullata, nuovo ciclo), la bozza viene già scartata come oggi, e con lei anche la scelta dei fornitori.

## Consiglio (decidi tu)
A è più sicura perché rispetta la regola «il Conferma è l'unica scrittura». B dà controlli identici, ma reintroduce le scritture anticipate e porta righe senza quantità tra i mancanti.

Non cambio nulla finché non mi dici **A** o **B**.

## Dettagli tecnici
- A, file toccati: `catalog-entries.tsx` per la sezione nella card; `local-entry-cart.ts` per aggiungere `deselectedLinks`, `preferLinkId` e `direct` alla bozza della riga; `shopping-list-panel.tsx` per il Conferma e il calcolo del Carrello; `shopping-auto-assign.ts` per accettare i fornitori esclusi della bozza. Test sulla scelta passata a `chooseListDestinations`.
- B, file toccati: `catalog-entries.tsx`, `shopping-list-panel.tsx` (creazione su richiesta e passaggio della bozza), più un filtro sui mancanti per le righe create così.
- Database e funzioni SQL invariati in tutte e due le strade.
