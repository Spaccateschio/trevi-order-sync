# Campanella nell’area piattaforma

## Situazione verificata
La schermata mostrata non contiene una campanella. Quella già presente nell’app serve le singole aziende: non è inserita nell’area piattaforma e non va riutilizzata per leggere indiscriminatamente le notifiche dei clienti.

## Primo passo — Anteprima da approvare
- Una **campanella in alto**, accanto all’account, presente in tutte le pagine dell’area piattaforma, anche su telefono.
- **Numero rosso delle non lette**.
- Apertura di un elenco con **Nuove / Storico**, titolo, breve testo e data/ora.
- Esempio dimostrativo: «Nuova richiesta Vendo — Azienda dimostrativa»; selezionandolo si apre «Richieste Vendo», senza approvare o rifiutare nulla.
- Comandi **Segna come letta** e **Segna tutte come lette**. Leggere una notifica non risolve la richiesta corrispondente.
- Dati solo dimostrativi, chiaramente indicati come anteprima; nessuna richiesta reale, email o scrittura nel database.

## Secondo passo — Solo dopo approvazione separata
Collegare la campanella agli eventi reali, iniziando dalle **richieste Vendo**:
- nuova richiesta al super admin;
- annullamento della richiesta, per evitare avvisi non più attuali;
- le richieste ancora in attesa al momento dell’attivazione devono essere rintracciabili senza duplicare gli avvisi;
- aggiornamento senza ricaricare la pagina e stato letta/non letta personale;
- navigazione alla pagina competente e gestione esplicita di caricamento/errori.

Gli altri eventi saranno collegati successivamente, concordando quali interessano al team piattaforma. La campanella non sostituisce né abilita gli invii email, che restano bloccati.

## Permessi e limiti
- Richieste Vendo visibili solo al super admin attivo; gli altri avvisi solo a chi può accedere alla relativa sezione.
- Nessuna modifica ai permessi aziendali o alle regole di approvazione.
- Nessuna modifica a Ordini, Preparazione, Danea, Lista della Spesa, Inventario, Consegne o Carico Merce.
- Nessuna pubblicazione e nessuna modifica a `roadmap.md`.

## File del primo passo
- Nuovo `src/components/platform/platform-notification-demo-data.ts`: esempi dimostrativi.
- Nuovo `src/components/platform/platform-notification-bell-mockup.tsx`: campanella e lista con componenti shadcn e token esistenti.
- `src/components/platform/platform-shell.tsx`: inserimento nell’intestazione comune.
- `AGENTS.md`: regola strutturale del modulo dimostrativo isolato, senza accessi ai dati reali.

Il secondo passo avrà un piano distinto con l’elenco preciso dei file e l’eventuale SQL completo prima dell’applicazione.

## Verifica del primo passo
Controllare apertura, lettura, passaggio allo storico e collegamento a «Richieste Vendo»; verificare che la campanella non copra account o navigazione su telefono e computer. Nessuna prova deve creare o decidere richieste reali.

## Conferma richiesta
Approvare il **primo passo: sola anteprima della campanella**. Per ricevere avvisi reali servirà poi approvare il secondo passo.
