# Assistente vocale "Tom" — piano per fasi

Ambito: solo Inventario e Lista della Spesa. Tom non conferma mai da solo, non ascolta di continuo e si collauda solo su 3 EMME ROMA SRL.

## Fase 0 — Abilitazione per azienda (prerequisito)
- Nuova tabella `company_features` (company_id, feature_key = 'assistente_vocale', enabled, enabled_at, enabled_by). Nessuna FK su auth.users, RLS su `company_id = get_user_company_id()` in sola lettura, GRANT corretti.
- Funzione `has_company_feature(feature_key)` (SECURITY DEFINER, search_path = public) che usa l'utente autenticato. La usano le funzioni server di Tom per decidere: senza abilitazione rispondono 403, il pulsante non compare.
- La scrittura del flag avviene solo per migrazione o super admin piattaforma (con platform_audit_log). Accensione iniziale: solo 3 EMME. Trevi resta spento finché non lo chiedi.
- Nessun controllo sull'email nel browser.

## Fase 1 — Inventario: pulsante + modalità guidata
**Interfaccia**
- Pulsante microfono fisso in basso a destra, sopra la barra «Conferma tutto/Chiudi inventario», senza coprirla (regola barra fissa). Si nasconde con la tastiera aperta come la barra.
- Tocco → "sessione Tom": anello pulsante + scritta «Tom ascolta…», poi «Tom pensa…», «Tom parla…». Si chiude con "fine/basta", con secondo tocco o dopo 60 s di silenzio.
- Registrazione frase per frase: rilevamento del silenzio nel browser (volume), ogni frase diventa un file audio breve e completo inviato al server. Tra una frase e l'altra il microfono resta aperto solo dentro la sessione.
- Le card compilate da Tom hanno un bordo/etichetta «Tom» finché non vengono confermate.

