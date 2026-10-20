# Autorizzazioni Vendo — analisi e piano per fasi

## 1. Perimetro e decisioni confermate
Solo analisi: nessuna modifica all’app/database, migrazione, email, ordine, pubblicazione o modifica a roadmap.md. Trevi e 3 EMME inalterate. Inviti commerciali e collaboratori 2B esclusi.

Andrea ha confermato:
- Sospendere/revocare anche con solo Vendo: niente attivazione automatica di Compro; restano profilo, storico e completamento consentito del pregresso.
- Gli ordini già inviati possono essere completati; vietati nuovi ordini, nuove righe e aumenti delle quantità ordinate.
Email e notifiche reali richiedono approvazioni separate. Prima delle nuove schermate: mockup isolato, poi collegamento reale approvato.

## 2. Fotografia attuale
Verificati codice, migrazioni 0080/0081, definizioni DB installate, colonne, vincoli, trigger, RLS e privilegi effettivi. Le funzioni live confermano Fase 0/1 presenti; il commento «PROPOSTA» in 0081 è storico. Nessun collaudo operativo eseguito.
- companies.can_buy/can_sell sono profili effettivi; companies.status è lo stato generale, non la licenza Vendo.
- company_sell_requests: in_attesa/approvata/rifiutata/annullata, una sola pendente per azienda; SELECT admin aziendale, nessuna scrittura diretta authenticated, owner postgres/RLS.
- register_company crea Compro acceso/Vendo spento e richiesta se scelto Vendo. accept_invitation_with_new_company delega alla registrazione.
- request/cancel verificano admin; decide_company_sell_request verifica super attivo nel DB e blocca/rilegge la richiesta; approvazione una sola volta.
- _company_sell_guard è intenzionalmente SECURITY INVOKER: accensione solo writer postgres + contesto transazionale app.sell_approval=approved. Non convertirlo in DEFINER: perderebbe il controllo del writer.
- set_company_capabilities vieta riaccensione autonoma; vincolo companies_capability_required impone almeno un profilo.
- Profilo mostra attivo/attesa/rifiuto; piattaforma gestisce richieste, non sospensione/revoca. SELL_REQUEST_EMAILS_ENABLED=false; campanella solo demo.
Riferimenti: 0080:18–59; 0081:18–55,58–149,195–283; company-profile.tsx:18–43; sell-request.functions.ts:8–53; sell-request-email.server.ts:5–25.

## 3. Problemi riscontrati
1. Nessuno stato persistente Sospeso/Revocato; richiesta ordinaria non distingue un blocco.
2. Vendo spento NON blocca tutti i nuovi ordini: live b2b_item_purchasable usa relation_is_operational, che controlla rapporto/abilitazioni, non can_sell. Generazione/chiusura Lista chiamano questo controllo; manage_purchase_order('send') non verifica vendibilità. customer_update_order_full può aggiungere/aumentare righe senza tale verifica.
3. can_view_seller_catalogue non controlla can_sell; la RLS prodotti lo usa. Nascondere menu non basta.
4. shopping_link_b2b_source tratta assenza di rapporto operativo come non-B2B acquistabile: non cambiare genericamente relation_is_operational, con rischio riclassificazione/perdita pregresso.
5. Decisioni e ordini non condividono lock venditore; lock richiesta→azienda e Lista→ordine richiedono ordine unico anti-deadlock.
6. platform_audit_log ammette INSERT dal team; audit_events ha policy INSERT permissive. I log attuali non garantiscono da soli autenticità delle nuove decisioni; policy permissive si combinano con OR.
7. Danea live: supplier_cancel_order può annullare esportati; decide_order_change può azzerare presa visione; danea_requeue_order azzera marker export. customer_update_order_full e alcune azioni manage_purchase_order non hanno guard export esplicita. Discrepanze rispetto a «scaricati intoccabili», non corrette ora.
8. Export legge candidati/registra in chiamate separate: rischio di modifica intermedia da collaudare isolatamente, non incidente osservato. Scaricato non prova importazione Danea.

## 4. Modello proposto senza stati duplicati
Un solo stato autorizzativo autorevole su companies: sell_authorization_status = non_autorizzato/attivo/sospeso/revocato. company_sell_requests resta la pratica.
Stato visualizzato: Sospeso → Revocato → Attivo → Richiesta in attesa → Rifiutato → Non autorizzato. Attesa/rifiuto derivati dalla pratica più recente solo senza autorizzazione attiva/blocco. Annullamento solo storico.
can_sell resta il valore effettivo per compatibilità, mantenuto coerente nella stessa transazione: vero solo con autorizzazione attiva. Spegnimento volontario mantiene la regola attuale: Non autorizzato, nuova approvazione per riaccendere; mai riaccensione da una vecchia pratica.

