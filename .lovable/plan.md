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

## 2. A/B — Struttura tecnica proposta

Tutte le nuove tabelle: CREATE → GRANT minimo → ENABLE RLS → POLICY nella stessa migrazione. Letture della stessa azienda autorizzata; scritture solo procedure; service_role privilegi necessari; niente anon, FK auth.users nuove, INSERT di colonne generate o cancellazioni appartenenze.

| Tabella | Campi e vincoli |
|---|---|
| company_ownerships | company_id uuid PK/FK RESTRICT, member_id uuid NOT NULL UNIQUE; FK composta verso membership azienda+id; assigned_by uuid, assigned_at timestamptz default now(), reason text obbligatori. Nessun inserimento automatico. |
| company_collaboration_events | id uuid PK default gen_random_uuid(), company_id/actor_user_id/request_id uuid obbligatori, target_member_id/invitation_id uuid nullable, action text, before_data/after_data jsonb, created_at timestamptz default now(); unicità azienda+request_id; append-only, niente token. |
| company_collaborator_invitations | id/company_id uuid, email_normalized text, collaborator_name text nullable, token_hash text UNIQUE SHA-256/64 caratteri, proposed_roles app_role[], status text default in_attesa, expires_at timestamptz, invited_by uuid, accepted_by uuid nullable, date e revision bigint default 1. Ruoli non vuoti/senza duplicati/mai piattaforma; unicità parziale azienda+email in attesa. |

company_members: nome aziendale nullable e versione con default; nessun cambio identificativi. Ruoli restano in company_member_roles. Indici azienda+stato, azienda+appartenenza, hash; FK RESTRICT; scadenze in procedure, non CHECK con now().

Funzioni SECURITY DEFINER/search_path public: is_company_owner, get_company_collaborators, manage_company_collaborator, bootstrap assign_verified_company_owner controllato, create/accept/revoke/resend_collaborator_invitation. Autore da auth.uid(), azienda dalle risorse autorizzate; EXECUTE minimo, niente PUBLIC/anon alle scritture.

### Protezioni titolare
- Titolare sempre appartenenza attiva e amministratore; impossibili declassamento, disattivazione, cambio identità/azienda o rimozione ordinari.
- Solo titolare gestisce ruoli/stato di altri amministratori, anche multiprofilo; amministratori non titolari gestiscono soltanto non-admin, senza elevarli.
- Ultimo amministratore attivo protetto; lock aziendale comune, autorizzazione riletta dopo lock, versioni/idempotenza, vincoli finali differibili. Audit atomico: errore implica rollback.
- Proteggere anche policy company_members_insert_admin/update_admin e company_member_roles_insert_admin/delete_admin: nessun bypass REST. DELETE membership vietato; CASCADE ruoli non usato.
- Aziende senza titolare verificato: niente assegnazione/blocco silenzioso. Nuove regole gestione entrano soltanto con inizializzazione esplicitamente approvata; altre aziende conservano il precedente comportamento, senza motore di permessi.

### Inviti e pagina reale
- Token server casuale ≥256 bit; soltanto hash persistito, segreto transitorio per email, niente token/URL nei log o code in chiaro. Email e ruoli dal record verificato.
- Accettazione autenticata, email confermata confrontata con invito. Sotto lock rilegge hash/stato/scadenza/revisione/autorità invitante; invito admin solo titolare ancora autorizzato.
- Membership attiva: niente downgrade/sostituzione implicita. Inattiva: invito non riattiva. Disattivazione invalida inviti incompatibili; riattivazione solo esplicita. Reinvio ruota token.
- Email e commit non atomici: fallimento lascia invito pendente, mai membro attivato.
- /collaboratori reale: nome/email, ruoli combinabili, stato, invito, storico; anteprima invariata. /collaboratore-invito/$token pubblico con informazioni minime; azione solo autenticata.

## 4. C — Ruoli fissi proposti

Aggiungere `compratore`, `magazziniere`, `preparatore` a app_role, in migrazione separata; assegnabili soltanto dopo protezioni D complete. Non aggiungere un ruolo enum titolare.

