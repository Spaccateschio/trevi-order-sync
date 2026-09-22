# Inventario: stati del prodotto e cosa aggiungere

Le tue osservazioni sono corrette. Le divido in due gruppi: quello che appartiene al **conteggio** (lo faccio subito) e quello che appartiene alla **lista della spesa / acquisto** (viene dopo il conteggio, sarebbe sbagliato metterlo dentro la scheda di conteggio).

## Gruppo 1 — Conteggio (intervento immediato)

1. **Riapri conteggio su un singolo prodotto**
   Dopo aver confermato una quantità, sulla scheda compare "Riapri" che riporta il prodotto in bozza con la quantità già scritta, pronta da correggere. Serve quando un cliente ha ritirato merce o il prodotto risulta non conforme. Lo storico non viene cancellato: ogni nuova conferma resta registrata, l'ultima vale come quantità valida.

2. **Stato "Da ricontare"**
   Nuovo stato visibile sulla scheda e come filtro accanto a "Da controllare / Completati / Differenze". Un prodotto riaperto finisce lì, così prima di chiudere l'inventario vedi subito cosa resta in sospeso.

3. **Note su più o meno: confermato come è oggi**
   La nota si apre quando la quantità è diversa dalla calcolata; resta obbligatoria con le scorciatoie (merce deteriorata, errore di carico, reso al fornitore, uso interno). Aggiungo la possibilità di scrivere una nota anche quando la quantità coincide (facoltativa), per annotare "prodotto non a norma".

4. **Mai contato e contato a zero → segnale per la spesa**
   Sulla scheda distinguo chiaramente:
   - **Mai contato**: nessuno ha ancora verificato.
   - **Zero verificato**: contato e finito.
   In entrambi i casi appare un segno "da comprare" e, chiudendo l'inventario, questi prodotti vengono proposti in blocco per la lista della spesa (non creata automaticamente: la confermi tu).

5. **Preferito dalla scheda**
   La stella c'è già nella scheda a conteggio aperto; la aggiungo anche nelle schede prima dell'avvio, così togli o metti il preferito senza uscire dall'Inventario.

## Gruppo 2 — Lista della spesa (intervento successivo, da concordare)

Queste tre cose non sono stati dell'inventario, sono decisioni d'acquisto e vanno sulla riga della lista della spesa:

- **Prezzo del fornitore**: già letto dal listino che il fornitore ti ha assegnato; da rendere modificabile sulla riga di spesa quando il prezzo concordato è diverso.
- **Più fornitori in percentuale**: dividere la quantità da comprare fra due o più fornitori (es. 60% / 40%), senza ridistribuzione automatica.
- **Data in cui vuoi la merce**: data richiesta di consegna sulla riga, confrontata con i giorni di consegna del fornitore già impostati.

Propongo di fare prima il Gruppo 1 e poi affrontare il Gruppo 2 con un piano dedicato.

## Dettagli tecnici

- Modifiche a `src/components/inventory/inventory-count-panel.tsx` (azione Riapri sulla scheda, nuovo stato locale `reopened`, filtro aggiuntivo, nota facoltativa, stella nelle schede in bozza) e a `src/lib/inventory-count.functions.ts` (lettura dello stato "da ricontare" e elenco dei prodotti a zero / mai contati alla chiusura).
- Il riconteggio riusa `record_inventory_count`, già append-only: nessuna cancellazione di righe, nessuna nuova tabella.
- Nessuna modifica a database, permessi, RPC, formule di giacenza/fabbisogno, Fabbisogno, ordini, ricevute o FASE A/B/C/D.

## Fuori scope

Nuovo componente grafico condiviso dell'elenco prodotti, listini, unità di misura, Fabbisogno.