| Transizione | Chi e condizioni |
|---|---|
| Non autorizzato/Rifiutato → Attesa | Admin aziendale, nessun blocco, una pendente |
| Attesa → Attivo/Rifiutato | Super attivo, lock e rilettura pratica |
| Attesa → Non autorizzato | Admin annulla, storico conservato |
| Attivo → Non autorizzato | Admin spegne, normale blocco ultimo profilo |
| Attivo → Sospeso/Revocato | Solo super, motivo obbligatorio |
| Sospeso → Attivo/Revocato | Solo super, conferma e valutazione |
| Revocato → Attivo | Solo super, Autorizza nuovamente e nuova valutazione |

Sospeso/Revocato non possono richiedere attivazione ordinaria né usare vecchie approvazioni. Riattivazione conserva prodotti/listini/rapporti: ricontrollare pubblicazione, disponibilità, listino cliente, U.M. e rapporto operativo; non riattivare rapporti, postazioni/prodotti disabilitati per altri motivi. Motivo pubblico distinto da note interne.

## 5. Ordini preesistenti e Danea
Confine: primo invio persistito, non bozza né presa visione. Lock DB stabilisce se invio precede blocco: non basta confrontare timestamp. Storico/versione identifica ogni ciclo di blocco.

| Situazione | Regola durante blocco |
|---|---|
| Bozza, anche precedente | Consultabile; niente primo invio/incrementi verso venditore bloccato; annullamento volontario/cambio altro fornitore secondo regole attuali |
| Inviato non visto | Completamento; niente nuove righe/aumenti/cambio articolo o U.M.; riduzioni e correzioni logistiche se guard attuali lo permettono e non esportato |
| Visto non preparato | Non è uno stato di accettazione distinto; preparazione consentita; modifica senza nuovi impegni |
| Preparazione in corso/pronto | Assegnazione/conferme/completamento senza ricalcolare ordine, quantità/U.M./peso separati |
| Spedito/parzialmente consegnato | Spedito non è stato ordine persistito: usare consegne dichiarate; consentire ricezione/contestazioni/carico pregresso |
| Consegnato/chiuso | Storico/regolarizzazione, niente riapertura per nuova vendita |
| Annullato | Storico, nessuna riattivazione automatica |
| Documenti emessi | Conservati; Danea master, nessuna rigenerazione/annullamento automatico |
| Attesa scarico Danea | Pregresso scaricabile con postazione valida e regole attuali, senza richiedere Vendo attivo oggi |
| Già scaricato | Ordine/marker immutabili; riscarico storico o legacy senza ricalcolo; regolarizzazione separata |

Stati ordine reali: bozza/inviato/parzialmente_consegnato/consegnato/chiuso/annullato. Presa visione è seen_by_supplier_at; preparazione usa righe pending/confirmed/missing e ready_at. Non inventare stati accettato/spedito.
Confrontare incrementi per riga/articolo/U.M. fotografata, non sommare cassette/kg o equivalenti stock NULL. Peso effettivo/eccedenze non sono automaticamente aumenti dell’ordine: passano da accettazione/contestazione consegna esplicita.
Compratore vede pregresso e avviso neutro di indisponibilità per nuovi ordini; nessuna nota riservata. Catalogo non acquistabile nascosto senza togliere documenti/snapshot. Compro resta indipendente.

## 6. Schermate
Aziende: Compro/Vendo, ultima decisione, filtri. Dettaglio azienda: autorizzazione, P.IVA, data/attore/motivo pubblico e storico; lettura per ID, non utenti associati per nome.
Richieste Vendo resta coda delle pratiche, collegata al dettaglio. Comandi secondo transizioni, conferma con azienda/conseguenze; motivo obbligatorio sospensione/revoca.
Profilo azienda: sei stati, messaggi comprensibili, nessuna richiesta/riattivazione da Sospeso/Revocato; Compro utilizzabile se attivo. Anche con entrambi falsi per blocco amministrativo restano profilo/pregresso.

## 7. Piano tecnico A–D
File proposti, NON modificati. Prima di ogni fase: elenco definitivo/SQL e approvazione dedicata. Non modificare migrazioni applicate, schema Drizzle o tipi generati a mano.

