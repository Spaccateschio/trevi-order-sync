# Correzione dell’abbinamento PATATE BN IT

## Risultato
- Collegare **PATATE BN IT di 3 EMME** a **PATATE BN IT di Trevi (0255)**, non a PERE ABATE IT (0055).
- Impedire che il codice fornitore e l’articolo B2B collegato possano essere salvati in modo contraddittorio.
- Nessuna modifica a prodotti Trevi, giacenze, quantità, ordini o storico; nessun invio o pubblicazione.

## Evidenze e limite dell’analisi
Il collegamento di 3 EMME contiene codice 0255 ma identifica internamente PERE ABATE IT, codice 0055. Anche l’origine del prodotto cliente registra le pere: è uno storico di creazione e non verrà riscritto. Non risultano ordini o ripartizioni che utilizzano questo collegamento.

Il modulo attuale permette di modificare il codice senza cambiare l’articolo B2B; inoltre la finestra del catalogo conserva alcune selezioni quando cambia la ricerca o l’articolo. Sono rischi verificati nel codice, ma non è dimostrato quale abbia causato questo caso.

## Intervento
1. **Controllo globale prima di applicare:** elenco in sola lettura di tutti i collegamenti con codice diverso dall’articolo B2B, in tutte le aziende, inclusa Trevi. Risultato: solo PATATE BN IT (0255 → PERE ABATE IT 0055) e BASILICO ERBE AROMATICHE IT A MAZZI (codice vuoto → stesso basilico 0246), entrambi in 3 EMME. Il basilico resta invariato: codice mancante, non contraddittorio.
2. **Riparazione mirata:** correggere solo l’identità B2B del collegamento di 3 EMME verso le patate 0255. Prima della scrittura verificare nuovamente ruolo autorizzato, identità precedente, azienda, codice, assenza di conflitti e assenza di utilizzi. Registrare prima/dopo nell’audit, senza alterare l’origine storica del prodotto; transazione unica con verifica finale e annullamento completo se qualcosa non torna. La riparazione dei dati avviene separatamente dalla migrazione di schema, tramite un comando autorizzato.
2. **Controllo centrale:** rifiutare nuove associazioni o cambi di identità/codice quando un codice non vuoto contraddice quello dell’articolo B2B selezionato. Nessun abbinamento automatico in base al nome o al codice; nessun vincolo che richieda descrizioni identiche tra aziende. I codici vuoti restano ammessi per i collegamenti esistenti.
3. **Scheda Acquisto:** rendere non modificabile manualmente il codice dei collegamenti B2B identificati, anche se il rapporto è sospeso; fornitori esterni invariati.
4. **Finestra catalogo:** codice ricavato dall’articolo selezionato; azzerare selezioni precedenti alla riapertura, al cambio articolo e al cambio ricerca. Durante il salvataggio bloccare i cambi di selezione; mostrare chiaramente i due prodotti prima della conferma.
5. **Compatibilità online:** codice contraddittorio rifiutato con «Il codice non corrisponde all’articolo selezionato del fornitore». Nessun controllo sulle modifiche che lasciano invariata l’identità e il codice; codice vuoto ammesso. Se la verifica individua un’operazione legittima dell’app pubblicata che verrebbe interrotta, fermarsi prima di applicare.
6. **Verifica:** prove con dati isolati per codice contraddittorio, selezione non più valida, riapertura e cambio articolo; controlli finali in sola lettura su collegamento, U.M. e prezzo. Listino assegnato attuale: patate 1,60 €/kg netto, pere 4,30 €/kg netto. Se non sono disponibili prove con utenti autenticati e rollback, dichiararle non verificate e consegnare i passi del collaudo a Andrea su 3 EMME, senza inviare ordini.

## File previsti e dettagli tecnici
- Migrazione generata dallo strumento database (numero assegnato dallo strumento): solo controllo SQL sulle variazioni di identità/codice e sui nuovi collegamenti, ed eventuale comando autorizzato di riparazione con audit; funzioni SQL con `SECURITY DEFINER` e `search_path = public`, privilegi espliciti minimi. Nessuna riparazione di righe nella migrazione.
- `src/components/products/product-suppliers-manager.tsx`: lettura dell’identità B2B e protezione del campo codice.
- `src/components/catalog/add-to-own-products-dialog.tsx`: reset delle selezioni, codice non modificabile e conferma leggibile dell’abbinamento.
- `src/lib/catalog-link-selection.ts` e `src/lib/catalog-link-selection.test.ts` (nuovi): regole pure della selezione e test.
- `src/lib/catalog-link-identity.security.test.ts` (nuovo): test del controllo centrale tramite percorsi autenticati e dati isolati con rollback, senza usare dati operativi reali.
- `src/components/catalog/AGENTS.md`: regola tecnica sulla coerenza dell’identità B2B.

Le modifiche SQL raggiungono il database condiviso anche senza pubblicazione: la riparazione è limitata a 3 EMME, il controllo preventivo protegge tutte le aziende. Nessuna cancellazione di codice o dati esistenti.

**Approvazione ricevuta nel documento:** riparazione mirata e controllo preventivo approvati con i controlli globali, la compatibilità online e i limiti di collaudo sopra descritti. Nessuna pubblicazione; `roadmap.md` invariato.