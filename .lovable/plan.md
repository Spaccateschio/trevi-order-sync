# Fornitore collegato e unità vuote — risposte e piano

## Risposte (sola lettura)

**1. Collegamenti B2B attivi senza unità sul collegamento**
- 3 EMME ROMA SRL: 45 su 45 · AIELLO CESARE: 30 su 30 · ZIA BETTA: 9 su 9 → totale 84 su 84.
- Esempi 3 EMME: 00-005 Basilico, 00-022 Ananas, 00-016 Avocado, 00-035 Caponata, 00-039 Cipolle, 00-009 Zucchine.
- Non è un'anomalia dei dati: per i fornitori B2B la Lista non legge mai `product_supplier_link_units`, usa già le unità pubblicate dall'articolo del venditore (regola esistente). Nessuna correzione dati serve.

**2. Dove si decide nel codice**
- Unità: funzione DB `shopping_item_supplier_units` (letta tramite `shopping_list_cards_bundle`, `src/lib/shopping-card-reads.ts`). Per B2B prende `product_sale_units` dell'articolo `b2b_item_id`, attive e visibili al cliente, **solo se acquistabile**.
- Acquistabile: `shopping_link_b2b_source` → `b2b_item_purchasable` (rapporto attivo e abilitato, articolo pubblicato e visibile, stesso archivio).
- Blocco a schermo: `src/components/shopping/card-suppliers.tsx` righe ~709-729 (`notPurchasable`, `noUnits` disabilitano spunta e U.M.); stesso filtro in `src/lib/supplier-selection.ts` e `supplier-memory.ts`.
- **Punto importante:** per 0246 e 1824 tutte le condizioni risultano vere nei dati (rapporto attivo, abilitato da entrambi, stesso archivio, articoli pubblicati e visibili). Quindi il DB dovrebbe già restituire mazzo/mz/pz e kg/cs/pz. La causa del menu vuoto visto ieri **non è confermata**: la mia diagnosi precedente era sbagliata.

**3. Memoria fornitore oggi (`supplier-memory.ts` + `readMemories` in `shopping-auto-assign.ts`)**
- Fonte: ultima Lista **chiusa** dell'azienda; tabella `shopping_list_item_suppliers` (campi `product_supplier_link_id`, `purchase_unit_id/code`, `purchase_quantity`), escluse righe con `deselected_at`; più `shopping_list_items.manual_purchase_*` per l'acquisto diretto.
- Ricorda: fornitore, U.M. e proporzioni; mai le quantità. Riletta alla prima assegnazione di una riga senza quote (`chooseListDestinations`); cede se la stella è cambiata a mano dopo quella Lista.
- Regola 1 (proposto il collegato preferito): coperta, se il fornitore è acquistabile con unità.
- Regola 2 (cambio sulla card): coperta (spunta / «+ Aggiungi fornitore»).
- Regola 3 (si ricorda): coperta solo se la Lista viene **chiusa**; Liste annullate o ancora aperte non vengono ricordate.

## Piano (dopo il tuo via libera)

1. **Prima la causa vera**: apro la Lista su 3 EMME in anteprima e leggo cosa restituisce il database per Basilico e Ananas (unità e acquistabile). Nessuna scrittura.
2. Se il database restituisce le unità ma la card le scarta → correggo solo la lettura nella card, così compare mazzo (Basilico) e kg (Ananas) come predefinite e la riga si salva senza «Fornitore da assegnare».
3. Se il database le scarta → ti mostro la condizione esatta che fallisce e ti propongo a parte la correzione, senza eseguirla.
4. «Fornitore da assegnare» con motivo esatto: «nessun fornitore collegato», «articolo non più nel catalogo del fornitore», «il fornitore non pubblica unità».
5. Memoria: nessuna nuova tabella; riuso quella esistente. Se vuoi che valga anche per Liste non chiuse, è una scelta da confermare a parte.

Ciclo, database e collegamenti invariati. Nota: non ho potuto aggiornare il file delle attività in questa modalità; lo aggiorno appena approvi.
