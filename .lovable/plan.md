# U.M. di magazzino, acquisto e conversioni (compatibile con il futuro carico/scarico)

Solo piano: nessuna modifica finché non lo approvi. Si lavora a passi, uno alla volta.

## Principio
Ogni prodotto ha **una sola U.M. di magazzino**. Giacenza, conteggi e movimenti sono sempre espressi in quella U.M. Ordini e documenti dei fornitori mostrano invece la U.M. originale (es. 3 casse). Ogni movimento conserva l'originale e la conversione usata, così niente va ricalcolato in futuro.

## 1. Cosa esiste già e cosa si aggiunge

| Dato | Oggi | Cosa cambia |
|---|---|---|
| U.M. Danea del prodotto | sul prodotto (`danea_um`), aggiornata da Danea | resta così, solo informativa |
| U.M. di magazzino | non esiste: si usa quella Danea | **nuovo campo sul prodotto**, scritto solo dall'app e mai da Danea |
| U.M. d'acquisto per fornitore | più U.M. per ogni collegamento prodotto↔fornitore, con fattore facoltativo e tipo esatta/indicativa | si aggiunge il **modo**: fissa / variabile / stessa U.M. del magazzino |
| Conteggio inventario | quantità + U.M. scritta | si aggiungono quantità convertita, fattore usato e U.M. di magazzino del momento |
| Carico merce | quantità verificata + U.M. + fattore + quantità in giacenza (già presenti) | regole nuove per i casi variabile e mancante |
| Movimenti di magazzino | registro già presente (tipi: entrata acquisto, uscita cliente, scarto, reso, trasferimento, rettifica) con quantità e U.M. | si estende, senza rifarlo (vedi punto 7) |

## 2. Cosa resta come oggi
Codice, descrizione e U.M. Danea; sincronizzazione Danea; U.M. d'acquisto per fornitore; Lista della Spesa e ordini in U.M. d'acquisto; storico e regola «dato d'ordine = quantità + U.M. d'acquisto + fornitore».

## 3. Cosa cambia
- **U.M. di magazzino propria del prodotto.** Per i prodotti esistenti si parte dalla U.M. Danea, così nessun numero cambia. Puoi sostituirla quando quella Danea non va bene per contare (es. vino a casse in Danea, a bottiglie in magazzino). Danea non la sovrascrive mai. Se Danea cambia la sua U.M., compare un avviso da controllare e non succede niente in automatico.
- **Cambiare la U.M. di magazzino** è possibile solo senza inventario in corso. Il cambio fa partire un nuovo conteggio di riferimento («da contare»), invece di convertire numeri vecchi. Lo storico resta com'è.
- **Conteggio misto in inventario**: «2 casse + 3 bottiglie» = 15 bottiglie, possibile solo se la conversione è fissa ed esatta. Senza conversione il conteggio in un'altra U.M. resta come oggi: non diventa giacenza.

## 4. Conversione fissa e quantità variabile
Ogni U.M. d'acquisto di un fornitore ha un modo:
- **Stessa U.M.** (compro a kg, conto a kg): fattore 1, nessuna domanda.
- **Fissa** (1 cassa = 6 bottiglie): fattore obbligatorio, usato da solo al carico.
- **Variabile** (cassa di peso diverso ogni volta): niente fattore fisso. Al carico si scrive la quantità realmente ricevuta in U.M. di magazzino (es. 8,7 kg). Si può indicare un valore indicativo (circa 9 kg), usato solo come stima nella Lista e mai come giacenza.
- **Non ancora impostata** (la situazione di oggi): la Lista e l'ordine funzionano; al carico l'app chiede la quantità in U.M. di magazzino, senza bloccare e senza inventare niente.

## 5. Come funzionano le pagine
- **Lista della Spesa**: il fabbisogno è in U.M. di magazzino. Decidi in U.M. d'acquisto («2 casse ≈ 12 bottiglie» se fissa, «≈ 18 kg» se variabile con valore indicativo, nessun equivalente se manca).
- **Ordine**: mostra sempre 3 casse e conserva la conversione del momento come semplice informazione.
- **Carico merce**: fissa → 3 × 6 = +18 bottiglie in automatico, modificabile se arriva diverso; variabile o non impostata → l'app chiede quanto è entrato davvero. Il movimento salva entrambe le quantità.
- **Inventario**: conti in U.M. di magazzino, oppure in modo misto quando la conversione è fissa. La nuova giacenza diventa la quantità contata e l'adeguamento si registra come movimento.

