# Invio e reinvio non B2B — autorizzazione della fase database

## Stato della fase
Sviluppo approvato nel documento pasted-41, ma migrazioni non autorizzate. Questa fase prepara le garanzie necessarie prima di collegare la nuova finestra a scritture reali. Nessuna migrazione applicata e nessun ordine corretto.

## Incoerenze esistenti: sola lettura
| Azienda | Ordine | Stato | Stato invio | Data italiana | Canale |
|---|---|---|---|---|---|
| 3 EMME ROMA SRL | ORD-2026-00003 | inviato | da_inviare | 17/10/2026 07:31:34 | email |
| 3 EMME ROMA SRL | ORD-2026-00004 | inviato | da_inviare | 15/10/2026 08:35:20 | piattaforma |
| 3 EMME ROMA SRL | ORD-2026-00005 | inviato | da_inviare | 15/10/2026 10:44:01 | piattaforma |

Nessun backfill o correzione automatica. Gli ordini 00004/00005 già scaricati da Danea restano intoccabili.

## Tabelle coinvolte, senza nuove tabelle
- `purchase_orders`: soltanto i campi di conferma `status`, `send_status`, `sent_at`, `send_channel`; `updated_at` cambia tramite trigger esistente. Non cambiare righe, note, quantità, U.M., prezzi, consegna, numero o collegamenti.
- `audit_events`: eventi append-only di primo invio, reinvio e rettifica. Dati: ordine, azienda proprietaria, autore autenticato, data server, canale, destinatario, tipo, chiave idempotente; rettifica con motivo e valori prima/dopo. Nessun token o URL segreto nell’audit.
- `purchase_order_share_links`: riuso della creazione esistente con `_keep_existing=true`, hash soltanto, durata 72 ore. Nessuna creazione all’apertura della finestra.
- `shopping_lists`, `purchase_deliveries`, `goods_receipts`, `danea_order_exports`, `purchase_order_changes`, `purchase_order_change_requests`: letture e blocchi necessari ai controlli, non correzioni dei loro dati. La prima conferma conserva la chiusura automatica già esistente; il reinvio non la richiama.

## Funzioni proposte
### 1. `confirm_non_b2b_order_share`
Input: ordine, canale, destinatario, chiave UUID della conferma.
- Utente autenticato, appartenenza attiva e ruolo amministratore/operatore dell’azienda proprietaria, verificati nel DB. Azienda mai scelta dal browser.
- Esclusione B2B verificata tramite rapporto e collegamenti delle righe; rifiuto in caso di dati ambigui.
- Lista prima dell’ordine sotto lock, poi controllo stato aggiornato.
- Canali: whatsapp, email, sms, telefono, di_persona, altro, copia_testo. Destinatario obbligatorio per email/WhatsApp/SMS; conservare quello effettivamente utilizzato, senza aggiornare l’anagrafica.
- Prima conferma soltanto da bozza: `inviato/inviato`, data server e canale, completamento Lista tramite logica esistente, evento audit nella stessa transazione.
- Reinvio su ordine già inviato o in avanzamento compatibile: soltanto nuovo evento audit, nessuna modifica all’ordine o alla Lista. Escludere annullati.
- Stessa chiave = stessa conferma, non nuovo evento. Una seconda chiave concorrente di primo invio viene rifiutata se lo stato è già cambiato; reinvio richiede modalità esplicita. Lock ordine protegge controllo e inserimento: nessuna tabella nuova per idempotenza.

### 2. `undo_non_b2b_order_send_confirmation`
Input: ordine, motivo obbligatorio, chiave idempotente.
- Solo amministratore autenticato dell’azienda proprietaria; solo ordine non B2B ancora `inviato`.
- Rifiutare consegne/carichi di qualunque stato, scarico o storico Danea, presa in carico, richieste/modifiche successive incompatibili, chiusura/annullamento e Lista collegata non aperta. Nessuna riapertura automatica della Lista.
- Lista poi ordine sotto lock, controlli prima delle scritture.
- Ripristino `bozza/da_inviare`, `sent_at=NULL`, `send_channel=NULL`; audit con motivo, autore, prima/dopo. `updated_at` non torna indietro: registra la rettifica.
- Non cancella eventi precedenti, link, documenti o messaggi esterni. Nessuna esecuzione su ORD-2026-00003.

