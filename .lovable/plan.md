# Fase 2B — Inviti reali ai collaboratori (revisione 2, solo progettazione)

Il testo SQL completo è nel file di proposta `.lovable/sql/company-collaboration-2b.proposed.sql` (660 righe) e non è stato applicato. Non ho inviato email, creato utenti, modificato schermate o permessi, toccato roadmap.md o pubblicato nulla.

## Decisioni confermate (già nel testo)
1. Solo il titolare invita, anche amministratori.
2. Scadenza: 72 ore.
3. Accettazione solo con email identica e verificata.
4. Persona già disattivata: invito rifiutato. La riattivazione resta quella della 2A.
5. Reinvii: al massimo 5 nelle 24 ore per invito, a non meno di 60 secondi l'uno dall'altro. I tentativi che il servizio di posta rifiuta non contano.

## A. Protezioni Fase 2A
- **Confronto con il database:** le due protezioni oggi attive sono identiche, carattere per carattere, al testo della 0077.
- **Differenze esatte:**
  - **Protezione di appartenenze e ruoli** (`_collaboration_guard`):
    - la modalità `invite_accept` si aggiunge all'elenco delle modalità ammesse;
    - nuovo ramo sulle appartenenze: è ammesso solo l'inserimento della propria appartenenza, attiva, con un invito valido e nessuna appartenenza già esistente;
    - nuovo ramo sui ruoli: è ammesso solo l'inserimento, sulla propria appartenenza attiva, di ruoli contenuti nell'invito.
  - **Protezione dello storico** (`_collaboration_history_guard`): si aggiungono le modalità `invite` e `invite_accept` all'elenco ammesso.
  - **Tutto il resto:** identico alla 0077.
- **Perché la modalità di accettazione non si può attivare a piacere:**
  1. il browser non ha permessi di scrittura diretta su appartenenze e ruoli (tolti nella 0077);
  2. la protezione accetta solo scritture fatte dal proprietario delle tabelle, cioè da dentro una funzione protetta, e il browser non può impostare il contesto se non attraverso una di esse;
  3. l'unica funzione che attiva questa modalità è «accetta invito»;
  4. anche con la modalità attiva serve un invito della stessa azienda, in attesa, non scaduto, con l'email verificata della persona collegata.
- **Titolare e amministratori restano protetti:**
  - la modalità di accettazione non permette modifiche né cancellazioni;
  - il ramo del titolare resta invariato e accetta solo l'inizializzazione;
  - le regole sull'ultimo amministratore e sul titolare restano identiche;
  - il ruolo amministratore entra solo se l'invito lo contiene, e solo il titolare può crearlo;
  - all'accettazione si ricontrolla che chi ha invitato sia ancora il titolare attivo.

## B. Codici e invio email
- **Chi può creare e reinviare:** solo la funzione server autenticata. Le funzioni del database per creare e reinviare sono eseguibili solo dal server, mai dal browser.
- **Come funziona:**
  1. il server verifica la sessione e passa al database l'utente verificato;
  2. il database imposta per quella sola operazione l'identità dell'invitante, così le protezioni e lo storico della 2A registrano la persona reale;
  3. il codice torna solo al server, che spedisce l'email e restituisce al browser solo l'esito.
- **Il codice:**
  - è generato dal database con 32 byte casuali crittograficamente sicuri;
  - si salva solo la sua impronta, in una tabella che nessuno può leggere;
  - all'accettazione si confronta l'impronta, anche una seconda volta dopo il blocco;
  - è a uso singolo: l'impronta viene cancellata quando l'invito viene accettato o revocato;
  - il reinvio la sostituisce, quindi il link precedente smette subito di funzionare.
- **Stato dell'invio:** ogni invio viene registrato e il server ne scrive l'esito:
  - **in invio**, **inviato**, **fallito** oppure **destinatario bloccato**;
  - se dopo 10 minuti l'esito non è arrivato, l'elenco mostra «esito sconosciuto».
- **Recupero:** se l'invio fallisce, il titolare preme «Reinvia». Viene generato un codice nuovo e il fallimento non conta nel limite dei 5 reinvii.

## C. Matrice delle autorizzazioni

| Oggetto | Browser senza accesso | Persona con accesso | Server (chiave privilegiata) |
|---|---|---|---|
| Inviti / Invii | niente | lettura solo se amministratore dell'azienda | completo, ma ogni scrittura passa dalle protezioni |
| Segreti dei codici | niente | niente | niente (solo le funzioni) |
| crea / reinvia / esito invio | no | no | sì |
| revoca | no | sì, il database controlla che sia il titolare | — |
| elenco inviti | no | sì, il database controlla che sia amministratore | — |
| accetta | no | sì, email verificata e identica | — |
| anteprima del link | sì: solo azienda, nome, ruoli ed email mascherata | sì | — |