## 6. Danea e storico
- Danea continua ad aggiornare solo i suoi campi. La U.M. di magazzino è un campo separato che Danea non tocca.
- Inventari chiusi, ordini, carichi, giacenze e rettifiche già registrati restano invariati: ogni riga ha già la sua U.M. e non viene ricalcolata. La U.M. di magazzino iniziale coincide con quella Danea, quindi i numeri di oggi restano validi.
- Per i prodotti esistenti: il nuovo campo si compila con la U.M. Danea e il modo delle U.M. d'acquisto con «stessa U.M.» o «non ancora impostata». Una pagina mostra i prodotti con U.M. d'acquisto senza conversione, da completare.

## 7. Registro movimenti futuro (solo predisposto, non implementato)
Il registro attuale si estende con campi facoltativi, senza cambiare niente di ciò che esiste:

```text
movimento
  data e ora · autore · azienda · prodotto · zona · lotto (facoltativo)
  causale: carico acquisto (+) | vendita (−) | rettifica (±) | adeguamento inventario (±)
           reso cliente (+) | reso fornitore (−) | scarto/deperimento (−) | trasferimento
  quantità originale + U.M. originale         es. 3 cassa
  fattore usato + modo (fissa/variabile/stessa) es. 6 · fissa
  quantità in U.M. magazzino (con segno)       es. +18
  U.M. di magazzino del momento                es. bottiglia
  documento di riferimento: tipo + id (ordine, carico, inventario, vendita, reso)
  note
```

Esempi: acquisto 3 casse → +18 bottiglie; vendita 1 cassa → −6; vendita 2 bottiglie → −2. Tutto converge nella stessa U.M. La giacenza diventerà la somma dei movimenti dall'ultimo adeguamento d'inventario, in linea con il calcolo di oggi. Non servirà rifare niente: le vendite useranno le U.M. di vendita già esistenti, con lo stesso schema fissa/variabile.

## Chiarimenti (verificati su ordini, carichi e unità)

**1. Conversione fotografata nei documenti.** Oggi l'ordine, la ripartizione nella Lista e il carico salvano già quantità, U.M. d'acquisto e fattore del momento. Mancano il modo (fissa/variabile/stessa) e la U.M. di magazzino del momento: si aggiungono a ripartizioni Lista, righe ordine, carichi, resi e movimenti. Un ordine di 3 casse × 6 resta 3 × 6 anche se tra sei mesi il fornitore passa a 12: niente viene mai riletto dalla configurazione.

**2. Conteggio misto con più fornitori.** Il conteggio principale è sempre nella U.M. di magazzino (15 bottiglie). Nel conteggio misto non si sceglie «cassa» generica ma una **confezione con nome**, per esempio «Cassa 6 bt» o «Cassa 12 bt». Le confezioni del prodotto sono un elenco proprio, con quantità fissa in U.M. di magazzino. Le U.M. d'acquisto dei fornitori le richiamano. Nessuna confezione viene scelta da sola: se ce ne sono due con la stessa U.M. va indicata quella giusta, e si possono sommare (2 × Cassa 6 + 1 × Cassa 12 + 3 bottiglie). Le confezioni variabili non sono usabili nel conteggio.

**3. Cambio della U.M. di magazzino = nuovo punto di partenza.** Il cambio registra una «nuova base» con data. Da quel momento il calcolo usa solo conteggi e movimenti successivi nella nuova U.M. I vecchi restano nello storico ma non vengono mai sommati. Finché non c'è un nuovo conteggio, la giacenza si mostra come «Da verificare», non come numero. Il calcolo attuale parte già dall'ultimo conteggio: si aggiunge solo il filtro sulla nuova base e lo stato «da verificare».

**4. Variabile.** Al carico si vedono sempre separate la quantità ordinata (3 casse) e quella ricevuta (27,4 kg, da scrivere). Il valore indicativo (≈ 9 kg) serve solo per Lista, previsione e suggerimenti, e non crea mai un movimento.

**5. Decimali decisi dall'unità.** Oggi le U.M. non hanno questa informazione. Si aggiunge «consente decimali sì/no» sull'U.M. configurata, compilato per le unità esistenti e modificabile dall'amministratore. Nessuna regola sui nomi «kg», «pz» o «bottiglia».

