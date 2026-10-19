# Fase 2 — Collaboratori aziendali: piano esecutivo della Fase 2A

## Perimetro e autorizzazione

Questo è un piano, non un’autorizzazione a implementare. La Fase 2 riguarda i **collaboratori aziendali**, non l’integrazione Preparazione–Danea.

Seguire la sequenza dell’allegato «AUTORIZZAZIONI E SEQUENZA OBBLIGATORIA»: prima 2A, poi B, C, D e collaudo, ciascuno con autorizzazione separata. Nessuna pubblicazione. Nessuna modifica a roadmap.md.

### Punto di partenza verificato

- Correzione inventory_location_stock applicata nella Fase 1.
- Sessione 3 EMME: 164 letture risultate invariate nel controllo precedente.
- Sessione Trevi verificata tramite servizio auth e appartenenza attiva: amministratore di trevi srl, nessuna appartenenza attiva a 3 EMME. Le 138 letture dirette della giacenza 3 EMME hanno restituito zero righe, comprese 23 con ubicazione NULL.
- Il caso del membro disattivato resta **non verificato**: non disattivare Andrea e non creare utenti senza autorizzazione.
- Nessuna proprietà è stata assegnata. L’accesso Trevi non autorizza l’assegnazione della proprietà di Trevi.

## 2A — Titolare e protezioni dei collaboratori

### Risultato previsto

1. Conservare il titolare in una tabella separata dai ruoli, senza attribuirlo automaticamente alle aziende esistenti.
2. Proteggere il titolare: appartenenza attiva e ruolo amministratore obbligatori; niente disattivazione, rimozione o declassamento ordinario.
3. Solo il titolare può aggiungere, togliere, disattivare o riattivare amministratori. Questa è l’eccezione alla compatibilità già concordata.
4. Impedire che un’azienda resti senza un amministratore attivo.
5. Disattivare/riattivare i collaboratori senza cancellare appartenenze o storico.
6. Registrare ogni modifica riuscita con autore, azienda, soggetto e stato precedente/successivo, nella stessa transazione.
7. Nessuna attivazione dei nuovi ruoli operativi in questa fase.

### Rischi da risolvere prima dell’applicazione

La lettura dello schema effettivo mostra policy che consentono agli amministratori INSERT/UPDATE diretti sulle appartenenze e INSERT/DELETE diretti sui ruoli. Esiste inoltre una FK dei ruoli con ON DELETE CASCADE sull’appartenenza. Non basta proteggere il solo nuovo pulsante: le protezioni devono coprire scritture dirette e funzioni esistenti. Nessuna FK viene eliminata; la cancellazione delle appartenenze viene impedita.

Le aziende senza titolare devono conservare gli accessi operativi precedenti, ma non permettere la gestione degli amministratori fino a inizializzazione esplicita. Non inizializzare Trevi né altre aziende in automatico.

## Dettagli tecnici della 2A

### Schema proposto — SQL delle fondazioni, NON applicato

Questo blocco definisce esclusivamente le fondazioni di lettura. **Non va applicato da solo come completamento della 2A**: prima serve la revisione e approvazione del SQL integrale delle protezioni, della gestione e dell’assegnazione, descritte sotto. Non contiene INSERT di proprietà.

```sql
CREATE TABLE public.company_ownerships (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  owner_member_id uuid NOT NULL UNIQUE REFERENCES public.company_members(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_ownerships TO authenticated;
GRANT ALL ON public.company_ownerships TO service_role;
ALTER TABLE public.company_ownerships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_collaboration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  subject_member_id uuid REFERENCES public.company_members(id) ON DELETE RESTRICT,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_collaboration_events TO authenticated;
GRANT ALL ON public.company_collaboration_events TO service_role;
ALTER TABLE public.company_collaboration_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_company_owner(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_ownerships o
    JOIN public.company_members m
      ON m.id = o.owner_member_id AND m.company_id = o.company_id
    JOIN public.company_member_roles r
      ON r.member_id = m.id AND r.company_id = m.company_id
    WHERE o.company_id = _company_id
      AND m.user_id = auth.uid()
      AND m.status = 'attivo'
      AND r.role = 'amministratore'::public.app_role
  );
$$;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated, service_role;

CREATE POLICY company_ownerships_read_member
ON public.company_ownerships FOR SELECT TO authenticated
USING (public.is_company_member(company_id));

CREATE POLICY company_collaboration_events_read_admin
ON public.company_collaboration_events FOR SELECT TO authenticated
USING (public.is_company_admin(company_id));
```

