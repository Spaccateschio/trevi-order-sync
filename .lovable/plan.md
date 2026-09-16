# Profilo di utilizzo: COMPRO / VENDO / ENTRAMBI

Obiettivo: dopo la verifica dell'email, l'utente che crea la sua azienda dichiara come userà la piattaforma, e l'app mostra solo le funzioni coerenti con quella scelta. La scelta è reversibile e appartiene all'azienda, non alla persona.

## Situazione attuale (verificata)

La Fase 1 ha creato due anagrafiche aziendali distinte: una per l'azienda fornitrice (con membri e ruoli amministratore/operatore/trasportatore) e una separata per le aziende clienti (con ruoli titolare/utente). Il rapporto commerciale collega le due.

Ho controllato i dati reali: esiste 1 azienda (Trevi Fruit), 1 utente registrato e **zero aziende clienti, zero collegamenti, zero prodotti**. Unificare ora non comporta migrazione di dati esistenti.

Rischio segnalato: mantenendo due anagrafiche, un'azienda che compra e vende sarebbe rappresentata da due righe diverse — incompatibile con OrdinaPro. Per questo si unifica adesso.

## Modifiche al database

1. **Anagrafica azienda unica**: l'azienda cliente non ha più una tabella propria. Tutte le aziende (fornitrici, clienti, entrambe) vivono nella stessa anagrafica, con i campi indirizzo di consegna e note di consegna aggiunti lì.
2. **Capacità dell'azienda**: due indicatori indipendenti, "acquista" e "vende". COMPRO = solo acquista; VENDO = solo vende; ENTRAMBI = tutti e due. Vincolo: almeno una delle due attiva. Nessun valore unico "tipo azienda", così ENTRAMBI non è un terzo caso a parte.
3. **Appartenenza unica**: una sola tabella di membri per azienda, con i ruoli già esistenti. I ruoli attuali restano invariati; il titolare dell'azienda cliente diventa un membro con ruolo amministratore. La tabella utenti-azienda-cliente viene rimossa (vuota).
4. **Rapporti commerciali (più fornitori)**: la tabella dei rapporti continua a esistere con la stessa struttura e gli stessi stati, ma punta due volte alla stessa anagrafica: lato venditore e lato acquirente. Vincolo che impedisce un rapporto con se stessa e unicità della coppia venditore-acquirente. Nessun vincolo strutturale a un venditore unico: la stessa azienda acquirente può avere rapporti indipendenti con Fornitore A, B, C. Trevi Fruit come primo fornitore proposto resta solo un'impostazione dell'app, non una regola del database.
5. **Funzioni di autorizzazione**: le funzioni esistenti di appartenenza e ruolo restano; quelle specifiche del lato cliente vengono riscritte sull'unica anagrafica. Si aggiungono due funzioni di sola lettura che dicono se l'azienda dell'utente acquista e/o vende, sempre ricavate dall'utente autenticato. Nessun dato di appartenenza arriva dal browser.
6. **Accessi**: RLS riscritta con lo stesso principio di prima (appartenenza da funzioni con privilegi elevati, nessuna cancellazione fisica, stati attivo/disattivato/revocato). Grant solo a utenti autenticati e al servizio.
7. **Fase 2 Danea intatta**: prodotti, prezzi, costi fornitore, listini, collegamenti e registro invii restano identici e continuano a puntare all'azienda venditrice. Si aggiunge solo la regola che un collegamento gestionale è possibile unicamente per un'azienda con capacità "vende". Endpoint, token, parser e idempotenza non vengono toccati.
8. **Registrazione azienda**: la funzione che registra l'azienda dal frontend accetta la capacità scelta, crea l'azienda e iscrive l'utente come amministratore. La richiesta di collegamento a un fornitore è un'azione separata e ripetibile (una per fornitore scelto), non parte della creazione dell'azienda. Ogni passaggio resta tracciato nel registro attività.
9. **Attivazione successiva**: il titolare può attivare la capacità mancante dalle impostazioni, senza approvazioni e senza creare una seconda azienda; l'evento viene registrato.
10. **Profilo personale**: nome, cognome e telefono restano sulla persona. Alla registrazione vengono salvati subito nel profilo (tramite i dati dell'account creati alla conferma email, così non si perdono durante la verifica) e la pagina Account li mostra già compilati; le modifiche successive aggiornano lo stesso profilo.

## Onboarding

1. Registrazione e verifica email: flusso invariato, ma nome, cognome e telefono inseriti alla registrazione finiscono nel profilo e riappaiono in Account (correzione del problema riscontrato).
2. Primo accesso senza azienda: schermata "Come userai Trevi Fruit?" con tre scelte (COMPRO, VENDO, COMPRO E VENDO) e le descrizioni indicate.
3. Passo successivo: dati dell'azienda (ragione sociale, P.IVA, contatti, indirizzo; per chi acquista anche l'indirizzo di consegna).
4. Chi acquista: elenco dei fornitori disponibili sulla piattaforma (con Trevi Fruit proposto per primo in questa installazione) e richiesta di collegamento in stato "in attesa", ripetibile per più fornitori; prezzi e ordini appariranno solo per i rapporti attivi.
5. Chi vende: accesso immediato all'area di vendita e al collegamento gestionale.
6. Utenti invitati in un'azienda già configurata non vedono la schermata di scelta: entrano con il ruolo assegnato.
7. Nessun dato finto: le pagine non ancora sviluppate restano segnaposto.

