# Rimanda ordine — adattamento minimo da approvare

## Esito della verifica
Non esiste oggi un collegamento B2B al singolo ordine che soddisfi la richiesta di sola consultazione. Esiste la pagina autenticata **Vendite → Ordini clienti**, ma non seleziona un ordine dall'indirizzo; aprire una card chiama inoltre la registrazione «Visto dal fornitore» e può modificare l'ordine.

I link `/consegna/{token}` non vanno riutilizzati: consentono l'accesso senza account e la loro apertura può creare una consegna in bozza.

Le protezioni attuali permettono già la lettura al fornitore tramite `is_order_supplier`, che verifica l'appartenenza aziendale. Non servono nuove tabelle, token o modifiche alle funzioni database.

## Soluzione proposta
1. Adattare la pagina **Ordini clienti** esistente per ricevere l'identificativo dell'ordine e mostrarlo in **sola consultazione**. L'indirizzo sarà prodotto soltanto dopo aver implementato e verificato questa possibilità, non inventato ora.
2. In questa consultazione leggere ordine e righe con le autorizzazioni esistenti e verificare che l'utente appartenga all'azienda fornitrice. Nessuna chiamata per presa in carico, nessun cambio dello stato «Visto», nessun comando di modifica, annullamento o consegna. La pagina operativa normale resta invariata. Questa modalità sarà di sola lettura per tutti gli ordini condivisi, quindi anche quelli già scaricati da Danea.
3. Aggiungere **Rimanda ordine** accanto a **Visualizza ordine** nelle card degli ordini già inviati, compresi gli ordini in avanzamento compatibile, escludendo bozze e annullati. Non correggere gli stati storici incoerenti.
4. Non B2B: riusare `OrderShareDialog` in modalità reinvio, con sette canali e storico soltanto alla conferma esplicita.
5. B2B: finestra con collegamento autenticato, **Copia link**, **Condividi su WhatsApp**, **Invia tramite Email**. Nessun token esterno, invio ordine, notifica automatica o scrittura all'apertura/copia; il collegamento non concede permessi a chi lo riceve. Conservare l'ordine richiesto dopo l'accesso, senza allargare le autorizzazioni.

## File previsti
- `src/components/purchase/purchase-orders-panel.tsx`: pulsante e apertura della finestra corretta.
- Nuovo `src/components/purchase/b2b-order-share-dialog.tsx`: finestra B2B senza scritture.
- `src/routes/_authenticated/vendite_.ordini-clienti.tsx`: selezione dell'ordine dalla pagina esistente e metadati pertinenti.
- `src/components/sales/received-orders-panel.tsx`: consultazione mirata separata dalle azioni operative.
- Nuovi `src/lib/b2b-order-sharing.ts` e `src/lib/b2b-order-sharing.test.ts`: regole del collegamento e test mirati.
- `src/routes/auth.tsx`: solo se necessario per conservare la destinazione dopo l'accesso; nessuna modifica a fornitori di accesso o configurazione.
- `AGENTS.md`, `roadmap.md`: decisione strutturale e avanzamento.

## Verifiche e limiti
- Test automatici su destinazione sicura, esclusione bozze/annullati, modalità sola consultazione e distinzione B2B/non B2B; test pertinenti non B2B già esistenti.
- Controllo degli esiti automatici di compilazione dell'anteprima, senza eseguire manualmente la build.
- Controllo in sola lettura di ORD-2026-00004 e ORD-2026-00005: risultano B2B, già visti, con scarichi Danea presenti; nessuna modifica. La discordanza storica `status=inviato` / `send_status=da_inviare` resta intatta.
- Nessuna prova di invio, conferma, creazione ordine/link temporaneo o comunicazione reale. Nessuna apertura operativa lato Trevi. Un controllo completo con ruolo fornitore richiederà un account e dati di prova autorizzati; non verrà dichiarato superato tramite letture privilegiate.
- Nessuna pubblicazione né applicazione del blocco SQL rinviato. Lista della Spesa, Inventario, Fabbisogno, Consegne, Carico Merce e logica Danea invariati.

## Conferma richiesta
Approvare l'adattamento della pagina Ordini clienti esistente per renderne condivisibile la consultazione del singolo ordine, e i file sopra elencati. Nessuna implementazione effettuata in questa fase.