| Ruolo | Pagine | Operazioni nuove consentite |
|---|---|---|
| Compratore | Lista, Ordini fornitori, Fornitori e Catalogo; Inventario/Fabbisogno e Prodotti in lettura | Quantità/U.M./assegnazioni, conferma Lista, bozze ordine e modifiche, invio B2B/non-B2B, stampa. Tutti i fornitori operativamente acquistabili, nessuna eccezione fornitore. |
| Magazziniere | Inventario, Ricezione/Carico, Prodotti in lettura | Avvio inventario ordinario/completo, conteggio, correzione/riapertura conteggio, chiusura inventario e stampa; verifica ricezione, contestazione/risoluzione, carico e conferma. Non configura zone, U.M., confezioni o conversioni; niente rettifiche manuali/riconciliazioni autonome. |
| Preparatore | Preparazione | Assegnazione, quantità/pesi, conferma/mancante/correzione consentita, pronto, storico e stampa; vincoli Danea/preparazione invariati. Niente presa visione commerciale, annullamento ordine o dichiarazione consegna. |

Account, azienda selezionabile fra appartenenze attive, navigazione e home con soli collegamenti consentiti sono bootstrap comune. Nessuna amministrazione, Danea, Collegamenti commerciali o trasporti dai tre nuovi ruoli da soli. Prezzi nascosti non progettati: documenti autorizzati mantengono i campi esistenti, senza promessa di occultamento.

**Acquisti diretti:** nel perimetro iniziale il Compratore può preparare quote, ma non generare/confermare AD né registrare acquisto reale; il flusso corrente ha gate admin/operatore. Decisione aggiuntiva necessaria per abilitare AD al Compratore, senza estendere l'helper comune. Non concedere annullamento ordine/Lista né eliminazione documento; rimozione riga/assegnazione è modifica della Lista, con vincoli attuali.

## 5. D — Controlli mirati

Inventario live: 94 funzioni contengono is_company_member (inclusi helper, trigger e gate ulteriori), 140 policy/82 tabelle. Rapporto in chat: elenco nominativo e restrizione proposta; non è certificazione end-to-end.

Non cambiare is_company_member/is_company_admin/has_company_role né significato globale di is_order_supplier, can_declare_on_order, can_view_seller_catalogue e helper proprietari/relazioni. Pochi predicati fissi aggiuntivi per acquisti, inventario/carico, preparazione e letture; nessuna matrice personalizzabile.

Ogni ingresso mantiene il risultato precedente per vecchi ruoli OR il diritto espresso nuovo. Ai soli nuovi non si applica membership indiscriminata. Aggiornare policy permissive originali (nuova policy permissiva non restringe OR) e vecchie RPC ancora chiamabili. SECURITY DEFINER, server privilegiato, immagini e stampa diretta richiedono copertura. Non riaprire grant helper: has_company_role non è client-callable.

Preparazione: predicato nuovo nelle 2 RPC/3 policy, controlli assegnatario coerenti; preparation_actor_allowed invariato. Vecchi utenti vedono anche i nuovi assegnatari, espansione dati necessaria alla collaborazione.

### Blocchi da decidere prima
- inventory_location_stock(uuid,uuid): EXECUTE authenticated, SECURITY DEFINER, nessun controllo identità/azienda. Correzione completa richiede eccezione di sicurezza alla compatibilità; alternativa guardia solo sui nuovi lascia rischio vecchio esplicito. Nessuna assegnazione nuova finché coperta.
- RLS tabelle tecniche Danea devono negare letture ai soli nuovi; postazioni/service/export invariati. Richiede approvazione esplicita dei soli controlli di lettura. Archivio Liste tramite proiezione operativa dedicata, niente log/configurazioni.
- Fallback immagini privilegiato, notifiche e operazioni service coperti prima rilascio. Senza classificazione notifiche affidabile, soli nuovi non ricevono notifiche aziendali generiche.

| Combinazione | Esito |
|---|---|
| operatore+preparatore | Accessi operatore + Preparazione, già normalmente consentita. |
| operatore+magazziniere | Accessi operatore + operazioni M mancanti, inclusi avvio/chiusura inventario. |
| amministratore+compratore | Accessi admin, eccezione titolare; C non dà proprietà. |
| preparatore solo | Preparazione e bootstrap. |
| magazziniere solo | Inventario/Carico e letture correlate. |
| compratore solo | Acquisti e letture correlate, non Carico. |

## 6. File e migrazioni

Nuove migrazioni: ownership/audit/guardie; inviti; enum (commit separato); restrizioni per area. Nomi/sequenza dallo strumento ufficiale migration; tipi rigenerati dopo schema, vecchie migrazioni non riscritte.

