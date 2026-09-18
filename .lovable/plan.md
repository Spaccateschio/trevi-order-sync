# Importazione completa dei soggetti Danea e scheda cliente a schede

## Cosa ho verificato nel tuo file
Il file `Soggetti.ods` ha 46 colonne compilate per cliente. Oggi ne trattiamo con un campo dedicato 25; le altre 21 (SDD, trasporto, porto, aliquota IVA, dichiarazione d'intento, conto, ritenuta, invio documenti, avviso, note documenti, home page, login web, Libero 1-6) finiscono in "Altri dati" con l'etichetta grezza del file.

Ho anche trovato un errore: nel file la colonna **Listino** contiene il *nome* del listino ("BAR", "Listino 13"), non il numero. Oggi leggiamo solo le cifre, quindi "BAR" non assegna nessun listino e "Listino 13" assegna erroneamente il numero 13 (che non esiste: i tuoi listini sono 1 BAR, 2 RISTORANTE, 3 "Listino 13").

## Cosa farò

### 1. Tutte le colonne importate con etichetta corretta
- Riconosco per nome le 21 colonne restanti e le salvo con un'etichetta pulita e una collocazione fissa (Anagrafica / Rapporti commerciali / Varie), non più come testo grezzo.
- Le colonne davvero non previste continuano ad essere conservate e mostrate in "Altri dati".
- Le due colonne telefoniche (Tel. e Cell) restano unite; nessun dato scartato.

### 2. Listino riconosciuto per nome
- Il valore del file viene confrontato con i nomi dei tuoi listini Danea (BAR, RISTORANTE, "Listino 13"): corrispondenza esatta, ignorando maiuscole e spazi.
- Se il nome non esiste, il numero non viene assegnato e nell'anteprima vedi l'avviso, così non assegno listini sbagliati.
- Il valore originale resta comunque visibile nella scheda.

### 3. Scheda cliente a schede come in Danea
Il dettaglio cliente passa a tre schede più le sezioni già esistenti:
- **Anagrafica**: codice, codice fiscale, partita IVA, denominazione, indirizzo, CAP, città, provincia, regione, nazione, fattura elettronica (recapito e rif. amministrativo), contatti (referente, telefono, fax, e-mail, PEC).
- **Rapporti commerciali**: sconti, listino assegnato (modificabile), fido, agente, pagamento, coordinate bancarie, nostra banca, SDD, responsabile trasporto, porto, aliquota IVA, dichiarazione d'intento e data, conto, ritenuta d'acconto, invio documenti via e-mail, avviso nuovi documenti, nota in creazione documenti.
- **Varie**: home page, login web, Libero 1-6, note e "Altri dati".
- Restano modificabili gli stessi campi di oggi (anagrafica, contatti, note); i dati che arrivano dal gestionale restano in sola lettura, perché Danea resta il gestionale master.
- Indirizzi e destinazioni restano come sono, sotto le schede.

## Note tecniche
- Nessuna modifica al database: i campi aggiuntivi usano la colonna `danea_extra` già esistente, con chiavi canoniche e un registro etichetta → scheda.
- File toccati: `src/lib/customer-import.ts` (registro colonne aggiuntive, risoluzione listino per nome), `src/components/companies/customer-import-dialog.tsx` (risoluzione listino e avviso in anteprima), `src/components/companies/customer-records-panel.tsx` (dettaglio a schede con `Tabs` shadcn).
- Nessuna modifica a RLS, RPC, prodotti, listini, collegamenti B2B o destinazioni.
