# U.M. di acquisto del prodotto, anche senza fornitori

## Risultato richiesto
- Nel riquadro superiore della tab **Acquisto**, scegliere e salvare le U.M. del prodotto e la predefinita anche quando non esiste alcun fornitore collegato.
- Il pulsante diventa **«Salva U.M. di acquisto»**: non dipende più dal numero di fornitori manuali.
- Queste U.M. sono disponibili per l'acquisto diretto e vengono proposte quando si aggiunge un nuovo fornitore non B2B; la singola referenza resta personalizzabile.
- I fornitori B2B mantengono esclusivamente le U.M. del loro catalogo nella loro card, senza sovrascritture.

## Passi
1. **Prova visiva nella tab attuale**, con salvataggio simulato e dichiarato: pulsante attivo senza fornitori, elenco U.M. e stella predefinita, riepilogo coerente e acquisto diretto. Nessuna scrittura reale.
2. **Dopo approvazione della prova**, aggiungere il salvataggio persistente delle U.M. proprie del prodotto, distinto dalle referenze fornitore; riaprendo la scheda si ritrovano le impostazioni.
3. Collegare le U.M. salvate all'acquisto diretto e alla creazione di nuovi collegamenti non B2B. Per i fornitori manuali già presenti conservare l'applicazione esplicita in blocco, senza rimozioni automatiche o cambiamenti silenziosi.
4. Verificare con dati fittizi: prodotto senza fornitori, riapertura, acquisto diretto, nuovo fornitore manuale e presenza contemporanea di un B2B. Collaudo manuale reale riservato ad Andrea su 3 EMME.

## Attenzione
Oggi non esiste un salvataggio delle U.M. di acquisto indipendente dal fornitore. Attivare soltanto il pulsante mostrerebbe un successo senza conservare nulla. Serve quindi un'impostazione dedicata, non un fornitore fittizio.

Le conversioni non devono cambiare giacenze né ricalcolare documenti: nella prima prova non vengono applicate; nella fase reale si mantengono separate dalle U.M. e si usano soltanto i comandi di conversione autorizzati, con verifica dell'U.M. di magazzino.

## Dettagli tecnici e file previsti
**Prova visiva:**
- `src/components/products/purchase-units-quick-apply.tsx`
- `src/components/products/product-detail-sheet.tsx`
- `src/components/products/product-suppliers-manager.tsx`
- `src/lib/purchase-unit-apply.ts` e `src/lib/purchase-unit-apply.test.ts`
- `src/components/products/AGENTS.md` e `AGENTS.md` per aggiornare le regole architetturali.

**Fase reale successiva:**
- Nuova migrazione generata dal servizio database: configurazione aziendale per prodotto/U.M., autorizzazioni e salvataggio atomico amministratore-only; azienda ricavata dall'utente autenticato.
- Nuovi `src/lib/product-purchase-units.functions.ts`, `src/lib/product-purchase-units.ts` e relativo test.
- File della prova visiva sopra elencati.
- `src/components/shopping/card-suppliers.tsx`, `src/components/shopping/shopping-list-panel.tsx`, `src/lib/shopping-list.functions.ts`, `src/lib/shopping-list.ts` e relativi test, solo per rendere disponibili le U.M. dirette senza cambiare quote o generazione.
- `src/components/shopping/AGENTS.md` per la nuova fonte delle U.M. dirette.

Nessuna modifica a ordini, giacenze o dati operativi esistenti; nessun invio ai fornitori, nessuna pubblicazione. `roadmap.md` resta invariato per questo intervento.