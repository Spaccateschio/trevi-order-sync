# Collaboratori — Fase 2 ridotta, solo piano

Solo piano; niente modifiche applicative/database, assegnazioni, prove, email o pubblicazione. Anteprima invariata; fasi approvate separatamente.

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

## 4. C — Trevi Fruit, ruoli fissi proposti

Enum app_role: aggiungere compratore/magazziniere/preparatore in commit separato; assegnare solo dopo protezioni D complete. Titolare non è un ruolo enum.

| Ruolo | Pagine | Operazioni |
|---|---|---|
| Compratore | Lista, Ordini fornitori, Fornitori/Catalogo; Inventario/Fabbisogno/Prodotti in lettura | Quantità/U.M./assegnazioni, conferma Lista, bozze/modifiche/invio B2B e non-B2B, stampa. Nessuna eccezione fornitore, annullamento documento o Carico. |
| Magazziniere | Inventario, Ricezione/Carico, Prodotti in lettura | Avvio ordinario/completo, conteggio/correzione/riapertura/chiusura/stampa; ricezione/contestazione/risoluzione/carico/conferma. Nessuna configurazione U.M./confezioni/zone, rettifica manuale o riconciliazione autonoma. |
| Preparatore | Preparazione | Assegnazione, quantità/pesi/conferma/mancante/correzione consentita, pronto/storico/stampa; vincoli Danea invariati. Nessuna presa visione commerciale, annullamento o dichiarazione consegna. |

Account/home/navigazione limitata alle appartenenze attive comuni; niente amministrazione, Danea o trasporti ai nuovi soli. Prezzi nascosti rinviati: documenti mantengono campi attuali. Compratore può preparare quota diretta ma AD resta admin/operatore: concessione aggiuntiva da approvare senza allargare helper comune.

## 5. D — Protezioni mirate

94 funzioni live richiamano membership, incluse indirette/trigger; inventario dettagliato in chat. Nessuna certificazione end-to-end.

Helper comuni invariati; nuovi controlli fissi per acquisti/inventario/preparazione. Vecchi: risultato precedente OR diritto nuovo. Soli nuovi: niente membership indiscriminata. Proteggere policy originali, vecchie RPC, server privilegiati, immagini e stampa; grant helper invariati.

Preparazione: nuove condizioni in 2 RPC/3 policy e controlli assegnatario; predicato attuale invariato. Vecchi utenti vedono i nuovi assegnatari necessari alla collaborazione.

**Blocchi:** inventory_location_stock è authenticated/definer senza controllo aziendale; fix completo richiede eccezione di sicurezza approvata, alternativa solo nuovi lascia rischio vecchio. RLS tecniche Danea devono negare nuovi senza cambiare postazioni/export; autorizzazione dei soli controlli lettura necessaria. Archivio Lista via dati operativi minimi. Fallback foto/service/notifiche coperti; nuovi senza notifiche generiche se non classificabili.

| Combinazione | Esito |
|---|---|
| operatore+preparatore | Vecchi accessi + Preparazione già normalmente ammessa. |
| operatore+magazziniere | Vecchi accessi + operazioni M mancanti, avvio/chiusura inventario inclusi. |
| amministratore+compratore | Admin invariato salvo titolare; nessuna proprietà da C. |
| P / M / C soli | Soltanto rispettivamente Preparazione / Inventario-Carico / Acquisti, più bootstrap. |

## 6. File e migrazioni

Nuove migrazioni via strumento ufficiale: ownership/audit; inviti; enum separato; restrizioni per area. Tipi rigenerati, nessuna vecchia migrazione riscritta.
Nuovi moduli src/lib/company-collaborators*, pagina src/routes/_authenticated/collaboratori.tsx, invito src/routes/collaboratore-invito.$token.tsx, componenti company-collaborators, template email e test adiacenti/integrativi.
Candidati esistenti: registro email, identità/navigazione/app-shell; pagine e funzioni acquisti/inventario/preparazione e immagini. Elenco esecutivo esatto prima di ogni fase; mockup, layout auth gestito, export Danea e dati invariati.

## 7. Test e collaudo

Non eseguiti oggi. Solo utenti dedicati 3 EMME e sessioni reali, dopo autorizzazione; niente Trevi/invio fornitori. Preparazione richiede dataset/capacità venditore autorizzati separatamente.
Baseline vecchi: uguaglianza menu/URL/righe/RPC/dinieghi/effetti salvo titolare; sei combinazioni, nuovi insieme, vecchi misti, inattivi/cross-azienda. Owner/ultimo admin/REST, inviti e revoche/concorrenza/replay, rollback audit, nessun DELETE. Dopo revoca nuove operazioni negate anche con sessione aperta; foto già firmate durano 600s. SQL privilegiato non è collaudo reale.

## 8. Sicurezza esistente — non correggere

Invio email: admin/stato/scadenza mancanti, rischio reinvii da membri; minimo controllo sull'azienda riga/idempotenza. Token email: hash non confrontato prima invio, non significa token inventato accettabile; minimo SHA-256/confronto, no token in log/chiavi. Piattaforma: membership non sezione, minimo diritti handler/RLS e super per team/ricerca. Audit: rettifica precedente rapporto, seconda policy RESTRICTIVE/AND; authenticated/anon senza INSERT, oggi rischio REST bloccato. Mantenere grant revocato e audit fidato da RPC. Nessun abuso dinamico provato.

## 9. Trasferimento proprietà — solo proposta

Riautenticazione/consenso titolare, destinatario autenticato per UUID e membro attivo stessa azienda; richiesta monouso/scadenza e accettazione. Lock/transazione unica: autorizzazioni ricontrollate, nuovo admin, ownership, audit; mai stato finale senza titolare attivo. Vecchio resta admin salvo decisione distinta. Recupero indisponibilità separato, non da normale admin. Non sviluppare ora.

## 10. Fasi autorizzabili

1. Verifica Trevi e decisione blocco giacenza, senza assegnazioni.
2. A proprietà/storico/protezioni; inserimento proprietà solo con conferma.
3. B inviti/collaboratori, inizialmente ruoli esistenti.
4. C enum + D controlli per area, senza assegnazioni anticipate.
5. Collaudo 3 EMME e rapporto prove; assegnazioni soltanto confermate.

Fermarsi ora: nessuna implementazione o pubblicazione.
