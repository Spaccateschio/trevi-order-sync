# Collaboratori — Fase 2 ridotta, solo piano

Nessuna modifica applicativa, migrazione, assegnazione, utente di prova, email o pubblicazione è autorizzata da questo documento. Anteprima Collaboratori invariata. Le singole fasi richiedono autorizzazione separata.

## 1. Decisioni e verifiche
- Nessun motore generale dei permessi; rinviati personalizzazioni, divieti individuali, reparti, eccezioni fornitore, consolidamento, prezzi nascosti, modalità legacy/shadow/enforced.
- Vecchi ruoli da soli: accessi operativi identici, consentiti e negati. Eccezione espressamente confermata: solo titolare gestisce amministratori; titolare e ultimo amministratore protetti.
- Vecchio + nuovo: unione dei diritti; è consentito aggiungere diritti del nuovo ruolo, mai sottrarre quelli precedenti.
- Revoche persistenti nelle appartenenze/ruoli correnti; nuove operazioni dopo commit della revoca negate. Nessuna riattivazione tramite inviti vecchi, cache o onboarding; operazioni completate e informazioni già viste non ritirate.

**Identità verificata in sola lettura:** la sessione disponibile è stata validata dal servizio di autenticazione, senza aprire pagine che aggiornano il profilo.

| Azienda | Account e appartenenza | Riscontro |
|---|---|---|
| 3 EMME ROMA SRL | auth.users.id `b9db9303-4b9d-4135-a8d5-94bfb6fa5758`; appartenenza `49458c28-fb71-4875-ab7b-0ee74e25bb9c` | Sessione verificata, email verificata, azienda/appartenenza attive, solo amministratore. |
| trevi srl | Account candidato `0f00ea59-a549-4bcd-8dde-9bfc1a9a2781`; appartenenza `46dea20a-e1f4-473e-bf2a-a4663fc43b1d` | Azienda/appartenenza attive, solo amministratore; non è la sessione attuale. |

I due account sono distinti. Nessuna appartenenza incrociata rilevata. Per Trevi manca la verifica della sua sessione autenticata, concordata separatamente: nome/email non bastano. Nessuna proprietà assegnata; anche 3 EMME richiede conferma esplicita dell'assegnazione.

## 2. A — Titolare, gestione e storico

### Strutture proposte
- `company_ownerships`: `company_id uuid` PK/FK companies RESTRICT; `member_id uuid NOT NULL UNIQUE`; `assigned_by uuid NOT NULL`, `assigned_at timestamptz NOT NULL DEFAULT now()`, `reason text NOT NULL`. FK composta azienda+appartenenza; indice univoco aggiuntivo su company_members(company_id,id). Un titolare corrente; nessun inserimento automatico.
- `company_collaboration_events`: `id uuid` PK default gen_random_uuid(), `company_id uuid NOT NULL`, `actor_user_id uuid NOT NULL`, `target_member_id uuid NULL`, `invitation_id uuid NULL`, `action text NOT NULL`, `before_data/after_data jsonb NULL`, `request_id uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`. FK RESTRICT coerenti; unicità azienda+request_id; eventi minimizzati senza token.
- `company_members`: aggiunta facoltativa `collaborator_name text NULL` e versione non nulla con default; nome aziendale distinto dal profilo personale globale. Nessuna modifica di identificativi o cancellazione.

Ogni tabella pubblica: CREATE → GRANT minimo → ENABLE RLS → POLICY nella stessa migrazione. authenticated legge soltanto la propria azienda con autorizzazione pertinente; nessuna scrittura diretta delle nuove tabelle; service_role ha privilegi necessari; niente anon. Nessuna FK nuova verso auth.users e nessuna colonna generata negli INSERT/UPDATE.

### Funzioni e invarianti
- `is_company_owner`: auth.uid(), appartenenza attiva, proprietà della stessa azienda e amministratore; mai ownership ricavata da created_by.
- `get_company_collaborators`, `manage_company_collaborator`, `assign_verified_company_owner` (bootstrap controllato, non libero dal browser).
- Solo titolare può nominare, cambiare ruoli/stato o riattivare un amministratore, anche multiprofilo. Amministratore non titolare gestisce soltanto non-amministratori, senza elevarli.
- Titolare sempre attivo e amministratore; impossibili declassamento, rimozione, cambio identità/azienda e disattivazione ordinari. Almeno un amministratore attivo a fine transazione.
- Guardie database anche contro REST diretto: company_members_insert_admin/update_admin e company_member_roles_insert_admin/delete_admin non devono aggirare la procedura. Conservare il contratto operativo precedente, tranne l'eccezione titolare approvata.
- Tutte le mutazioni collaboratori condividono lock aziendale, rilegge autorizzazioni dopo il lock, versioni e idempotenza. Vincoli differibili per gli stati finali; modifiche+audit atomici, errore implica rollback.
- DELETE appartenenze vietato: la FK ruoli→appartenenza CASCADE resta inutilizzata; disattivazione tramite stato.