Il controllo finale della migrazione verifica i privilegi effettivi e annulla tutto se il browser può scrivere o leggere i segreti. Questo vale anche per i privilegi aggiunti automaticamente, che erano emersi con la 0078.

I ruoli assegnati all'accettazione sono solo quelli dell'invito, controllati due volte: la funzione inserisce solo quelli dell'invito e la protezione rifiuta qualsiasi altro ruolo.

## D. Oggetti creati o modificati
- **Tabelle nuove:**
  - `collaborator_invitations` (inviti);
  - `collaborator_invitation_secrets` (impronte dei codici);
  - `collaborator_invitation_sends` (invii ed esiti).
- **Protezioni nuove:**
  - `_collaborator_invitation_guard` su tutte e tre le tabelle;
  - riuso dello storico 2A sugli inviti;
  - blocco dello svuotamento sulle tre tabelle.
- **Funzioni interne:**
  - `_collaborator_invite_context_ok`;
  - `_collaborator_owner_company`;
  - `_collaborator_server_actor` e `_collaborator_server_actor_end`.
- **Funzioni pubbliche:**
  - `create_collaborator_invitation`, `resend_collaborator_invitation`, `record_collaborator_invitation_send` (solo server);
  - `revoke_collaborator_invitation`, `get_collaborator_invitations`, `accept_collaborator_invitation`, `preview_collaborator_invitation`.
- **Funzioni 2A modificate:** `_collaboration_guard` e `_collaboration_history_guard`, con le differenze descritte al punto A.
- **Controlli della migrazione:**
  - all'inizio: ruolo di esecuzione, proprietario delle appartenenze, presenza delle funzioni di cifratura;
  - alla fine: proprietari postgres e privilegi effettivi, con annullamento totale se qualcosa non torna.

## Piano delle prove innocue (dopo l'applicazione, sessione 3 EMME)
1. Dal browser, «crea» e «reinvia» vengono rifiutate per permesso negato.
2. Lettura diretta dei segreti: rifiutata.
3. Scrittura diretta su inviti e invii: rifiutata.
4. Accettazione con un codice inventato: «non valido».
5. Anteprima con un codice inventato: «non valido».
6. Revoca di un invito inesistente: «non trovato».
7. L'elenco inviti risponde vuoto.
8. Inserimento diretto nello storico: rifiutato.
9. Dopo ogni prova, appartenenze, ruoli, titolare e storico risultano invariati.

La prova completa con email reale verrà dopo, solo con il tuo permesso e un indirizzo che indichi tu.

## Problemi ancora aperti
- **Testo non provato sul database:** il testo non è stato eseguito nemmeno in una prova annullata. Un errore di scrittura uscirebbe solo all'applicazione, che è atomica.
- **Accesso con la chiave privilegiata:** il server può agire a nome di una persona solo dopo averne verificato la sessione. Chi possiede la chiave privilegiata del server potrebbe usarla impropriamente. È un rischio accettato, come per gli altri usi esistenti di quella chiave.
- **Anteprima del link:** chi possiede un link valido vede il nome dell'azienda e il nome dell'invitato. È inevitabile perché serve a capire l'invito.
- **Invii senza esito:** un invio rimasto senza esito conta nel limite dei 5 finché non arriva un esito «fallito».

## E. Inviti commerciali (separati, non modificati)
- **Invio senza controllo amministrativo:** gravità media. Qualsiasi persona che può leggere un invito può farlo rispedire più volte dal dominio di Trevi Fruit. Può servire per inviare email indesiderate al cliente, ma non dà accesso a nessun dato.
- **Codice non confrontato con l'impronta:** gravità medio-alta. Il codice usato nel link dell'email arriva dal browser e non viene confrontato con quello salvato. Si può spedire un link sbagliato o modificato, che resta comunque sul sito di Trevi Fruit, con la grafica ufficiale: è un rischio di confusione o di inganno.
- **Proposta:** correggere entrambi in un intervento dedicato, dopo la 2B, solo con la tua autorizzazione.

## Sequenza successiva (ogni passo con approvazione)
1. Applicazione della migrazione e prove innocue.
2. Modello email e funzione server di invio, senza spedire nulla.
3. Pagina di accettazione e scheda reale «Collaboratori».
4. Collaudo con email reale autorizzata.