**Catena**
1. Audio → funzione server `tomTranscribe`: trascrizione con un prompt che contiene i nomi prodotto dell'azienda (presi lato server), le ubicazioni e le U.M.
2. Testo → funzione server `tomInterpret`: Lovable AI con tool. Tool lato server: `cerca_prodotto` (ricerca fuzzy su catalogo dell'azienda, con trigrammi), `unita_ammesse(card)`, `card_inventario(prodotto, ubicazione, fornitore)`. Il modello restituisce un comando strutturato: {azione, prodotto_id, card_key, quantità, U.M., confidenza, domanda}.
3. Il server ricontrolla tutto: prodotto della stessa azienda, U.M. tra quelle ammesse dalla card, quantità numerica. Se qualcosa è incerto → restituisce una domanda ("Ananas Costa Rica: casse o kg?"), non un comando.
4. Il browser applica il comando alla **bozza** della card con lo stesso percorso usato dalla digitazione (bozze autosalvate esistenti), mai con nuove scritture. Quantità non capita = campo vuoto, mai zero.
5. Risposta vocale breve con la sintesi vocale italiana del browser.

**Modalità guidata**
- "Tom, facciamo l'inventario della cella 1" → Tom prende le card non confermate di quell'ubicazione nell'ordine visibile (rispettando i filtri) e chiede una alla volta: "Banane, quante?" → "4 casse" → "Segnate 4 casse. Prossimo: …".
- Comandi: salta, ripeti, annulla l'ultimo (ripristina la bozza precedente), "no, erano 5", riepilogo.
- "Conferma" a voce: Tom legge prima un riepilogo breve (quante card, vuote, bloccate, differenze grandi) e chiede "Confermo?"; solo dopo un "sì" chiama lo stesso comando di «Conferma tutto» (confirm_all_inventory_drafts). Conferma singola: stessa RPC del pulsante della card. «Chiudi inventario» resta solo col dito.

## Fase 2 — Lista della Spesa
- Stesso pulsante e sessione.
- "Aggiungi 10 casse di ciliegino" → prepara la quantità e U.M. nella card (prodotto già in lista o «Non in lista»), con la ripartizione automatica sulle stelle già esistente; nessun commit finché non dici "conferma" o tocchi Conferma (commit_shopping_list_item_quantity esistente).
- "Quanto c'è in inventario di banane?" → lettura del Totale inventario già mostrato in card ("Banane: 4 casse contate").
- "Non acquistare banane" → prepara lo 0 confermabile secondo la regola già esistente.
- Nessuna generazione ordini e nessun invio a fornitori a voce.

## Fase 3 — Wake word "Hey Tom" (solo descrizione, non ora)
- Motore on-device (Picovoice Porcupine, parola personalizzata italiana): l'audio resta sul telefono finché non sente "Hey Tom", poi apre la stessa sessione della Fase 1.
- Limiti: richiede licenza Picovoice (a pagamento per uso commerciale), funziona solo con pagina aperta e schermo acceso; su iPhone Safari il microfono non può restare attivo in background. Andrebbe attivato con un interruttore esplicito per sessione di lavoro.

## Servizi, segreti e costi stimati
- **Trascrizione**: modello di trascrizione disponibile tramite Lovable AI (predefinito `openai/gpt-transcribe`), perché: già incluso, nessuna chiave da aggiungere, accetta un prompt con i nomi prodotto (aiuta "ciliegino", "Costa Rica"), buono in italiano e con rumore. Alternativa da valutare se serve: modello Gemini di trascrizione dello stesso servizio.
- **Interpretazione**: Lovable AI, modello predefinito con ragionamento basso per tempi rapidi.
- **Voce di risposta**: sintesi del browser, gratuita.
- **Segreti**: nessun nuovo segreto (Lovable AI usa la chiave già gestita). Fase 3: chiave Picovoice.
- **Stima costi** per una sessione inventario di ~10 minuti e ~80 frasi brevi: trascrizione circa 5–8 minuti di audio + 80 interpretazioni brevi → indicativamente pochi centesimi di crediti per sessione (stima da verificare in collaudo con i registri di utilizzo).

## Limiti noti e gestione
- **iPhone Safari**: il microfono richiede un tocco per iniziare; la sintesi vocale va "sbloccata" dal primo tocco; l'audio si interrompe se lo schermo si spegne o cambi app → la sessione si chiude e lo dice.
- **Permesso microfono negato**: messaggio chiaro con istruzioni, la pagina resta usabile a mano.
- **Rumore di magazzino**: soglia di silenzio regolabile, frasi brevi, nomi prodotto nel prompt, domanda di conferma quando l'incertezza è alta; consigliato auricolare.
- **Connessione assente/lenta**: nessuna scrittura; Tom dice "Non ho capito, ripeti" o "Connessione assente".
- **Errori del servizio AI** (crediti, limiti): la sessione si ferma e lo dice, nessun nuovo tentativo automatico continuo.
- **Privacy**: l'audio non viene salvato; si registra solo il comando applicato (facoltativo, vedi domande).

## Cosa tocco / cosa NON tocco
**Tocco (nuovi)**: migrazione `company_features` + `has_company_feature`; funzioni server Tom (trascrizione, interpretazione, ricerca prodotto) con autenticazione obbligatoria; componenti `src/components/voice/` (pulsante, sessione, registrazione, voce); helper puri per parsing quantità, comandi guidati e controllo U.M., con test.
**Tocco (modifiche limitate)**: `inventory-count-panel.tsx` e `shopping-list-panel.tsx` solo per montare il pulsante, esporre "applica alla bozza" ed evidenziare le card Tom; AGENTS.md con la regola di Tom.
**Non tocco**: RPC esistenti di conteggio, conferma, commit Lista e generazione ordini; regole di conversione, U.M. di magazzino, confezioni; Danea; dati di Trevi; pubblicazione.

## Collaudo
Solo su 3 EMME ROMA SRL in anteprima: test automatici sugli helper, prova Playwright con audio registrato, poi tuo collaudo manuale. Nessun invio a fornitori.

## Domande aperte
1. Vuoi un registro dei comandi vocali (testo, non audio) per controllare cosa ha fatto Tom?
2. In modalità guidata, ordine delle card: quello visibile a schermo o un ordine per ubicazione fisso?
3. La conferma vocale "conferma tutto" va bene, o preferisci che la conferma resti solo col dito?
4. Chi può usare Tom: tutti gli utenti dell'azienda abilitata o solo alcuni ruoli?
5. Nota tecnica: nel file delle card non ho trovato `_card_explicit`; userò la chiave card attuale di `inventory-cards.ts` — confermi?