### 3. `order_share_history`
Lettura controllata degli eventi dell’ordine con data, autore, canale, destinatario, tipo e rettifiche. Stessi controlli azienda e ruolo, nessun accesso generico all’audit. Eventi legacy mostrati con destinatario «Non registrato», senza dati inventati. Il nome dell’autore viene letto dal profilo esistente.

### 4. Protezione del vecchio percorso non B2B
`manage_purchase_order`: preservare il ramo B2B esattamente e gli altri comandi; instradare/rifiutare la sola conferma non B2B priva dei dati richiesti. Non lasciare un percorso alternativo che aggiri storico e idempotenza.
**Rischio di compatibilità:** la versione pubblicata usa ancora il vecchio popup; bloccare il vecchio percorso non B2B ne impedirà la conferma fino alla pubblicazione del nuovo frontend. Nessuna pubblicazione è autorizzata. Prima di applicare occorre approvare anche questo effetto, oppure rinviare tale blocco al rilascio coordinato. Non cambiare il ramo B2B per correggere retroattivamente incoerenze esistenti.

## Permessi
Funzioni `SECURITY DEFINER SET search_path=public`; revocare EXECUTE a PUBLIC/anon, concedere ad authenticated. Controlli sessione, appartenenza e ruoli nel corpo di ogni funzione; nessun company_id arbitrario. Le policy/grant esistenti di `audit_events` non vengono allargate. Nessun nuovo ruolo, tabella o client privilegiato per le chiamate dell’app.

## Frontend dopo le garanzie
Una finestra unica per Lista, bozze aperte dalla Lista e dettaglio ordine. Sette canali, incluso Copia testo. Destinatari correggibili solo per condivisione. Anteprima completa senza prezzi; data/orario/luogo dai documenti, senza inventare modalità ritiro non memorizzate.
Apertura canale/copia non cambia stato; conferma manuale separata. Rimanda ordine con storico; Annulla conferma invio solo admin e con motivo, mai eseguita nelle verifiche reali.
Link creati solo su richiesta, mai per apertura; nessuna revoca automatica. Singola etichetta di stato senza nascondere incoerenze. Nota «U.M. del prezzo diversa dall'ordine» quando i codici fotografati differiscono; nessuna conversione.

## File autorizzabili per fase
- Nuova migrazione in `supabase/migrations/` (nome definitivo assegnato dallo strumento), senza backfill operativo.
- `src/lib/purchase.functions.ts`, `src/lib/purchase.ts` e test pertinenti.
- `src/components/purchase/send-order-dialog.tsx`, `purchase-order-detail.tsx` e nuova finestra condivisa/test nel medesimo ambito.
- `src/components/shopping/generation-results.ts`, `generation-results.test.ts`, `generation-summary.tsx`, `generate-orders-dialog.tsx`.
- `src/components/shopping/AGENTS.md`, `src/lib/AGENTS.md`, `AGENTS.md` solo per le decisioni strutturali pertinenti; `roadmap.md` per le fasi.

## Prove e limiti
Frontend: messaggio senza prezzi, note e destinatario inclusi, sette canali, chiusura/selezione senza scrittura, link non creati all’apertura, reinvio senza generazione, avviso U.M., doppia conferma.
SQL dopo approvazione: sessione authenticated e JWT reale, dati isolati in transazione annullata, admin/operatore propria azienda, altra azienda, B2B/non B2B, attività successive, motivo mancante, concorrenza e idempotenza. Mai service_role come prova di autorizzazione. Se l’ambiente non permette questo collaudo, segnalarlo come non verificato.
Nessuna prova operativa, creazione link reale o invio email/WhatsApp/SMS. Nessun ripristino né pubblicazione.

## Decisione richiesta
Approvare le funzioni e i permessi proposti prima di applicare qualsiasi migrazione. Decidere quando bloccare il vecchio percorso non B2B: al rilascio coordinato (senza pubblicare ora) oppure subito, accettando che la versione pubblicata non possa confermare questi invii fino al nuovo rilascio.