Nuovi: src/lib/company-collaborators.ts, company-collaborators.functions.ts, company-collaborator-email.functions.ts; src/components/company-collaborators/collaborators-page.tsx; src/routes/_authenticated/collaboratori.tsx; src/routes/collaboratore-invito.$token.tsx; src/lib/email-templates/invito-collaboratore.tsx; test adiacenti e tests/security/company-collaborators.integration.test.ts.

Esistenti candidati: email-templates/registry.ts, use-identity.ts, navigation.ts, app-shell.tsx; leaf acquisti/operativo e componenti preparazione/inventario/shopping per azioni; inventory.functions.ts, inventory-count.functions.ts, inventory-cycle.functions.ts, inventory-evaluation.functions.ts, shopping-list.functions.ts, order-generation.functions.ts, purchase.functions.ts, preparation.functions.ts, catalog.functions.ts, product-images.functions.ts.

Prima di ogni fase: elenco esecutivo esatto dei file/componenti/test per approvazione. Non toccare mockup, layout autenticato gestito, client generati, export Danea o dati operativi. Metadati propri delle nuove pagine.

## 7. Test e collaudo successivo

Nessun test operativo oggi. Dopo autorizzazione: utenti dedicati 3 EMME, email verificate/sessioni vere authenticated; nessuna prova Trevi o invio fornitori. Preparazione venditore richiede capacità/dataset venditore di prova approvati separatamente se 3 EMME resta solo acquirente.

Baseline vecchi da soli: uguaglianza prima/dopo di menu, URL, righe, RPC/dinieghi/effetti, salvo titolare. Tutte le 6 combinazioni, nuovi insieme, vecchi misti/inattivi/cross-azienda. Test owner/ultimo admin/REST; inviti hash/scadenza/replay/email/invitante revocato/destinatario inattivo/ruoli manomessi. Concorrenza revoca/accettazione, audit fallito rollback, nessun DELETE. Vecchia sessione/secondo dispositivo: nuove chiamate dopo revoca negate; foto già firmate scadono dopo 600s, dati già consegnati non ritirati. SQL privilegiato non conta come collaudo reale.

## 8. Quattro rischi — sola analisi

- Invio email: membro venditore non admin può tentare invio al destinatario registrato. Minimo admin sull'azienda riga, stato/scadenza e idempotenza server; nessun abuso provato.
- Token email: link non confrontato con hash; non equivale ad accettazione di token inventato. Minimo SHA-256/formato/confronto prima invio, niente token nelle chiavi registrate.
- Piattaforma: team con sezione nessuno può tentare letture privilegiate. Minimo permessi aziende/utenti/registro in handler e RLS, team/ricerca super-only, statistiche segmentate. Gestione team DB già super-only.
- Audit: precedente rapporto rettificato: audit_share_events_rpc_only è RESTRICTIVE/AND, non permissiva/OR. authenticated/anon oggi NON hanno INSERT; nessuna falsificazione REST permessa da quei grant. Mantenere grant revocato ed eventi fidati da RPC; policy larga pericolosa se riaperta. Non correggere ora.

## 9. Trasferimento proprietà — proposta, non sviluppo

Riautenticazione titolare attuale, consenso espresso, destinatario autenticato per UUID e già membro attivo della stessa azienda; richiesta monouso/scadenza e accettazione destinatario. Unica transazione con lock: ricontrollo autorità, ruolo admin del nuovo, cambio ownership, storico atomico; vecchio resta amministratore salvo decisione distinta. Mai stato finale senza owner attivo; richieste pendenti incompatibili invalidate. Recupero per indisponibilità separato e documentato, mai da normale admin. Nessun trasferimento sviluppato ora.

## 10. Ordine autorizzabile

1. Verifica sessione Trevi separata e decisione sul blocco giacenza; nessuna assegnazione.
2. A ownership/storico/protezioni, senza inserire proprietà senza conferma.
3. B collaboratori e inviti, inizialmente soli ruoli esistenti autorizzati.
4. C enum + D controlli mirati per area, nessuna assegnazione anticipata.
5. Collaudo dedicato 3 EMME e rapporto prove; attivazione/assegnazioni solo con conferma.

Fermarsi ora e attendere autorizzazione; nessuna pubblicazione.