**6. Futuro scarico per vendita.** Lo stesso schema vale per le U.M. di vendita già esistenti: la vendita fotografa U.M., fattore, modo e confezione (Cassa 6 → −6 bottiglie; 2 bottiglie → −2). Il movimento salva sia l'originale sia la quantità convertita.

## 8. Casi limite
- Lo stesso prodotto con fornitori diversi (cassa da 6, cassa da 12, a pezzo): ogni fornitore ha la sua conversione, la U.M. di magazzino resta una sola.
- Il fornitore cambia formato (la cassa diventa da 12): la nuova conversione vale solo dai nuovi ordini, quelli vecchi conservano la loro.
- Merce arrivata diversa dall'ordinato (5 bottiglie in una cassa da 6): al carico si corregge la quantità reale e la differenza resta visibile.
- Quantità decimali: decide solo la proprietà «consente decimali» dell'U.M. (no → solo interi, sì → anche decimali), qualunque sia il nome dell'unità.
- Conversione indicativa usata per sbaglio come fissa: il conteggio misto e il carico automatico sono permessi solo con la fissa ed esatta.
- Prodotti non B2B o acquisti manuali: stessa logica, con la U.M. scelta a mano.
- Cambio di U.M. di magazzino con giacenza aperta: bloccato durante un inventario in corso; dopo il cambio serve un nuovo conteggio.

## Passi proposti (uno per volta, con il tuo via)
1. Database: U.M. di magazzino sul prodotto, modo delle U.M. d'acquisto, campi aggiuntivi su conteggi e movimenti; prodotti esistenti compilati con i valori attuali.
2. Scheda prodotto: scelta della U.M. di magazzino e delle conversioni per fornitore, più l'elenco «da completare».
3. Carico merce in U.M. di magazzino (fissa automatica, variabile da scrivere).
4. Inventario: conteggio in U.M. di magazzino e conteggio misto.
5. Lista della Spesa: equivalenti in U.M. di magazzino.

## Dettagli tecnici
- Nuova colonna nullable `products.stock_unit_id` (FK `units_of_measure`), compilata dalla U.M. corrispondente a `danea_um`. L'import Danea non la scrive: viene esclusa dall'aggiornamento in `danea-import.server.ts` e protetta da un trigger.
- `product_supplier_link_units.conversion_mode` (`stessa`/`fissa`/`variabile`, nullable = non impostata) e `indicative_factor`. Un trigger richiede il fattore quando il modo è `fissa`.
- `inventory_counts`: `stock_unit_id`, `stock_quantity`, `conversion_factor` e la composizione del conteggio misto in jsonb.
- Nuova tabella `product_stock_packages` (prodotto, nome, unit_id, quantità in U.M. magazzino, modo, stato) con GRANT e RLS sull'azienda; `product_supplier_link_units.package_id` facoltativo.
- Snapshot `conversion_mode`, `stock_unit_id`, `package_id` su `shopping_list_item_suppliers`, `purchase_order_items`, `goods_receipt_items`, movimenti e futuri documenti di vendita/reso.
- `units_of_measure.allows_decimals` boolean con default; `products.stock_base_at` per la nuova base; la giacenza ignora i conteggi/movimenti anteriori e restituisce «da verificare» senza conteggio successivo.
- `inventory_movements`: `original_quantity`, `original_unit_id`/`code`, `conversion_factor`, `conversion_mode`, `stock_unit_id`. La `quantity` attuale resta la quantità in U.M. di magazzino. Si aggiungono nuovi valori all'enum `inventory_movement_type` (reso cliente/fornitore, adeguamento inventario). `source_table`/`source_id` restano il riferimento al documento.
- Il calcolo della giacenza passa da `danea_um` a `stock_unit_id`. La regola in AGENTS.md («giacenza solo nella U.M. del prodotto (danea_um)») verrà sostituita con la stessa regola riferita alla U.M. di magazzino.
- Tutte le funzioni nuove: SECURITY DEFINER, search_path = public, autorizzazione tramite appartenenza all'azienda; nessuna colonna generata negli INSERT/UPDATE.

---

# Passo 1 — piano operativo (solo database, nessun cambiamento visibile)

