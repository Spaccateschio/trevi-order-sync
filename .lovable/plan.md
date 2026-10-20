# Lista della Spesa: card compatte sul cellulare

## Risultato
Applicare alla Lista reale l'aspetto dell'anteprima approvata, **solo in vista Card sul cellulare** (larghezza inferiore a 768 px). Vista Righe, tablet e computer restano invariati.

- Card chiusa: foto, nome ben leggibile, stella preferito, piccoli badge di stato, «Giacenza X · Da acquistare Y» con matita e riepilogo fornitore. Più fornitori: primo nome e «+ N».
- La giacenza conserva la propria U.M. di magazzino; la quantità da acquistare conserva la propria U.M. d'acquisto: nessuna conversione nuova.
- «Suggerita» compare soltanto se maggiore di zero. Avvisi effettivi su U.M., inventario da ricontrollare o problemi di assegnazione restano visibili anche a card chiusa.
- Toccando la riga quantità si espande una sola card alla volta. Appaiono i controlli già esistenti: quantità, U.M., Conferma/Modifica, tasti rapidi, fornitori e azioni avanzate.
- Dopo una conferma **riuscita** la card torna compatta; in caso di errore resta aperta. Aprire una quantità confermata non la sblocca automaticamente: resta necessario il comando Modifica.
- Aprire un'altra card non salva né cancella le modifiche preparate nella precedente.
- I campi quantità continuano a selezionare il numero esistente quando si entra nel campo.
- Apertura e messa a fuoco portano il campo e Conferma nell'area visibile, adeguandosi alla tastiera quando il telefono comunica lo spazio disponibile.

## Perimetro e attenzione ai dati
- Riutilizzare gli stessi dati, permessi, salvataggi e comandi: nessun collegamento nuovo al database, nessuna migrazione.
- Rispettare «Visualizza dati»: le informazioni opzionali nascoste dall'utente non vengono forzate; gli avvisi di problema restano visibili.
- Applicare il medesimo involucro mobile alle card dei prodotti in Lista e ai prodotti dell'inventario «Da valutare» che già usano `ShoppingListCard`, conservando i rispettivi stati e comandi.
- Le card del catalogo fornitori, la finestra «Completa le quantità», ricerca, testata e filtri non cambiano in questo passo.
- **Attenzione:** il mockup usa quantità e fornitori finti; nella Lista reale chiudere una card e confermare una quantità sono operazioni diverse. Il nuovo aspetto non deve introdurre conferme automatiche né cambiare quote fornitore.

## File autorizzati per l'implementazione
1. `src/components/shopping/shopping-list-card.tsx`: variante compatta mobile, riepilogo e riuso dei controlli/avvisi esistenti.
2. `src/components/shopping/shopping-list-panel.tsx`: identificativo della sola card aperta e chiusura dopo l'esito positivo dei comandi già presenti, senza cambiare la logica di salvataggio.
3. `src/components/shopping/shopping-mobile-card.tsx` (nuovo): involucro di presentazione e adattamento allo spazio visibile della tastiera; nessuna lettura o scrittura di dati.
4. `src/components/shopping/shopping-mobile-card-state.ts` e `src/components/shopping/shopping-mobile-card-state.test.ts` (nuovi): piccole regole verificabili di apertura singola e chiusura soltanto dopo conferma riuscita.
5. `src/components/shopping/AGENTS.md`: registrare il confine tra presentazione mobile e salvataggi esistenti.

## Verifiche
- Test delle regole di apertura/chiusura e test quantità già presenti.
- Controllo in formato iPhone 402 × 725 e su computer: card chiuse, apertura singola, avvisi, nomi lunghi, più fornitori, U.M. distinte e assenza di sovrapposizioni.
- Controllo sulla Lista di 3 EMME in sola lettura, se la sessione consente l'accesso: nessuna conferma o altra scrittura operativa da parte dell'assistente.
- Le conferme con dati reali e la tastiera fisica iPhone saranno collaudate manualmente da Andrea; una simulazione non certifica tutti i comportamenti di Safari.
- Nessuna modifica a Inventario, Fabbisogno, Ordini, Consegne, Carico Merce, Danea, numerazioni, email o roadmap; nessuna pubblicazione.

**Attendo la conferma di questo piano prima di modificare la Lista reale.**