**Aziende senza titolare verificato:** non assegnarne uno e non bloccare silenziosamente amministratori esistenti. Le nuove protezioni di gestione vanno abilitate soltanto con assegnazione approvata e rollout esplicito; su aziende non inizializzate resta il comportamento precedente. Nessuna modalità generale di permessi.

## 3. B — Collaboratori e inviti reali

`company_collaborator_invitations`: id uuid PK; company_id uuid NOT NULL; email_normalized text NOT NULL; collaborator_name text NULL; token_hash text NOT NULL UNIQUE (SHA-256, 64 caratteri); proposed_roles app_role[] NOT NULL; status text NOT NULL DEFAULT 'in_attesa'; expires_at timestamptz NOT NULL; invited_by uuid NOT NULL; accepted_by uuid NULL; created_at timestamptz default now(), accepted_at/revoked_at timestamptz NULL; revision bigint default 1.

Vincoli: ruoli aziendali ammessi/non vuoti/senza duplicati, mai piattaforma; stati e date coerenti; FK RESTRICT; unicità parziale azienda+email per invito in attesa. Scadenza valutata in procedura, non CHECK con now(). Indici azienda+stato e hash.

Funzioni: create/accept/revoke/resend_collaborator_invitation, gestione stato/ruoli e lettura elenco. Tutte SECURITY DEFINER/search_path public; EXECUTE solo ruoli necessari, niente PUBLIC/anon alle scritture.

- Invito distinto dai clienti. Token casuale almeno 256 bit, server-side: persistita solo impronta, segreto transitorio solo per email, niente URL/token nei log.
- Email e ruoli dal record verificato, mai scelti all'accettazione dal browser. Email autenticata e confermata confrontata con invito.
- Sotto lock: hash, stato, scadenza, revisione e autorità corrente dell'invitante ricontrollati. Invito admin richiede titolare ancora autorizzato; invitante revocato non concede ruoli.
- Membership già attiva: niente downgrade o sostituzione automatica. Membership inattiva: invito non riattiva; serve riattivazione esplicita autorizzata. Revoca invalida inviti pendenti incompatibili.
- Reinvio ruota token; invio email e commit non sono atomici: fallimento invio lascia invito pendente, nessuna appartenenza attivata. Nessuna coda persistente con token in chiaro.
- Pagina reale `/collaboratori`, elenco, nome, email, ruoli combinabili, stato, invito e storico. Gestione amministratori riservata al titolare. Anteprima separata e invariata.
- Ingresso pubblico `/collaboratore-invito/$token`: informazioni minime; accettazione soltanto autenticata e con email verificata.

## 4. C — Ruoli fissi proposti

Aggiungere `compratore`, `magazziniere`, `preparatore` a app_role, in migrazione separata; assegnabili soltanto dopo protezioni D complete. Non aggiungere un ruolo enum titolare.

| Ruolo | Pagine | Operazioni nuove consentite |
|---|---|---|
| Compratore | Lista, Ordini fornitori, Fornitori e Catalogo; Inventario/Fabbisogno e Prodotti in lettura | Quantità/U.M./assegnazioni, conferma Lista, bozze ordine e modifiche, invio B2B/non-B2B, stampa. Tutti i fornitori operativamente acquistabili, nessuna eccezione fornitore. |
| Magazziniere | Inventario, Ricezione/Carico, Prodotti in lettura | Avvio inventario ordinario/completo, conteggio, correzione/riapertura conteggio, chiusura inventario e stampa; verifica ricezione, contestazione/risoluzione, carico e conferma. Non configura zone, U.M., confezioni o conversioni; niente rettifiche manuali/riconciliazioni autonome. |
| Preparatore | Preparazione | Assegnazione, quantità/pesi, conferma/mancante/correzione consentita, pronto, storico e stampa; vincoli Danea/preparazione invariati. Niente presa visione commerciale, annullamento ordine o dichiarazione consegna. |

Account, azienda selezionabile fra appartenenze attive, navigazione e home con soli collegamenti consentiti sono bootstrap comune. Nessuna amministrazione, Danea, Collegamenti commerciali o trasporti dai tre nuovi ruoli da soli. Prezzi nascosti non progettati: documenti autorizzati mantengono i campi esistenti, senza promessa di occultamento.

