# Assistenza interattiva e «Cosa è cambiato» — analisi e piano

Solo analisi: nessuna modifica a codice, database o documenti finché non autorizzi.

## 1. Situazione attuale
- Tutte le pagine interne usano lo stesso contenitore (AppShell) con titolo e descrizione: un unico punto dove aggiungere l'icona ⓘ accanto al titolo, valido per tutte le pagine.
- Nessuna libreria di tour installata.
- Visibilità delle voci già calcolata da azienda attiva, profilo compra/vende e ruoli (stesse regole del menu): le guide le riusano, senza regole nuove.

## 2. Libreria consigliata: Driver.js
- Leggera (circa 5 kB), nessuna dipendenza, sfondo oscurato con evidenziazione di un elemento alla volta, Avanti/Indietro/Chiudi e progresso, funziona al tocco su smartphone.
- Blocca i clic sull'elemento evidenziato (opzione disabilitata di default dell'interazione): la guida non può premere né confermare nulla.
- React Joyride: più pesante, legato a React, meno adatto con le pagine lunghe su smartphone e con la barra fissa in basso. Scartato.

## 3. Funzionamento per l'utente
```text
ⓘ vicino al titolo
  -> Guida completa | Mostra le novità (o "Nessuna novità per questa pagina") | Chiudi
Durante la guida: sfondo scuro, un elemento evidenziato, testo semplice,
Avanti / Indietro / Salta / Fine, "Passo 3 di 8".
```
- Passaggi il cui elemento non è presente per quell'utente (permessi, stato della lista, schermo piccolo) vengono saltati in automatico e non contano nel progresso.
- Novità interrotte: alla riapertura di ⓘ compare «Riprendi le novità (2 rimaste)»; i passaggi già visti restano segnati.
- Opzionale: un puntino sull'icona ⓘ quando ci sono novità non viste.

## 4. Esempio: Lista della Spesa (versione 1)
Identificativi stabili `data-tour="..."` aggiunti agli elementi esistenti (nessun cambio di comportamento).

| # | Identificativo | Elemento reale | Condizione |
|---|---|---|---|
| 1 | spesa.titolo | Titolo e descrizione pagina | sempre |
| 2 | spesa.banner-ordini | Banner ordini inviati | se presente |
| 3 | spesa.ricerca | Campo di ricerca prodotti | lista aperta |
| 4 | spesa.preferiti | Filtro ★ Preferiti (attivo all'ingresso) | lista aperta |
| 5 | spesa.filtri | Filtri Prodotto (B2B / Non B2B) e stati | lista aperta |
| 6 | spesa.contatori | Contatori Prodotti / Preferiti / In Lista / Mancanti | lista aperta |
| 7 | spesa.aggiungi | Pulsante «Aggiungi prodotti» | lista aperta |
| 8 | spesa.card | Prima card prodotto: quantità, conferma, matita | almeno un prodotto |
| 9 | spesa.genera | Barra fissa «Genera ordini» (solo spiegata, mai premuta) | lista aperta |

## 5. Esempio di aggiornamento (versione 2)
Quando aggiungiamo, per esempio, il pulsante «Rimanda ordine»:
- si aggiunge un passaggio nuovo con `introdotto nella versione 2` e si alza la versione della guida a 2;
- chi ha visto la v1 vede «Mostra le novità (1)» con solo quel passaggio; chi non ha mai visto la guida fa la guida completa (che lo include già);
- correzioni invisibili non toccano la versione: nessun tour.
Le novità si dichiarano solo a mano nel file della guida: niente rilevamento automatico.

## 6. Dati (proposta database)
Nuova tabella `user_guide_progress`: utente, chiave pagina, versione vista della guida completa, elenco passaggi novità già visti, data. Personale per utente (non per azienda), protetta da RLS sull'utente autenticato, scritta solo con una funzione DB `SECURITY DEFINER` con `search_path=public`. Non tocca ordini, liste o altri dati operativi.
Nota: la regola di workspace chiede policy per `company_id`; qui il dato è personale dell'utente, quindi propongo la policy sull'utente. Da confermare.

## 7. File da modificare (fasi successive)
- `src/components/app-shell.tsx`: icona ⓘ accanto al titolo (solo se la pagina ha una guida).
- Nuovi: `src/lib/guides/` (definizioni guide versionate e logica novità, con test), `src/components/guide/` (menu ⓘ e avvio tour), hook per il progresso.
- Pagina Lista della Spesa: solo aggiunta di attributi `data-tour` (nessuna logica toccata) — richiede la tua autorizzazione esplicita per quel file.
- Stili del tour con i token del tema giallo ocra / blu notte.

## 8. Rischi e precauzioni
- Elemento non trovato (cambio grafico) -> passaggio saltato, test che controlla che ogni identificativo esista.
- Guida che preme pulsanti -> interazione disabilitata sull'elemento evidenziato; nessun passaggio esegue azioni.
- Barra fissa / menu su smartphone che coprono l'elemento -> scorrimento automatico e verifica a 390 px.
- Contenuti diversi per permessi -> condizioni riutilizzano le regole del menu.
- Peso sulle pagine -> libreria caricata solo all'apertura della guida.

## 9. Fasi graduali (ognuna con tua verifica prima della successiva)
1. Base: libreria, icona ⓘ, menu, motore guide senza memoria; guida della Lista della Spesa v1. Verifica in anteprima (computer e smartphone).
2. Memoria per utente (tabella + funzione DB), «Mostra le novità», «Riprendi». Test automatici sulla logica versioni.
3. Esempio v2 (novità) per collaudo con 3 EMME.
4. Estensione pagina per pagina (Inventario, Ordini, Ricezione, ...) una alla volta.

Nessuna pubblicazione senza tua autorizzazione.
