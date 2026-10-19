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

## 2. A/B — Titolare e collaboratori reali

### Tabelle (dettagli tecnici)
| Tabella | Campi principali e vincoli |
|---|---|
| company_ownerships | company_id uuid PK/FK RESTRICT; member_id uuid NOT NULL UNIQUE/FK composta azienda+membership; assigned_by uuid, assigned_at timestamptz default now(), reason text obbligatori. Nessun inserimento automatico. |
| company_collaboration_events | id uuid PK, company_id/actor_user_id/request_id uuid, action text, created_at timestamptz; target_member_id/invitation_id uuid e before_data/after_data jsonb nullable. Unicità azienda+request_id, append-only, niente token. |
| company_collaborator_invitations | id/company_id uuid, email_normalized text, nome nullable, token_hash SHA-256 UNIQUE, proposed_roles app_role[], status text default in_attesa, expires_at timestamptz, invited_by uuid, accepted_by nullable, date, revision bigint default 1. Ruoli non vuoti/senza duplicati/mai piattaforma; unica email+azienda pendente. |

Nome aziendale nullable/versione con default su company_members; nessun cambio identificativi. Indici azienda+stato/appartenenza e hash, FK RESTRICT, nessun INSERT generato. CREATE→GRANT→RLS→POLICY nella stessa migrazione: letture aziendali autorizzate, scritture solo RPC, niente anon; privilegi service necessari. Scadenze in procedure, non CHECK temporali.

Funzioni SECURITY DEFINER/search_path public: is_company_owner, get_company_collaborators, manage_company_collaborator; bootstrap proprietà controllato; create/accept/revoke/resend_collaborator_invitation. Auth.uid e risorse autorizzate, EXECUTE minimo.

### Regole
- Titolare attivo+admin intoccabile dalla gestione ordinaria. Solo titolare cambia ruoli/stato di amministratori, anche multiprofilo; admin non titolare gestisce soltanto non-admin. Ultimo admin protetto.
- Lock aziendale, autorizzazione riletta, versioni/idempotenza, vincoli finali e audit atomico. Proteggere anche policy scrittura membership/ruoli contro REST; DELETE membership vietato, CASCADE non usato.
- Aziende non inizializzate mantengono gestione precedente: nessun blocco o titolare automatico; nuove protezioni solo dopo assegnazione/rollout approvati.
- Token server ≥256 bit, solo hash persistito; email/ruoli dal record. Accettazione autenticata/email confermata; rilegge stato/scadenza/hash/autorità invitante. Invito admin solo titolare ancora autorizzato.
- Niente downgrade membership attiva né riattivazione di inattiva mediante invito. Revoca invalida inviti incompatibili; riattivazione esplicita. Reinvio ruota token.
- Invio email non atomico col commit: fallimento lascia invito pendente, nessun membro attivato; token mai nei log/code in chiaro.
- /collaboratori reale (nome/email/ruoli/stato/invito/storico), distinto da anteprima; /collaboratore-invito/$token pubblico minimo, accettazione solo autenticata.

## 4. C — Ruoli fissi proposti

Aggiungere `compratore`, `magazziniere`, `preparatore` a app_role, in migrazione separata; assegnabili soltanto dopo protezioni D complete. Non aggiungere un ruolo enum titolare.

| Ruolo | Pagine | Operazioni nuove consentite |
|---|---|---|
| Compratore | Lista, Ordini fornitori, Fornitori e Catalogo; Inventario/Fabbisogno e Prodotti in lettura | Quantità/U.M./assegnazioni, conferma Lista, bozze ordine e modifiche, invio B2B/non-B2B, stampa. Tutti i fornitori operativamente acquistabili, nessuna eccezione fornitore. |
| Magazziniere | Inventario, Ricezione/Carico, Prodotti in lettura | Avvio inventario ordinario/completo, conteggio, correzione/riapertura conteggio, chiusura inventario e stampa; verifica ricezione, contestazione/risoluzione, carico e conferma. Non configura zone, U.M., confezioni o conversioni; niente rettifiche manuali/riconciliazioni autonome. |
| Preparatore | Preparazione | Assegnazione, quantità/pesi, conferma/mancante/correzione consentita, pronto, storico e stampa; vincoli Danea/preparazione invariati. Niente presa visione commerciale, annullamento ordine o dichiarazione consegna. |

Account, azienda selezionabile fra appartenenze attive, navigazione e home con soli collegamenti consentiti sono bootstrap comune. Nessuna amministrazione, Danea, Collegamenti commerciali o trasporti dai tre nuovi ruoli da soli. Prezzi nascosti non progettati: documenti autorizzati mantengono i campi esistenti, senza promessa di occultamento.

**Acquisti diretti:** nel perimetro iniziale il Compratore può preparare quote, ma non generare/confermare AD né registrare acquisto reale; il flusso corrente ha gate admin/operatore. Decisione aggiuntiva necessaria per abilitare AD al Compratore, senza estendere l'helper comune. Non concedere annullamento ordine/Lista né eliminazione documento; rimozione riga/assegnazione è modifica della Lista, con vincoli attuali.

## 5. D — Protezioni mirate

Live: 94 funzioni con is_company_member inclusi helper/trigger/gate ulteriori; elenco nominativo e policy nel rapporto in chat. Non certificazione end-to-end.