Le RLS usano gli helper aziendali esistenti, che verificano l’appartenenza attiva dell’utente autenticato. Non introdurre un get_user_company_id inesistente né assumere una sola appartenenza. Nessun dato sensibile accessibile ad anon; nessun INSERT/UPDATE/DELETE client sulle nuove tabelle.

### SQL integrale da completare prima di chiedere l’applicazione

- `get_company_collaborators`: lettura autenticata riservata agli amministratori; azienda e soggetti autorizzati nel DB, profili e ruoli separati, indicazione del titolare e registro.
- `manage_company_collaborator`: gestione della sola appartenenza e dei ruoli esistenti, controllo auth.uid(), attore attivo e amministratore, soggetto appartenente alla stessa azienda, esclusiva del titolare sugli amministratori, nessuna cancellazione dell’appartenenza.
- Trigger di protezione su `company_members`, `company_member_roles` e `company_ownerships`: identità dell’appartenenza immutabile, coerenza azienda–membro, titolare sempre attivo/amministratore, ultimo amministratore protetto, proprietà non trasferibile dalla gestione ordinaria.
- Copertura delle scritture dirette consentite dalle policy attuali e di ogni funzione esistente che modifica queste tabelle: inventario preciso dei chiamanti e proposta minima prima di alterare policy o grant.
- Lock comune per azienda acquisito **prima** dei lock sui membri/ruoli in tutti i percorsi interessati. Un trigger che acquisisce il lock dopo un precedente lock di riga non basta a certificare l’assenza di deadlock.
- Audit atomico anche per i percorsi legacy ammessi: niente eventi inseribili dal browser, niente duplicazione tra trigger e RPC, nessuna modifica parziale dopo un errore.
- Funzioni SECURITY DEFINER con search_path=public, REVOKE da PUBLIC/anon ed EXECUTE minimo; nessun permesso desunto da localStorage, metadati utente o company_id ricevuto senza verifica.
- Nessuna modifica agli helper operativi comuni per ampliare i ruoli: quella appartiene alla 2D.

**Punto di arresto:** presentare questo SQL completo e l’elenco definitivo dei chiamanti/file, quindi attendere autorizzazione. L’approvazione del presente piano non autorizza l’applicazione del solo blocco delle fondazioni né un SQL diverso non mostrato.

### Assegnazione del titolare: operazione distinta dalla migrazione

Solo dopo autorizzazione esplicita dell’assegnazione:

1. Ripristinare e verificare la sessione **3 EMME**, non usare la sessione Trevi attuale.
2. Verificare nuovamente identità, azienda, appartenenza attiva e ruolo amministratore:
   - utente previsto: `b9db9303-4b9d-4135-a8d5-94bfb6fa5758`;
   - azienda 3 EMME: `052667cd-c742-43b4-87f9-02ef0527a1d5`;
   - appartenenza prevista: `49458c28-fb71-4875-ab7b-0ee74e25bb9c`.
3. Applicare l’inizializzazione esplicita con controllo che la proprietà sia assente, verifica del membro/azienda/ruolo e lock aziendale; registrare l’assegnazione nello stesso intervento atomico.
4. Nessuna funzione pubblica di auto-nomina, nessun trasferimento e nessun backfill delle altre aziende.
5. L’operazione privilegiata di inizializzazione non conta come collaudo delle autorizzazioni utente.

### File previsti esclusivamente per 2A