**Acquisti diretti:** nel perimetro iniziale il Compratore può preparare quote, ma non generare/confermare AD né registrare acquisto reale; il flusso corrente ha gate admin/operatore. Decisione aggiuntiva necessaria per abilitare AD al Compratore, senza estendere l'helper comune. Non concedere annullamento ordine/Lista né eliminazione documento; rimozione riga/assegnazione è modifica della Lista, con vincoli attuali.

## 5. D — Protezioni mirate e compatibilità

Inventario live: 94 funzioni contengono is_company_member, inclusi helper, trigger e funzioni con controlli ulteriori. Non sono 94 accessi incondizionati. L'elenco nominativo con restrizioni e le policy sono riportati nel rapporto in chat.

Nessuna modifica a is_company_member, is_company_admin, has_company_role, is_order_supplier, can_declare_on_order, can_view_seller_catalogue, owns_customer_record/owns_supplier_record, shares_company_with/shares_relation_with. Predicati fissi aggiuntivi, non motore: riconoscimento soli nuovi ruoli, acquisti, inventario/carico, preparazione e letture correlate.

Ogni ingresso applica il ramo precedente senza variazioni agli utenti con vecchi ruoli, OR diritto espresso nuovo. Ai soli ruoli nuovi non si applica la membership permissiva indiscriminata. Grant esistenti di helper non riaperti: has_company_role non è eseguibile da authenticated; usare lettura dedicata dei ruoli propri autorizzata.

Le policy permissive originali vanno aggiornate puntualmente: aggiungerne un'altra più stretta non chiude il precedente OR. SECURITY DEFINER deve controllare esplicitamente anche dove RLS è aggirata. Route/menu non sostituiscono database; proteggere anche vecchie RPC ancora eseguibili, immagini firmate e stampa tramite URL diretto.

Preparazione: nuovi predicati nelle 2 RPC e 3 policy; selettori/controlli assegnatario aggiungono preparatore coerentemente. Non cambiare preparation_actor_allowed globalmente. Utenti vecchi conservano azioni, ma vedono i nuovi assegnatari necessari alla collaborazione: espansione dati intenzionale da documentare.

### Blocchi prima dell'assegnazione
- `inventory_location_stock(uuid,uuid)` è EXECUTE authenticated, SECURITY DEFINER e senza controllo identità/azienda: può bypassare le nuove restrizioni. Consigliata correzione separata autorizzata; cambia un accesso indebito esistente e quindi è un'eccezione da approvare, non nascosta nella compatibilità. Alternativa limitata: guardia solo per utenti esclusivamente nuovi, lasciando il rischio precedente esplicitamente irrisolto. Nessuna assegnazione nuova finché scelta e copertura non validate.
- Le RLS su danea_archives/price_lists/sync_runs/sync_issues/product_danea_supplier_matches devono negare letture tecniche ai soli nuovi, lasciando postazioni/service e vecchi ruoli invariati. Sono controlli di lettura, non modifiche all'integrazione Danea; richiedono approvazione esplicita di quel perimetro. Archivio necessario alle Liste: sola lettura dei campi operativi tramite funzione dedicata, nessun log/configurazione.
- Fallback foto privilegiato, notifiche senza area riconoscibile e operazioni service vanno coperti prima del rilascio; senza classificazione affidabile, nuovi ruoli non ricevono notifiche aziendali generiche.

| Combinazione | Esito previsto |
|---|---|
| operatore + preparatore | Accessi operatore invariati + Preparazione (già normalmente consentita). |
| operatore + magazziniere | Accessi operatore + avvio/chiusura inventario e operazioni M mancanti. |
| amministratore + compratore | Accessi amministratore invariati, tranne eccezione gestione admin; C non conferisce proprietà. |
| preparatore solo | Solo Preparazione e bootstrap. |
| magazziniere solo | Solo Inventario/Carico e letture correlate. |
| compratore solo | Solo acquisti e letture correlate, non Carico. |

## 6. File e migrazioni previste

Migrazioni nuove, nomi logici (sequenza assegnata dallo strumento): ownership+audit+guardie; inviti; enum ruoli (commit separato); restrizioni RPC/policy per area. Applicazione soltanto via migration, mai vecchie migrazioni riscritte; rigenerazione tipi ufficiale dopo schema.

Nuovi: src/lib/company-collaborators.ts, company-collaborators.functions.ts, company-collaborator-email.functions.ts; src/components/company-collaborators/collaborators-page.tsx; src/routes/_authenticated/collaboratori.tsx; src/routes/collaboratore-invito.$token.tsx; src/lib/email-templates/invito-collaboratore.tsx; test regole adiacenti e tests/security/company-collaborators.integration.test.ts.

