# Correggere i giorni di consegna e rendere raggiungibile la proposta acquisto diretto

## Problema verificato
«Salva giorni» fallisce perché la funzione cerca `buyer_company_id` nel collegamento prodotto–fornitore, che contiene invece `company_id`. Il controllo è stato verificato in sola lettura sul database.
Il pulsante acquisto diretto non è stato aggiunto alla scheda reale: il piano precedente autorizzava soltanto una proposta separata.

## Intervento proposto
1. Correggere soltanto il riferimento all’azienda nella funzione di salvataggio dei giorni, mantenendo autorizzazioni, giorni validi, eccezione e ripristino dei giorni del fornitore.
2. Aggiungere nella tab **Acquisto**, accanto ai comandi fornitori, **«Acquisto diretto — anteprima»** per aprire la proposta già realizzata. Non sarà ancora un’impostazione salvata del prodotto.
3. Verificare la correzione senza modificare prodotti o ordini reali; lasciare ad Andrea il salvataggio manuale su 3 EMME. Controllare apertura della proposta e assenza di scritture operative.

## Limiti e rischio da approvare
- Nessun fornitore fittizio, nessuna modifica alla Lista della Spesa, alle preferenze reali o alle giacenze.
- Nessuna pubblicazione, nessuna email, roadmap invariata.
- Il database è condiviso tra anteprima e sito pubblicato: la correzione della funzione di salvataggio sarà efficace su entrambi, anche senza pubblicare le pagine.
- L’acquisto diretto abituale reale richiede un successivo piano approvato; questa modifica rende soltanto accessibile la proposta dalla scheda.

## File autorizzati e dettagli tecnici
- Creare `.lovable/sql/0082_fix_product_supplier_delivery_schedule.sql`: controlli iniziali/finali e sostituzione della sola funzione `set_product_supplier_delivery_schedule`, con `SECURITY DEFINER`, `search_path = public` e permessi esistenti conservati; nessuna nuova tabella o colonna. Applicazione tramite migrazione Lovable Cloud.
- Modificare `src/components/products/product-suppliers-manager.tsx`: solo accesso alla pagina `/acquisti/acquisto-diretto-anteprima` mediante componenti esistenti.
- Nessuna modifica ai file storici di migrazione, alla proposta già esistente, agli altri comandi o alle altre pagine.

## Verifica e resoconto
Controllare che la funzione installata legga `company_id`, mantenga tutti i controlli e non alteri i dati durante l’applicazione. Verificare l’accesso alla proposta dall’app autenticata senza salvare. Nel resoconto indicare file e righe cambiati e distinguere verifiche in sola lettura dal collaudo manuale di salvataggio.