- Migrazione generata dallo strumento dedicato: `company_collaboration_foundations`, con SQL completo approvato; metadati e tipi generati automaticamente.
- Nuovo `src/lib/company-collaboration.security.test.ts`: regole concrete, protezioni e compatibilità; verifiche runtime solo con sessioni/dati autorizzati.
- `AGENTS.md` e `src/lib/AGENTS.md`: regole architetturali della nuova gestione, senza cambiare regole operative.
- Eventuali funzioni SQL esistenti che scrivono appartenenze/ruoli: nomi definitivi da elencare dopo tracciamento, **non autorizzate implicitamente**.
- Nessun file pagina o navigazione nella 2A; mockup invariato; roadmap.md escluso.

### Prove 2A e risultati attesi

- Proprietà assente: nessuna nomina automatica; operatività legacy invariata.
- Titolare: disattivazione/rimozione/declassamento respinti; transazione senza effetti e senza falso evento di successo.
- Amministratore non titolare: gestione amministratori respinta, anche da chiamata diretta.
- Ultimo amministratore: revoca/disattivazione respinte anche con due richieste concorrenti.
- Utente senza appartenenza attiva o di altra azienda: letture e scritture riservate negate.
- Collaboratore non amministratore: disattivazione/riattivazione autorizzate, appartenenza e storico conservati.
- Modifica riuscita: audit attribuito all’utente reale e stato riletto; modifica fallita: nessun cambiamento parziale.
- Scritture dirette e vecchie funzioni: medesime protezioni delle nuove RPC.
- Nessuna creazione, revoca o modifica di utenti/dati reali per generare fixture. Test di scrittura solo con rollback affidabile o dati di prova 3 EMME espressamente autorizzati. Non eseguire prove su Trevi.

Distinguere sempre test automatici, analisi statica e collaudo con sessione authenticated: i casi senza sessioni o fixture restano «non verificati».

## B, C e D — Solo panoramica, non autorizzate

**2B — Inviti personali via email.** Inviti collaboratori separati dagli inviti commerciali; token server-side di almeno 256 bit, solo hash persistito, email verificata all’accettazione, ruoli dal record autorizzato. Niente downgrade o riattivazione implicita. Invio/reinvio/revoca con controllo amministratore e titolare se si invitano amministratori. Errore email lascia l’invito pendente, senza falsa conferma. Prima dell’implementazione, revisione distinta dei rischi attuali di autorizzazione all’invio e confronto token/hash. Nessuna email inviata ora.

**2C — Pagina Collaboratori reale.** Elenco persone, titolare protetto, invito, ruoli combinabili, stato, gestione e registro; pagina `/collaboratori` e accettazione `/collaboratore-invito/$token`. Riutilizzare il mockup già approvato ma togliere dal percorso reale personalizzazioni/reparti non inclusi nella fase ridotta, conservando il mockup originale. File e collegamenti definitivi in un piano separato.

**2D — Ruoli operativi effettivi.** Compratore: Lista, ordini fornitori, fornitori e catalogo, senza Carico né annullamento documenti. Magazziniere: Inventario, Ricezione/Carico e Prodotti, senza configurazioni U.M./confezioni/zone né riconciliazione autonoma. Preparatore: Preparazione, quantità/pesi/conferme/mancanti/pronto/storico/stampa, senza decisioni commerciali del venditore. Ruoli sommabili: i vecchi ruoli da soli mantengono i diritti, vecchio+nuovo li somma. Trasportatore invariato. Acquisti diretti AD restano admin/operatore finché non autorizzati diversamente. Prima di applicare: matrice completa di funzioni, policy, pagine e percorsi indiretti; nessun ampliamento indiscriminato dell’operatore.

Reparti, eccezioni per fornitore, prezzi nascosti, permessi individuali e motore generale restano rinviati. Rischi piattaforma e registro non vengono corretti incidentalmente. Nessuna modifica a Danea, documenti, snapshot, ordini o dati operativi fuori da una futura autorizzazione nominativa.

## Prossima decisione

Autorizzare **solo il completamento della proposta SQL 2A e della matrice dei percorsi di scrittura**, ancora senza applicazione. Assegnazione della proprietà, B/C/D, test con nuovi utenti e pubblicazione richiedono ciascuno un consenso separato.