Non cambiare is_company_member/is_company_admin/has_company_role o significato globale dei predicati ordine/catalogo/proprietari. Pochi helper fissi nuovi per acquisti, inventario/carico e preparazione. Ogni ingresso conserva risultato precedente per vecchi ruoli OR diritto nuovo; soli nuovi non ereditano membership indiscriminata. Modifiche puntuali a policy permissive originali e vecchie RPC; coprire SECURITY DEFINER/server privilegiati/immagini/stampa diretta. Non riaprire grant helper.

Preparazione: nuove condizioni in 2 RPC/3 policy e controlli assegnatario; predicato attuale invariato. Vecchi utenti vedono i nuovi assegnatari necessari alla collaborazione.

**Blocchi:** inventory_location_stock è authenticated/definer senza controllo aziendale; fix completo richiede eccezione di sicurezza approvata, alternativa solo nuovi lascia rischio vecchio. RLS tecniche Danea devono negare nuovi senza cambiare postazioni/export; autorizzazione dei soli controlli lettura necessaria. Archivio Lista via dati operativi minimi. Fallback foto/service/notifiche coperti; nuovi senza notifiche generiche se non classificabili.

| Combinazione | Esito |
|---|---|
| operatore+preparatore | Vecchi accessi + Preparazione già normalmente ammessa. |
| operatore+magazziniere | Vecchi accessi + operazioni M mancanti, avvio/chiusura inventario inclusi. |
| amministratore+compratore | Admin invariato salvo titolare; nessuna proprietà da C. |
| P / M / C soli | Soltanto rispettivamente Preparazione / Inventario-Carico / Acquisti, più bootstrap. |

## 6. File e migrazioni

Migrazioni nuove via strumento ufficiale: ownership/audit/guardie; inviti; enum in commit separato; restrizioni per area. Tipi rigenerati, vecchie migrazioni non riscritte.

Nuovi: src/lib/company-collaborators.ts, company-collaborators.functions.ts, company-collaborator-email.functions.ts; src/components/company-collaborators/collaborators-page.tsx; src/routes/_authenticated/collaboratori.tsx; src/routes/collaboratore-invito.$token.tsx; src/lib/email-templates/invito-collaboratore.tsx; test regole adiacenti/integrativi.

Candidati esistenti: registry email, use-identity, navigation, app-shell; leaf acquisti/operativo e componenti per controlli azioni; funzioni inventory/count/cycle/evaluation, shopping-list/order-generation/purchase/preparation/catalog/product-images. Elenco esecutivo esatto prima di ogni fase; niente mockup, layout auth gestito, client generati, export Danea o dati operativi. Metadati propri per nuove pagine.

## 7. Test e collaudo

Non eseguiti oggi. Solo utenti dedicati 3 EMME, email verificate/sessioni reali authenticated, dopo autorizzazione; nessuna prova Trevi/invio fornitori. Preparazione richiede capacità/dataset venditore di prova separatamente approvati se 3 EMME resta acquirente.

Baseline vecchi da soli: uguaglianza menu/URL/righe/RPC/dinieghi/effetti, salvo titolare. Sei combinazioni, nuovi insieme, vecchi misti/inattivi/cross-azienda. Owner/ultimo admin/REST; inviti hash/scadenza/replay/email/invitante revocato/destinatario inattivo/ruoli manomessi; concorrenza, audit fallito rollback, nessun DELETE. Nuove operazioni dopo revoca negate con sessione aperta; foto già firmate scadono in 600s e dati già consegnati non ritirati. SQL privilegiato non conta come collaudo.

## 8. Sicurezza esistente — non correggere

Invio email: admin/stato/scadenza mancanti, rischio reinvii da membri; minimo controllo sull'azienda riga/idempotenza. Token email: hash non confrontato prima invio, non significa token inventato accettabile; minimo SHA-256/confronto, no token in log/chiavi. Piattaforma: membership non sezione, minimo diritti handler/RLS e super per team/ricerca. Audit: rettifica precedente rapporto, seconda policy RESTRICTIVE/AND; authenticated/anon senza INSERT, oggi rischio REST bloccato. Mantenere grant revocato e audit fidato da RPC. Nessun abuso dinamico provato.

## 9. Trasferimento proprietà — proposta, non sviluppo

Riautenticazione titolare attuale, consenso espresso, destinatario autenticato per UUID e già membro attivo della stessa azienda; richiesta monouso/scadenza e accettazione destinatario. Unica transazione con lock: ricontrollo autorità, ruolo admin del nuovo, cambio ownership, storico atomico; vecchio resta amministratore salvo decisione distinta. Mai stato finale senza owner attivo; richieste pendenti incompatibili invalidate. Recupero per indisponibilità separato e documentato, mai da normale admin. Nessun trasferimento sviluppato ora.

## 10. Ordine autorizzabile

1. Verifica sessione Trevi separata e decisione sul blocco giacenza; nessuna assegnazione.
2. A ownership/storico/protezioni, senza inserire proprietà senza conferma.
3. B collaboratori e inviti, inizialmente soli ruoli esistenti autorizzati.
4. C enum + D controlli mirati per area, nessuna assegnazione anticipata.
5. Collaudo dedicato 3 EMME e rapporto prove; attivazione/assegnazioni solo con conferma.

Fermarsi ora e attendere autorizzazione; nessuna pubblicazione.
