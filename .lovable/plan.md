# Inventario: allineamento Fabbisogno, giorni di consegna, prezzo e U.M.

## 1. Perché Conteggio e Fabbisogno non coincidono
Sono due elenchi costruiti da fonti diverse:
- Conteggio: prodotti propri + preferiti + articoli dei cataloghi fornitori, ordinati per nome.
- Fabbisogno: solo i prodotti propri con impostazioni di scorta, ordinati per codice.

Risultato: in Fabbisogno vedi i 6 articoli interni (00-001…00-006), in Conteggio anche gli articoli dei cataloghi.

### Correzione proposta (solo lettura, nessun cambio di formule)
- Fabbisogno riceve gli stessi filtri di Conteggio: Preferiti | Tutti, ricerca, e lo stesso ordine alfabetico per descrizione.
- Fabbisogno mostra le stesse righe di Conteggio limitate ai prodotti propri; gli articoli dei cataloghi non ancora adottati restano esclusi (non hanno giacenza né scorta) e vengono indicati con una nota chiara sotto la tabella.
- Le colonne Disponibile / Scorta min. / Necessario / Da acquistare e la formula restano identiche.

## 2. Giorni della settimana / del mese
Già organizzati e non vanno rifatti:
- per fornitore: giorni settimanali + eventuale giorno del mese;
- per singola referenza fornitore: possibilità di sovrascrivere i giorni del fornitore;
- usati nella Lista della Spesa per la prossima consegna utile.
Nessuna modifica prevista qui, salvo mostrare in Fabbisogno il prossimo giorno di consegna del fornitore principale (sola lettura).

## 3. Prezzo e U.M. nell'Inventario
- Nella scheda di conteggio si aggiungono due informazioni attivabili da "Colonne": U.M. e Prezzo di acquisto (ultimo costo o prezzo del listino assegnato).
- U.M. modificabile direttamente dalla scheda: si sceglie tra le unità già configurate per quel prodotto (preferenza d'uso già esistente); non si creano nuove unità dall'Inventario.
- Prezzo: sola lettura nell'Inventario. Il prezzo si gestisce nelle referenze fornitore / listini, come già concordato; dalla scheda si offre un collegamento rapido alla scheda prodotto (tab Acquisto).

## Fuori ambito
Nessuna modifica a database, storico append-only, Non conforme, proposte d'acquisto, formule Fabbisogno, Lista della Spesa, ordini o listini.

## Punto da confermare
Sul prezzo: confermi sola lettura in Inventario con collegamento alla scheda prodotto, oppure vuoi poter modificare il costo d'acquisto direttamente dalla scheda di conteggio (comporterebbe scrittura sui costi fornitore)?
