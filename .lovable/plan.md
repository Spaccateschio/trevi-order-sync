# Passi delle quantità — solo dati e impostazione di vendita

## Elenco completo prima dell'applicazione
Letti **33 record U.M.**: 9 di 3 EMME ROMA SRL, 8 di AIELLO CESARE, 16 di trevi srl. Tutti hanno attualmente `allows_decimals = true`: quel campo resta invariato.

Ogni cella numerica rappresenta una U.M. esistente di quell'azienda. «—» significa assente. Sono incluse anche le U.M. disattivate, indicate con *.

| Codice | Descrizione | 3 EMME ROMA SRL | AIELLO CESARE | trevi srl |
|---|---|---:|---:|---:|
| cassa | Cassa da Danea | — | — | 1 |
| confezione | Confezione da Danea | — | — | 0,1 |
| cs | Cassa | 1 | 1 | 1 |
| ct | Cartone | 0,1 * | 0,1 | 0,1 |
| kg | Chilogrammo | 0,1 | 0,1 | 0,1 |
| lt | Litro | 0,1 | 0,1 | 0,1 |
| mazzo | Mazzo da Danea | — | — | 1 |
| ml | Millilitro | 0,1 * | 0,1 | 0,1 |
| mz | Mazzo | 1 | 1 | 1 |
| nr | nr da Danea | 1 | — | 1 |
| pezzo | Pezzo da Danea | — | — | 1 |
| pz | Pezzo | 1 | 1 | 1 |
| sc | Sacco | — | — | 0,1 |
| vasch | Vaschetta | 1 | 1 | 1 |
| vaschetta | Vaschetta da Danea | — | — | 1 |
| zzt | Test C1 mod | — | — | 0,1 * |

**Totali: 18 record con passo 1; 15 con passo 0,1.** Nessun passo viene applicato prima della conferma. `mz` e `vasch` sono gli attuali codici di Mazzo e Vaschetta, quindi ricevono passo 1. Cartone, sacco e confezione non sono trattati come casse: seguono la regola delle altre U.M.

## Perimetro
- Aggiungere il passo della U.M., numerico e strettamente positivo.
- Aggiungere al prodotto «Vendibile a mezza cassa», spento di default; mostrarlo nella tab Vendita accanto alle U.M., solo se esiste una U.M. di vendita attiva `cs` o `cassa`.
- Cassa: passo 0,5 quando acceso, 1 quando spento. Tutte le altre U.M. usano il proprio passo.
- Nessun cambio al significato o ai valori di `allows_decimals`, alle conversioni o alle confezioni.
- Questa fase **non introduce ancora controlli o arrotondamenti** nell'app cliente, nell'inserimento manuale, nella Lista, negli ordini fornitore, nell'inventario o nell'XML Danea; il nuovo passo è una configurazione disponibile per una successiva fase approvata.

## Sequenza e punti di conferma
1. Dopo l'approvazione del piano, mostrare prima il solo nuovo switch in una prova isolata, senza salvataggio reale, rispettando la richiesta di mockup prima dei collegamenti.
2. Dopo l'approvazione di quella prova e dell'elenco sopra, applicare la modifica additiva: inizializzare solo il nuovo passo sulle 33 U.M., senza cambiare gli altri campi; tutti i prodotti partono con lo switch spento.
3. Collegare il salvataggio del solo switch ai controlli amministratore, conservando tutti i salvataggi esistenti. Su errore il valore non viene presentato come salvato. Danea non modifica la scelta.
4. Verificare i nuovi campi, i 33 passi e l'invarianza di `allows_decimals`; testare le regole con valori concreti. Non fare salvataggi di prova sui prodotti reali: il collaudo operativo resta ad Andrea su dati di prova autorizzati.

## Dettagli tecnici e file previsti
- Nuova migrazione generata dallo strumento in `drizzle/migrations/`: `units_of_measure.quantity_step numeric NOT NULL DEFAULT 0.1`, backfill dei valori sopra e vincolo `CHECK (quantity_step > 0)`; `products.sell_half_case boolean NOT NULL DEFAULT false`.
- Inizializzazione anche delle nuove U.M. usando gli stessi codici e `allows_decimals` solo come criterio iniziale: nessun aggiornamento automatico del passo quando cambia quel flag.
- Nuova RPC `set_product_sell_half_case(product_id, enabled)`: identità da `auth.uid()`, verifica amministratore dell'azienda proprietaria del prodotto; nessun parametro azienda o utente; `SECURITY DEFINER SET search_path = public`, EXECUTE solo authenticated. Non modificare le RPC esistenti delle U.M.
- `src/components/products/sales-unit-manager.tsx`: switch shadcn, lettura mirata del nuovo campo e aggiornamento della relativa cache; prova isolata prima del collegamento. Non cambiare il form delle U.M. già presente.
- Nuovi `src/lib/sale-quantity-step.ts` e `src/lib/sale-quantity-step.test.ts`: riconoscimento `cs`/`cassa`, regole di inizializzazione e passo effettivo; non collegati ai campi quantità in questa fase.
- Nuovi `src/lib/product-half-case.functions.ts` e `src/lib/product-half-case.functions.test.ts`: salvataggio autenticato e test del percorso senza privilegi.
- Nuovo `src/components/products/half-case-switch-mockup.tsx`: prova dello switch con stato locale isolato, prima di qualsiasi scrittura reale.
- `src/components/products/AGENTS.md` e `src/lib/AGENTS.md`: regole strutturali di configurazione separata e salvataggio autenticato; `roadmap.md`: solo la voce di questo intervento.
- `src/integrations/supabase/types.ts`: rigenerato automaticamente dallo strumento, mai modificato a mano.

Se serve un altro file applicativo, fermarsi e aggiornare il piano prima di modificarlo.

## Verifiche
- kg = 0,1; pz/pezzo, cs/cassa, mz/mazzo, vasch/vaschetta, nr = 1.
- Altra U.M.: 1 con allows_decimals=false; 0,1 con true.
- Cassa: switch spento = 1; acceso = 0,5; altre U.M. non influenzate dallo switch.
- Passo zero/negativo rifiutato; salvataggio non amministratore rifiutato; identità mai presa dai parametri.
- Visibilità solo con cassa di vendita attiva; nessuna modifica di ordini, conteggi, prezzi o storico.

**Nessuna pubblicazione. Nessuna modifica applicativa o al database è stata ancora eseguita: finora solo verifica, memoria dei requisiti e aggiornamento della voce nella roadmap.**