### A — Database e sicurezza
File: nuova .lovable/sql/sell-authorization.proposed.sql, futura migrazione generata; nuovi src/lib/sell-authorization.functions.ts e test; sell-request.functions.ts, sell-request-policy.ts/test; AGENTS.md e src/lib/AGENTS.md. Tipi solo aggiornamento automatico.
DB: stato/versione/data/motivo pubblico su companies; eventuali note in oggetto separato senza lettura aziende/partner. RPC manage_company_sell_authorization e letture sicure; aggiornare set_company_capabilities/register_company/request/cancel/decide e guard.
Adeguare companies_capability_required: entrambi falsi SOLO per sospeso/revocato amministrativo; admin non spegne ultimo profilo. Trigger protegge anche UPDATE diretti a stato/marker; writer postgres+contesto, RPC DEFINER search_path=public, super da auth.uid(), target ID non autorizzativo. Controlli atomici iniziali/finali owner/privilegi/trigger; GRANT/REVOKE/RLS nuovi oggetti.
Nuovo controllo assert_seller_accepts_new_orders e guard creazione/primo invio/righe/cambio venditore: generate_supplier_order, close_shopping_list, create_purchase_orders_from_list, manage_purchase_order, update_draft_order, change_draft_supplier, customer_update_order_full e modifica richiesta. Catalogo usa stato effettivo; pregresso separato. No fallback B2B→manuale per blocco.
Lock comune venditore; ordine compatibile Lista→ordine e danea_orders→ordine, multi-venditori ordinati, rilettura dopo attesa, idempotenza; dopo prima scrittura errori solo rollback totale.
Audit autorevole platform_audit_log protetto per azioni Vendo, evento prima/dopo/motivo/attore/data; audit_events solo riferimento pubblico. Nessuna nota nel JSON leggibile dal team intero; impedire INSERT falsi e alterazioni.
Esistenti: backfill futuro can_sell=true→Attivo per compatibilità senza inventare approvazioni storiche; false→Non autorizzato, pratiche conservate. Nessuna riaccensione da vecchie approvazioni. Anche backfill richiede approvazione esplicita.
Rischi: compatibilità pubblicato/anteprima, lock, ultimo profilo, Danea. Prove isolate/rollback con ruoli reali: transizioni, bypass, super inattivo/non-super, flag falso, concorrenza ordine/sospensione/decisione, U.M., Compro e conservazione.
Gate: SQL integrale approvato, inventario RPC/trigger completo, discrepanze Danea risolte o sottofase separata approvata prima di certificare la protezione.

### B — Interfaccia amministratore
File: nuovi src/components/platform/sell-authorization-mockup.tsx, sell-authorization-panel.tsx, sell-authorization-dialog.tsx; src/routes/piattaforma.aziende.tsx, piattaforma.aziende.$aziendaId.tsx, piattaforma.richieste-vendo.tsx; src/lib/platform.functions.ts.
DB: lettura autorizzazione/richieste/audit per ID; decisioni context.supabase→RPC, mai client privilegiato per scritture ordinarie. Mockup prima, collegamento dopo.
Rischi: dati obsoleti, doppio clic, note riservate. Esistenti: nessuna azione automatica. Prove desktop/tablet/telefono, conferme/motivo, conflitti/cache. Gate: mockup approvato e A collaudata.

### C — Interfaccia azienda
File: src/components/company/company-profile.tsx, src/hooks/use-identity.ts, src/routes/_authenticated/onboarding.tsx, src/lib/sell-request.functions.ts; src/components/sales/received-orders-panel.tsx, src/lib/purchase.functions.ts, purchase-external.functions.ts, shopping-list.functions.ts per errori/pregresso; ulteriori schermate solo con elenco approvato.
DB: proiezione pubblica, catalogo/vendibilità separati da accesso ordini/consegne. Rischio: nascondere tutto Vendo impedisce completamento; non disattivare companies.status. Esistenti: dati conservati, Compro invariato.
Prove: sei stati, entrambi falsi ammessi per blocco, note non esposte, bozza non inviabile/pregresso completabile. Gate: mockup approvato, flusso isolato completo; Danea separatamente autorizzato.

### D — Notifiche e collaudo
File futuri: src/lib/platform-notifications.functions.ts, src/components/platform/platform-notification-bell.tsx/test, platform-shell.tsx; sell-request-email.server.ts, sell-request-policy.ts/test; modelli email nuovi sospensione/riattivazione/revoca/nuova autorizzazione e email-templates/registry.ts. Campanella demo conservata; schema eventi/letture/outbox in proposta separata.
Eventi: nuova richiesta→notifica piattaforma+email super futura; annullamento→notifica piattaforma; approvazione/rifiuto/sospensione/riattivazione/revoca/nuova autorizzazione→storico+notifica piattaforma+email azienda futura. Permessi destinatari; letto personale non cambia decisione. Mai notifiche clienti.
Rischi: duplicati/replay test/esito email sconosciuto. Prenotazione e chiave evento+destinatario; fallito certo/accettato/sconosciuto distinti. Esistenti: email bloccate e niente replay automatico.
Prove: sicurezza ruolo/azienda, un evento per decisione, regressioni ordini/preparazione/carico, prezzi storico/legacy Danea. Solo ambiente isolato o rollback verificato; niente Trevi/3 EMME o endpoint reali senza autorizzazione.
Gate: approvazione distinta notifiche reali/email/pubblicazione, nessuna abilitazione implicita.

## 8. Decisioni residue e limiti
Confermare: regola attuale spegnimento volontario→nuova approvazione; backfill conservativo; note solo super; piano separato/sottofase esplicita per discrepanze Danea.
Prima del SQL occorre completare lettura integrale overload consegne/carico/external_* e trigger indiretti: la matrice è proposta, non certificazione end-to-end. Le principali definizioni autorizzazioni/ordini/Danea sono state lette live, senza chiamare gli indirizzi Danea.
Futura sospensione completa e corrispondenze P.IVA/CF fuori A–D: verifica manuale/privacy, niente liste rischio o blocco per sola coincidenza. P.IVA normalizzata già unica; CF senza indice analogo rilevato.

Stop: nessuna implementazione avviata; approvazione limitata alla fase scelta, non abilita email, prove reali o pubblicazione.
