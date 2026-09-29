# Lista della Spesa: un’unica area prodotti

## Risultato

- Eliminare la separazione visiva tra «Da inventario» e la card isolata sotto.
- Mostrare **una sola area prodotti**, con filtri e selettore `Card | Righe` sopra.
- Usare per tutti i prodotti la **scheda completa oggi mostrata sotto**: immagine, dati prodotto, conteggio/giacenza/suggerita, quantità da acquistare, conferma/sblocco, fornitore e ripartizioni.
- Quando un prodotto viene aggiunto alla Lista non cambia posizione e non appare in una seconda sezione: cambia soltanto stato da «Da valutare» a «In lista».

## Comportamento

1. Unire nella stessa raccolta i prodotti dell’ultimo inventario ancora da valutare e quelli già presenti nella Lista, evitando duplicati.
2. Spostare sopra l’unica raccolta i filtri esistenti e aggiungere gli stati `Tutti`, `Da valutare` e `In lista`; ricerca, categoria, preferiti e fornitore agiranno sulla stessa raccolta.
3. Conservare la scelta Card/Righe già memorizzata e applicarla all’unica raccolta.
4. Per un prodotto «Da valutare», la scheda completa mantiene l’azione esistente «Aggiungi alla Lista» e la creazione della lista solo al primo salvataggio; nessuna lista fantasma all’apertura.
5. Per un prodotto «In lista», mantenere quantità, tasti rapidi, Conferma/Sblocca, assegnazioni, più fornitori, equivalenti mancanti e menu già presenti.
6. Conservare «Termina valutazione», conteggi e semaforo senza cambiarne la logica.

## U.M. d’acquisto

- La U.M. sarà scelta per la singola ripartizione fornitore, non applicata indistintamente a tutto il prodotto.
- **Fornitore B2B:** mostrare soltanto le U.M. di vendita realmente pubblicate per la referenza collegata dal fornitore; se il collegamento non fornisce alcuna U.M., segnalarlo senza inventare alternative o conversioni.
- **Fornitore esterno/non B2B:** consentire di scegliere una U.M. già configurata oppure aggiungerne una nuova alla configurazione della referenza e poi selezionarla. Non userò testo libero non registrato, per evitare doppioni e dati incoerenti.
- Ogni cambio continuerà a passare dai controlli lato server; un equivalente senza fattore di conversione resterà `NULL` e sarà mostrato come «Non convertibile», mai come zero.

## Modifiche previste

- `src/components/shopping/shopping-list-panel.tsx`: unica raccolta, filtri unici, deduplicazione e azioni condivise.
- `src/components/shopping/shopping-list-card.tsx`: stessa scheda completa per «Da valutare» e «In lista», con controlli coerenti per ciascuno stato.
- `src/components/shopping/inventory-to-evaluate.tsx`: mantenere lettura, aggiunta e chiusura valutazione, rimuovendo soltanto la seconda presentazione autonoma.
- `src/components/shopping/supplier-split-dialog.tsx`: scelta U.M. distinta tra fornitore B2B ed esterno.
- File della logica Lista strettamente necessari per leggere le U.M. reali B2B e salvare quelle esterne con i controlli esistenti.
- Eventuale migrazione solo se i dati attuali non consentono di collegare con certezza la referenza B2B alle sue U.M. pubblicate; nessun dato storico sarà riscritto.

## Limiti e sicurezza

- Non modificare Inventario, Fabbisogno, Ordini, Consegne, Carico Merce o semaforo.
- Non cambiare regole di conversione, stati d’ordine o storico chiuso.
- Non creare dati reali durante le verifiche; usare controllo tipi, lettura della logica e prove visive senza salvataggi.
- Verificare Card e Righe alle larghezze già approvate e controllare che non esista più alcun secondo gruppo sotto.

## Rischio già individuato

Oggi il sistema distingue il rapporto B2B, ma le U.M. della referenza acquisto sono configurate dal compratore e non identificano ancora con certezza quelle pubblicate dal venditore. Prima del codice confronterò il collegamento reale con le U.M. di vendita B2B; se manca, applicherò la minima estensione dati necessaria invece di simulare l’informazione nell’interfaccia.
