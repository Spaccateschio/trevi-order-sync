# Ripristino dei prodotti associati al fornitore

## Problema verificato
Per AZ.AGR. GORI MARCO risultano già tre collegamenti attivi salvati. L’elenco «Prodotti forniti» fallisce nel leggere le U.M. e mostra erroneamente «0 associazioni»: non è prova di un mancato salvataggio.

Il collegamento è già unico e condiviso: «Aggiungi prodotti» salva in `product_supplier_links`, la scheda Prodotto legge gli stessi collegamenti tramite `product_supplier_overview`. Non serve duplicare dati o creare una seconda associazione.

## Correzione circoscritta
- Correggere la lettura delle U.M. nell’elenco del fornitore, indicando esplicitamente la relazione dell’U.M. acquistabile, distinta dall’U.M. di magazzino verificata.
- Se il caricamento fallisce, mostrare un errore con possibilità di riprovare, non un falso elenco vuoto né consentire nuove associazioni basate su dati mancanti.
- Dopo un’associazione, aggiornare le letture interessate della scheda Prodotto e dell’elenco fornitore. Conservare le RPC esistenti, i controlli e la selezione multipla; nessuna duplicazione o modifica automatica di U.M., costi o conversioni.
- In caso di errore durante la selezione multipla, aggiornare comunque l’elenco per mostrare eventuali collegamenti già riusciti, senza presentarli come non salvati.

## File previsti
- `src/components/products/supplier-products-manager.tsx`: lettura, stato di errore e aggiornamento degli elenchi.
- `src/components/products/supplier-products-manager-regression.test.py`: prova del flusso con risposte di salvataggio simulate, senza scritture operative.
- `src/components/products/AGENTS.md`: regola sul collegamento condiviso e sulla lettura U.M. esplicita.

## Verifiche
- Lettura autenticata dei collegamenti già presenti e controllo dell’assenza dell’errore osservato.
- Prova selezione multipla → associazione → elenco fornitore → scheda Prodotto con risposte simulate, più prova di errore: nessuna scrittura su Trevi o altre aziende.
- Il collaudo con salvataggio reale resta ad Andrea su 3 EMME.

## Dettaglio tecnico
Errore rilevato: `PGRST201`, relazione ambigua tra `product_supplier_link_units` e `units_of_measure`; usare `units_of_measure!product_supplier_link_units_unit_id_fkey`. L’altra relazione riguarda `verified_stock_unit_id` e non rappresenta l’U.M. acquistabile.

Nessuna migrazione, modifica a dati aziendali, invio o pubblicazione; `roadmap.md` invariato.