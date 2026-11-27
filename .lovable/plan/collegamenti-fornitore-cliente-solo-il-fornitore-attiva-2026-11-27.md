# Collegamenti fornitore↔cliente: solo il fornitore attiva

## Situazione attuale (verificata in lettura)

Percorsi che creano o attivano un collegamento (tutti funzioni DB con privilegi propri):
- request_supplier_relation: il cliente chiede, crea riga «in_attesa», origine richiesta_cliente.
- invite_customer_relation: il fornitore invita, riga «in_attesa», origine invito_fornitore.
- decide_company_relation: risponde solo la controparte (richiesta cliente → admin del fornitore; invito fornitore → admin del cliente).
- accept_invitation_row / accept_invitation_with_new_company: accettazione di un invito creato dal fornitore, riga «attivo».
- set_relation_side_enabled, revoke_company_relation, link_customer_record_to_relation, link_supplier_record_to_relation, resolve_relation_records: aggiornano righe esistenti.

Regole di accesso della tabella:
- INSERT (relations_insert_admin): admin cliente con origine richiesta_cliente, o admin fornitore con invito_fornitore. Non controlla stato né permessi: il cliente può inserire «attivo» con permessi accesi. È la falla.
- UPDATE (relations_update_admin): admin di entrambe le parti, su ogni colonna. Falla gemella: il cliente può portare a «attivo» una propria richiesta o riattivare un collegamento sospeso/revocato.
- UPDATE (relations_update_supplier_admin): admin del fornitore.
- Diritti: anon e authenticated hanno INSERT e UPDATE sulla tabella.

Flussi reali che usano la scrittura diretta: nessuno. Nel codice dell'app ci sono solo letture; tutte le scritture passano dalle funzioni sopra.

Dati: 8 collegamenti, tutti attivo / invito_fornitore / permessi accesi. Non verranno toccati.

## Proposta (non applicata)

1. Togliere INSERT e UPDATE diretti sulla tabella ad anon e authenticated, ed eliminare le tre policy di scrittura. Lettura invariata.
2. Le scritture restano possibili solo tramite le funzioni esistenti, che già controllano chi può fare cosa.
3. request_supplier_relation: la riga del cliente nasce «in_attesa» con seller_enabled e buyer_enabled spenti; decide_company_relation li accende quando l'admin del fornitore accetta.
4. Nessuna modifica a collegamenti esistenti, inviti, ponte Incassi, ordini o Danea.

## Prova (SQL in rollback, nessun dato persistente)

In un'unica transazione annullata, impersonando un admin 3 EMME lato cliente:
- INSERT diretto «attivo» → rifiutato.
- UPDATE diretto a «attivo» → rifiutato.
- request_supplier_relation → riga «in_attesa», permessi spenti.
- decide_company_relation come cliente → rifiutato; come admin fornitore → «attivo», permessi accesi.
- Conteggio e contenuto degli 8 collegamenti identici prima/dopo. ROLLBACK finale.

## Dettagli tecnici

Migrazione: REVOKE INSERT, UPDATE ON public.supplier_customer_relations FROM anon, authenticated; DROP POLICY relations_insert_admin, relations_update_admin, relations_update_supplier_admin; aggiornare request_supplier_relation (seller_enabled/buyer_enabled false) e decide_company_relation (accensione all'accettazione). Le funzioni sono SECURITY DEFINER, quindi non dipendono dai diritti revocati. Rischio: eventuali script esterni che scrivono direttamente fallirebbero; nel codice non ne risultano.
