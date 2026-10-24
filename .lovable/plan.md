# Correzione dell’abbinamento PATATE BN IT

## Risultato
- Collegare **PATATE BN IT di 3 EMME** a **PATATE BN IT di Trevi (0255)**, non a PERE ABATE IT (0055).
- Impedire che il codice fornitore identifichi un altro articolo del catalogo rispetto all’articolo B2B collegato, senza vietare codici alternativi legittimi.
- Nessuna modifica a prodotti Trevi, giacenze, quantità, ordini o storico; nessun invio o pubblicazione.

## Evidenze e limite dell’analisi
Il collegamento di 3 EMME contiene codice 0255 ma identifica internamente PERE ABATE IT, codice 0055. Anche l’origine del prodotto cliente registra le pere: è uno storico di creazione e non verrà riscritto. Non risultano ordini o ripartizioni che utilizzano questo collegamento.

Il modulo attuale permette di modificare il codice senza cambiare l’articolo B2B; inoltre la finestra del catalogo conserva alcune selezioni quando cambia la ricerca o l’articolo. Sono rischi verificati nel codice, ma non è dimostrato quale abbia causato questo caso.

## Intervento
1. **Controllo globale prima di applicare:** elenco in sola lettura di tutti i collegamenti con codice diverso dall’articolo B2B, in tutte le aziende, inclusa Trevi. Risultato: solo PATATE BN IT (0255 → PERE ABATE IT 0055) e BASILICO ERBE AROMATICHE IT A MAZZI (codice vuoto → stesso basilico 0246), entrambi in 3 EMME. Il basilico resta invariato: codice mancante, non contraddittorio.
2. **Riparazione mirata:** correggere solo l’identità B2B del collegamento di 3 EMME verso le patate 0255. Prima della scrittura verificare nuovamente ruolo autorizzato, identità precedente, azienda, codice, assenza di conflitti e assenza di utilizzi. Registrare prima/dopo nell’audit, senza alterare l’origine storica del prodotto; transazione unica con verifica finale e annullamento completo se qualcosa non torna. La riparazione dei dati avviene separatamente dalla migrazione di schema, tramite un comando autorizzato.
3. **Controllo centrale rivisto, da approvare:** non imporre l’uguaglianza universale dei codici. Rifiutare nuove associazioni o cambi di identità/codice solo quando il codice non vuoto corrisponde a un diverso articolo del medesimo fornitore e archivio del prodotto B2B collegato. Nessuna riassociazione automatica in base al codice; nessun vincolo che richieda descrizioni identiche tra aziende. Codici vuoti e codici alternativi non attribuiti a un altro articolo restano ammessi. Fornitori senza articolo B2B identificato invariati.
4. **Scheda Acquisto:** mostrare l’articolo B2B realmente collegato e mantenere modificabili i codici alternativi legittimi; il controllo centrale rifiuta le contraddizioni accertate, anche con rapporto sospeso. Fornitori esterni invariati.
4. **Finestra catalogo:** codice ricavato dall’articolo selezionato; azzerare selezioni precedenti alla riapertura, al cambio articolo e al cambio ricerca. Durante il salvataggio bloccare i cambi di selezione; mostrare chiaramente i due prodotti prima della conferma.
5. **Compatibilità online:** codice che identifica un altro articolo rifiutato con «Il codice indica un altro articolo del fornitore: verifica l’abbinamento prima di salvare». Nessun controllo sulle modifiche che lasciano invariata l’identità e il codice; codice vuoto ammesso. Il controllo iniziale di uguaglianza è sospeso: può bloccare codici alternativi legittimi e non copre i cambi di codice effettuati successivamente sul catalogo del venditore. La regola rivista non promette di impedire abbinamenti manuali sbagliati quando i codici non permettono di riconoscerli; la conferma esplicita dei due articoli serve a ridurre quel rischio.
6. **Verifica:** prove con dati isolati per codice contraddittorio, selezione non più valida, riapertura e cambio articolo; controlli finali in sola lettura su collegamento, U.M. e prezzo. Listino assegnato attuale: patate 1,60 €/kg netto, pere 4,30 €/kg netto. Se non sono disponibili prove con utenti autenticati e rollback, dichiararle non verificate e consegnare i passi del collaudo a Andrea su 3 EMME, senza inviare ordini.

## File previsti e dettagli tecnici
- Migrazione generata dallo strumento database (numero assegnato dallo strumento): solo controllo SQL sulle variazioni di identità/codice e sui nuovi collegamenti, ed eventuale comando autorizzato di riparazione con audit; funzioni SQL con `SECURITY DEFINER` e `search_path = public`, privilegi espliciti minimi. Nessuna riparazione di righe nella migrazione.
- `src/components/products/product-suppliers-manager.tsx`: lettura e visualizzazione dell’articolo B2B effettivamente collegato, senza vietare codici alternativi legittimi.
- `src/components/catalog/add-to-own-products-dialog.tsx`: reset delle selezioni, codice non modificabile e conferma leggibile dell’abbinamento.
- `src/lib/catalog-link-selection.ts` e `src/lib/catalog-link-selection.test.ts` (nuovi): regole pure della selezione e test.
- `src/lib/catalog-link-identity.security.test.ts` (nuovo): test del controllo centrale tramite percorsi autenticati e dati isolati con rollback, senza usare dati operativi reali.
- `src/components/catalog/AGENTS.md`: regola tecnica sulla coerenza dell’identità B2B.

Le modifiche SQL raggiungono il database condiviso anche senza pubblicazione: la riparazione è limitata a 3 EMME, il controllo preventivo protegge tutte le aziende. Nessuna cancellazione di codice o dati esistenti.

**Stato:** approvazione originale ricevuta, ma esecuzione sospesa come richiesto per il rischio di bloccare operazioni legittime. Nessuna riparazione o modifica applicativa/database applicata. La regola preventiva rivista richiede conferma prima di procedere. Nessuna pubblicazione; `roadmap.md` invariato.