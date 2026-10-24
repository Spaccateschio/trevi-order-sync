# Correzione dell’abbinamento PATATE BN IT

## Risultato
- Collegare **PATATE BN IT di 3 EMME** a **PATATE BN IT di Trevi (0255)**, non a PERE ABATE IT (0055).
- Impedire che il codice fornitore e l’articolo B2B collegato possano essere salvati in modo contraddittorio.
- Nessuna modifica a prodotti Trevi, giacenze, quantità, ordini o storico; nessun invio o pubblicazione.

## Evidenze e limite dell’analisi
Il collegamento di 3 EMME contiene codice 0255 ma identifica internamente PERE ABATE IT, codice 0055. Anche l’origine del prodotto cliente registra le pere: è uno storico di creazione e non verrà riscritto. Non risultano ordini o ripartizioni che utilizzano questo collegamento.

Il modulo attuale permette di modificare il codice senza cambiare l’articolo B2B; inoltre la finestra del catalogo conserva alcune selezioni quando cambia la ricerca o l’articolo. Sono rischi verificati nel codice, ma non è dimostrato quale abbia causato questo caso.

## Intervento
1. **Riparazione mirata:** correggere solo l’identità B2B del collegamento di 3 EMME verso le patate 0255. Prima della scrittura verificare nuovamente identità precedente, azienda, codice, assenza di conflitti e assenza di utilizzi. Registrare prima/dopo nell’audit, senza alterare l’origine storica del prodotto.
2. **Controllo centrale:** rifiutare nuove associazioni o cambi di identità/codice quando un codice non vuoto contraddice quello dell’articolo B2B selezionato. Nessun abbinamento automatico in base al nome o al codice; nessun vincolo che richieda descrizioni identiche tra aziende. I codici vuoti restano ammessi per i collegamenti esistenti.
3. **Scheda Acquisto:** rendere non modificabile manualmente il codice dei collegamenti B2B identificati, anche se il rapporto è sospeso; fornitori esterni invariati.
4. **Finestra catalogo:** codice ricavato dall’articolo selezionato; azzerare selezioni precedenti alla riapertura, al cambio articolo e al cambio ricerca. Durante il salvataggio bloccare i cambi di selezione; mostrare chiaramente i due prodotti prima della conferma.
5. **Verifica:** prove con dati isolati per codice contraddittorio, selezione non più valida, riapertura e cambio articolo; controlli finali in sola lettura sul collegamento corretto e sulle U.M. disponibili. Collaudo operativo di 3 EMME solo da Andrea, senza inviare ordini.

## File previsti e dettagli tecnici
- `drizzle/migrations/0090_b2b_link_identity_consistency.sql` (nuovo; numerazione definitiva verificata prima della creazione): riparazione protetta e audit, controllo SQL sulle variazioni di identità/codice e sui nuovi collegamenti; funzioni SQL con `SECURITY DEFINER` e `search_path = public`, privilegi minimi.
- `src/components/products/product-suppliers-manager.tsx`: lettura dell’identità B2B e protezione del campo codice.
- `src/components/catalog/add-to-own-products-dialog.tsx`: reset delle selezioni, codice non modificabile e conferma leggibile dell’abbinamento.
- `src/lib/catalog-link-selection.ts` e `src/lib/catalog-link-selection.test.ts` (nuovi): regole pure della selezione e test.
- `src/lib/catalog-link-identity.security.test.ts` (nuovo): test del controllo centrale tramite percorsi autenticati e dati isolati con rollback, senza usare dati operativi reali.
- `src/components/catalog/AGENTS.md`: regola tecnica sulla coerenza dell’identità B2B.

Le modifiche SQL raggiungono il database condiviso anche senza pubblicazione: la riparazione è limitata a 3 EMME, il controllo preventivo protegge tutte le aziende. Nessuna cancellazione di codice o dati esistenti.

**Conferma richiesta:** approvare la riparazione mirata e il controllo preventivo condiviso descritti sopra.