Il passo 1 aggiunge solo campi e tabelle nuove, tutti facoltativi. Nessuna funzione esistente (giacenza, inventario, Lista, ordini, carichi, Danea) viene riscritta: continuano a funzionare esattamente come oggi.

## Tabelle e colonne
- `units_of_measure`: + `allows_decimals boolean NOT NULL DEFAULT true`.
- `products`: + `stock_unit_id uuid` (riferimento all'U.M. dell'azienda, facoltativo) e `stock_base_at timestamptz` (inizio della base attuale, facoltativo).
- Nuova tabella `product_stock_packages` (confezioni con nome): id, company_id, product_id, name («Cassa 6 bt»), unit_id, stock_quantity (> 0), status attivo/disattivato, autore e date. Un nome unico per prodotto tra le confezioni attive. GRANT ad authenticated e service_role, RLS attivo, policy sull'azienda dell'utente.
- `product_supplier_link_units`: + `conversion_mode text` (stessa / fissa / variabile, vuoto = non impostata), `indicative_factor numeric`, `package_id uuid`.
- Fotografie sui documenti (tutte facoltative, vuote sulle righe vecchie): `conversion_mode`, `stock_unit_id`, `package_id` su `shopping_list_item_suppliers`, `purchase_order_items`, `goods_receipt_items`.
- `inventory_counts`: + `stock_unit_id`, `stock_quantity`, `conversion_factor`, `count_breakdown jsonb` (composizione del conteggio misto).
- `inventory_movements`: + `original_quantity`, `original_unit_id`, `original_unit_code`, `conversion_factor`, `conversion_mode`, `package_id`, `stock_unit_id`.
- Nuovi valori della causale movimenti: `reso_cliente`, `reso_fornitore`, `adeguamento_inventario`. Sono solo aggiunti e restano inutilizzati per ora.

## Dati esistenti inizializzati
- `products.stock_unit_id` = l'U.M. dell'azienda con lo stesso codice della U.M. Danea: 122 prodotti su 124 hanno una corrispondenza. I 2 senza corrispondenza (U.M. Danea «nr») restano vuoti e finiranno nell'elenco «da completare».
- `stock_base_at` resta vuoto per tutti, cioè «nessun cambio di base»: il calcolo di oggi resta valido.
- `allows_decimals`: le unità attuali partono da «sì» (oggi i decimali sono permessi ovunque, quindi niente si blocca). Dal passo 2 potrai impostare «no» su pz, mz, cs, ct e vasch.
- Tutto il resto resta vuoto: nessun ordine, carico, conteggio o movimento esistente viene aggiornato.

## Trigger e funzioni
- Trigger su `products`: chi non è amministratore non può cambiare `stock_unit_id` / `stock_base_at`, e l'U.M. deve appartenere alla stessa azienda. L'import Danea non scrive questi campi: oggi aggiorna solo campi elencati per nome, quindi non serve modificarlo.
- Trigger su `product_supplier_link_units`: con modo «fissa» il fattore è obbligatorio e > 0; con «variabile» il fattore resta vuoto; la confezione deve essere dello stesso prodotto.
- Trigger su `product_stock_packages`: prodotto e U.M. della stessa azienda.
- Tutto SECURITY DEFINER con search_path = public, autorizzazione tramite appartenenza/admin dell'azienda. Nessun nuovo trigger su ordini, carichi, conteggi o movimenti.

## File del codice
- Nuova migrazione del database.
- `src/integrations/supabase/types.ts` rigenerato in automatico.
- `AGENTS.md`: regola della giacenza riferita alla U.M. di magazzino, con `danea_um` come valore iniziale.
- `roadmap.md`: stato del passo.

Nessuna pagina e nessuna funzione del programma cambia in questo passo.

## Garanzie su giacenze e storico
- Solo `ADD COLUMN` facoltativi o con default, `CREATE TABLE` nuova, `ALTER TYPE ... ADD VALUE`. Nessun DROP, rename o cambio di tipo.
- L'unica scrittura su dati esistenti è `products.stock_unit_id`: un campo nuovo che nessuna funzione legge ancora.
- Le funzioni di giacenza, inventario, Lista, ordini e carichi non vengono toccate.
- Verifica prima/dopo con lettura dal database: giacenza calcolata di tutti i prodotti, numero e somme di conteggi, rettifiche, movimenti, righe ordine e righe carico devono restare identici. Più l'apertura a schermo di Inventario, Lista e Ordini senza errori.