## Menu e dashboard

Il menu si compone da due criteri combinati: capacità dell'azienda e ruolo della persona.

```text
ACQUISTI (capacità "acquista")
  Panoramica acquisti · Fornitori · Cataloghi · Listini ricevuti
  Ordini di acquisto · Consegne ricevute

VENDITE (capacità "vende")
  Panoramica vendite · Clienti · Prodotti · Listini
  Ordini ricevuti · Preparazione · Consegne · Trasportatori · Gestionale

SEMPRE
  Azienda · Utenti · Account
```

- COMPRO: nessuna voce dell'area vendite, incluso il gestionale.
- VENDO: nessuna voce dell'area acquisti.
- ENTRAMBI: due gruppi con intestazioni distinte "Acquisti" e "Vendite"; su telefono la barra inferiore mostra un selettore tra le due aree, così gli ordini fatti ai fornitori non si mescolano con quelli ricevuti dai clienti.
- I ruoli continuano a filtrare dentro l'area: operatore vede preparazione, trasportatore vede consegne, amministratore vede impostazioni e gestionale.
- Dashboard: un riquadro per area attiva, con lo stato del collegamento per chi acquista e lo stato dell'ultimo invio gestionale per chi vende.

## Note tecniche

- Migrazione unica: nuova anagrafica unificata, capacità, membri, riscrittura rapporti e funzioni, RLS e grant completi; la riga Trevi Fruit esistente viene impostata come "vende".
- Aggiornamento del punto di lettura dell'identità nel frontend: capacità dell'azienda oltre a ruoli e rapporti, con la stessa cache.
- Nuove pagine: scelta profilo, dati azienda, impostazioni con attivazione della capacità mancante; le pagine attuali vengono riclassificate nei due gruppi.
- Test di isolamento ripetuti come in Fase 1: azienda A non vede i dati di azienda B; un'azienda solo-acquisto non può creare collegamenti gestionali; un'azienda che compra e vende resta una sola riga.

## Compatibilità con i ruoli avanzati (da progettare a parte)

In questa fase restano solo i ruoli attuali (amministratore, operatore, trasportatore) e nessuna pagina di gestione ruoli. L'architettura viene però predisposta così:

- Le voci di menu e le pagine hanno ciascuna una chiave stabile di modulo (es. "vendite.ordini", "acquisti.cataloghi"): domani i permessi si agganciano a queste chiavi senza riscrivere il menu.
- La visibilità viene calcolata in un unico punto (capacità dell'azienda + ruolo), così sarà sostituibile con i permessi personalizzati senza toccare le singole pagine.
- Il legame utente–ruolo resta su una tabella dedicata: uno stesso ruolo potrà essere associato a più utenti e le modifiche al ruolo si propagheranno automaticamente.
- Nessun permesso viene scritto sul singolo utente: si evita di dover migrare dati quando arriveranno i ruoli personalizzati.
- Predisposti (non implementati ora): ruoli con nome libero per azienda, permessi per modulo con lettura/creazione/modifica/eliminazione e azioni operative, inviti tramite link interno con ruolo assegnabile all'invito o dopo.
- COMPRO/VENDO/ENTRAMBI resta una capacità dell'azienda, tenuta separata da ruoli e permessi.

## Fuori ambito

Ordini, prezzi ai clienti, assegnazione listini, immagini prodotto, unità di misura alternative, pagina Prodotti definitiva, gestione avanzata di ruoli e permessi, inviti utente.
