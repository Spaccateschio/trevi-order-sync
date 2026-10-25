# U.M. di acquisto del prodotto, anche senza fornitori

## Risultato richiesto
- Nel riquadro superiore della tab **Acquisto**, scegliere e salvare le U.M. del prodotto e la predefinita anche quando non esiste alcun fornitore collegato.
- Il pulsante diventa **«Salva U.M. di acquisto»**: non dipende più dal numero di fornitori manuali.
- Queste U.M. sono disponibili per l'acquisto diretto e vengono proposte quando si aggiunge un nuovo fornitore non B2B; la singola referenza resta personalizzabile.
- I fornitori B2B mantengono esclusivamente le U.M. del loro catalogo nella loro card, senza sovrascritture.

## Passi
1. **Versione reale direttamente in anteprima**, come approvato nel documento del 25/10: nessun salvataggio simulato.
2. Aggiungere il salvataggio persistente delle U.M. proprie del prodotto, distinto dalle referenze fornitore; riaprendo la scheda si ritrovano le impostazioni. Solo U.M. aziendali attive con uso acquisto/entrambi; predefinita tra le selezionate.
3. Collegare le U.M. salvate all'acquisto diretto e alla creazione di nuovi collegamenti non B2B. Per i fornitori manuali già presenti conservare l'applicazione esplicita in blocco, senza rimozioni automatiche o cambiamenti silenziosi.
4. Verificare con dati fittizi: prodotto senza fornitori, riapertura, acquisto diretto, nuovo fornitore manuale e presenza contemporanea di un B2B. Collaudo manuale reale riservato ad Andrea su 3 EMME.

## Attenzione
Oggi non esiste un salvataggio delle U.M. di acquisto indipendente dal fornitore. Attivare soltanto il pulsante mostrerebbe un successo senza conservare nulla. Serve quindi un'impostazione dedicata, non un fornitore fittizio.

Le conversioni non cambiano: il nuovo salvataggio conserva soltanto U.M. e predefinita, senza applicare conversioni o modificare giacenze, quote e documenti.

La verifica della tabella `product_direct_purchase_preferences` conferma che conserva una sola stella per prodotto, con autore/data della scelta. Non contiene U.M.; usarla per la configurazione generale legherebbe impropriamente le U.M. alla destinazione diretta. Si usa una tabella separata senza duplicare stelle né U.M. aziendali. Nessuna modifica alle funzioni/tabelle esistenti o ai percorsi Danea: migrazione additiva compatibile con l'app pubblicata, nessun backfill.

## Dettagli tecnici e file previsti
**Interfaccia reale:**
- Nuovo `src/components/products/product-purchase-units-editor.tsx` per il salvataggio generale, mantenendo l'applicazione ai fornitori esistenti come azione distinta.
- `src/components/products/purchase-units-quick-apply.tsx`
- `src/components/products/product-detail-sheet.tsx`
- `src/components/products/product-suppliers-manager.tsx`
- `src/lib/purchase-unit-apply.ts` e `src/lib/purchase-unit-apply.test.ts`
- `src/components/products/AGENTS.md` e `AGENTS.md` per aggiornare le regole architetturali.

**Salvataggio e collegamenti:**
- Nuova migrazione generata dal servizio database: configurazione aziendale per prodotto/U.M., autorizzazioni e salvataggio atomico amministratore-only; azienda ricavata dall'utente autenticato.
- Nuovi `src/lib/product-purchase-units.functions.ts`, `src/lib/product-purchase-units.ts` e relativo test.
- File dell'interfaccia sopra elencati.
- `src/components/shopping/card-suppliers.tsx`, `src/components/shopping/shopping-list-panel.tsx`, `src/lib/shopping-list.functions.ts`, `src/lib/shopping-list.ts` e relativi test, solo per rendere disponibili le U.M. dirette senza cambiare quote o generazione.
- `src/components/shopping/shopping-list-card.tsx` e `src/components/shopping/catalog-entries.tsx`: selettori effettivi delle U.M. della Lista, per includere le U.M. proprie senza conversioni o cambi automatici delle quantità.
- `src/components/shopping/AGENTS.md` per la nuova fonte delle U.M. dirette.

Nessuna modifica a ordini, giacenze o dati operativi esistenti; nessun invio ai fornitori, nessuna pubblicazione. `roadmap.md` contiene soltanto il controllo richiesto dal nuovo messaggio, senza modificare le voci precedenti.