Esistenti candidati: src/lib/email-templates/registry.ts, src/hooks/use-identity.ts, src/lib/navigation.ts, src/components/app-shell.tsx; route acquisti delle aree autorizzate e operativo.tsx; componenti preparazione/inventario/shopping soltanto controlli azioni autorizzati; src/lib/inventory.functions.ts, inventory-count.functions.ts, inventory-cycle.functions.ts, inventory-evaluation.functions.ts, shopping-list.functions.ts, order-generation.functions.ts, purchase.functions.ts, preparation.functions.ts, catalog.functions.ts, product-images.functions.ts.

Nessuna modifica al mockup, layout autenticato gestito, client auth generati, esportazione Danea o dati operativi. Lista esecutiva di file/punti/componenti/test per ciascuna fase prima della sua approvazione; nessuna autorizzazione implicita su tutti i candidati.

## 7. Test e collaudo successivo

Nessun test operativo eseguito oggi. Dopo autorizzazione, utenti dedicati soltanto 3 EMME, email verificate, sessioni reali authenticated, nessuna prova Trevi o invio fornitori. Preparazione venditore non verificabile se 3 EMME resta solo acquirente: dataset e capacità di prova venditore richiedono approvazione distinta.

Baseline vecchi ruoli da soli: menu, URL, righe lette, RPC e effetti; uguaglianza prima/dopo anche per dinieghi, salvo titolare. Test separati di tutte le 6 combinazioni, 3 nuovi insieme, vecchi misti, inattivi e cross-azienda. Non contare SQL privilegiato come prova reale.

Owner/admin non owner: protezione owner, ultimo admin, promozione/declassamento/stato/REST. Inviti: hash errato, scaduto, revocato, replay, email diversa/non verificata, invitante revocato, destinatario inattivo, ruoli manomessi. Concorrenza doppia revoca/accettazione; audit fallito rollback; nessun DELETE e ruoli conservati. Revoca con vecchia sessione e secondo dispositivo: nuove chiamate negate; URL immagine già firmati restano validi fino alla loro scadenza (600s), dato già consegnato.

## 8. Quattro rischi esistenti — non correggere ora
- Email invito: membro venditore non admin può chiamare invio di invito leggibile al destinatario registrato. Minimo: admin verificato sull'azienda della riga, stato/scadenza, limiti/idempotenza server. Nessun invio abusivo provato.
- Token email: caller può inviare link diverso dall'impronta e variare chiave invio; non significa accettazione di token inventato (accettazione verifica hash). Minimo: SHA-256/formato/confronto prima invio, nessun token nella chiave registrata.
- Piattaforma: team con permesso sezione nessuno può tentare letture privilegiate. Minimo: aziende/utenti/registro verificati nei rispettivi handler e RLS; team/ricerca membri super-only; statistiche segmentate. Gestione team DB già super-only. Nessuna esposizione dinamica dimostrata.
- Audit: correzione del precedente rapporto: audit_share_events_rpc_only è RESTRICTIVE (AND), non seconda permissiva. authenticated e anon oggi NON hanno INSERT: nessuna falsificazione REST dimostrata/consentita da quei grant. Policy audit_insert_actor resta larga se il grant fosse riaperto. Minimo: mantenere INSERT client revocato, eventi fidati da RPC; eventuali eventi client separati e autorizzati. Nessun fix necessario da applicare in questa fase.

## 9. Trasferimento proprietà — proposta, non sviluppo

Riautenticazione titolare attuale, consenso espresso, destinatario autenticato per UUID e già membro attivo della stessa azienda; richiesta monouso/scadenza e accettazione destinatario. Unica transazione con lock: ricontrollo autorità, ruolo admin del nuovo, cambio ownership, storico atomico; vecchio resta amministratore salvo decisione distinta. Mai stato finale senza owner attivo; richieste pendenti incompatibili invalidate. Recupero per indisponibilità separato e documentato, mai da normale admin. Nessun trasferimento sviluppato ora.

## 10. Ordine autorizzabile

1. Verifica sessione Trevi separata e decisione sul blocco giacenza; nessuna assegnazione.
2. A ownership/storico/protezioni, senza inserire proprietà senza conferma.
3. B collaboratori e inviti, inizialmente soli ruoli esistenti autorizzati.
4. C enum + D controlli mirati per area, nessuna assegnazione anticipata.
5. Collaudo dedicato 3 EMME e rapporto prove; attivazione/assegnazioni solo con conferma.

Fermarsi ora e attendere autorizzazione; nessuna pubblicazione.
